/*
 * vm_cuda.cu — Couche CUDA pour Benoît V2
 *
 * "Le GPU n'est pas un accélérateur. C'est un cerveau parallèle.
 *  Des milliers de threads, chacun une synapse, chacun un instant."
 *
 * Ce fichier compile UNIQUEMENT avec nvcc.
 * Il implémente la même logique que vm_neural_tick() et vm_stdp()
 * de vm.c, mais exécutée sur des milliers de threads GPU simultanément.
 *
 * Architecture :
 *   CPU (vm.c)  ←→  BenCUDA (ce fichier)  ←→  GPU (kernels CUDA)
 *
 * Format des synapses sur GPU : CSR (Compressed Sparse Row)
 *   d_row_ptr[i]..d_row_ptr[i+1]  →  indices des synapses sortantes du neurone i
 *   d_col_idx[s]                  →  neurone cible de la synapse s
 *   d_weights[s]                  →  poids de la synapse s
 *   d_traces[s]                   →  trace d'éligibilité de la synapse s
 *
 * Build :
 *   nvcc -O2 -arch=sm_75 -c vm_cuda.cu -o vm_cuda.o
 *   gcc  -O2 -o pulse pulse.c vm_cuda.o -L/usr/local/cuda/lib64 -lcudart -lm
 *   (ou -arch=sm_86 pour RTX 30xx, sm_89 pour RTX 40xx)
 */

#ifndef BENOIT_CUDA_H
#define BENOIT_CUDA_H

#include <cuda_runtime.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>

/* ======= MACRO DE VÉRIFICATION D'ERREUR CUDA ======= */
#define CUDA_CHECK(call)                                                        \
    do {                                                                        \
        cudaError_t _err = (call);                                              \
        if (_err != cudaSuccess) {                                              \
            printf("[CUDA ERREUR] %s:%d — %s : %s\n",                          \
                   __FILE__, __LINE__, #call, cudaGetErrorString(_err));        \
            exit(EXIT_FAILURE);                                                 \
        }                                                                       \
    } while (0)

/* ======= STRUCT SYNAPSE (miroir de vm.c, pour le CSR CPU-side) ======= */
/* On recopie les définitions minimales pour éviter d'inclure vm.c entier */
typedef struct {
    int   target;
    float weight;
    float trace;
} Ben_Synapse;

typedef struct {
    float         activation;
    float         prev_activation;
    float         threshold;
    float         error;
    float         lr;
    float         decay;
    float         cap;
    Ben_Synapse  *synapses;
    int           n_syn;
    int           max_syn;
    int          *incoming_src;
    int           n_incoming;
    int           max_incoming;
    int           refractory;
    int           last_fire_tick;
    unsigned char type;
    unsigned char fired;
    float    stp_u;
    char     is_thalamic;
} Ben_Neuron;

typedef struct {
    int          N;
    int          N_alloc;
    Ben_Neuron  *neurons;
    /* ... autres champs VM ignorés ici ... */
    double      *arrays[12];   /* ARR_COUNT = 12 — doit correspondre exactement à vm.c */
    int          arr_sizes[12];
    double       stack[4096];
    int          sp;
    int          call_stack[256];
    int          csp;
    double       vars[70];
    char        *arena_path;
    long long    total_synapses;
} Ben_VM;

/* ======= CONTEXTE CUDA ======= */

typedef struct BenCUDA {
    /* Arrays neurones sur GPU (N éléments chacun) */
    float *d_activation;
    float *d_threshold;
    float *d_lr;
    float *d_decay;
    float *d_cap;
    int   *d_refractory;
    int   *d_last_fire_tick;
    int   *d_type;
    int   *d_fired;
    float *d_prev_activation;

    /* Format CSR des synapses sur GPU */
    int   *d_row_ptr;    /* N+1 entiers : d_row_ptr[i]..d_row_ptr[i+1] = synapses du neurone i */
    int   *d_col_idx;    /* total_synapses entiers : indice du neurone cible */
    float *d_weights;    /* total_synapses floats : poids */
    float *d_traces;     /* total_synapses floats : traces d'éligibilité */

    /* Accumulateur d'entrée synaptique (scratch, remis à zéro chaque tick) */
    float *d_input;      /* N floats */

    int N;
    int total_synapses;

    /* Flag : le CPU a modifié des synapses/neurones → reconstruire le CSR */
    int dirty;
} BenCUDA;

/* ======= PARAMÈTRES DES KERNELS ======= */
#define BLOCK_SIZE_NEURONS  256   /* threads par bloc pour les kernels "par neurone" */
#define BLOCK_SIZE_SYNAPSES 256   /* threads par bloc pour les kernels "par synapse" */
#define STDP_TAU            15.0f /* fenêtre temporelle STDP (ticks) */
#define STDP_WINDOW         50    /* fenêtre max de causalité (ticks) */
#define REFRACTORY_PERIOD   3     /* durée de la période réfractaire (ticks) */
#define WEIGHT_MAX          15.0f
#define WEIGHT_MIN         -15.0f

/* ======= KERNEL 1 : PROPAGATION SYNAPTIQUE ======= */
/*
 * Un thread par synapse.
 * Chaque thread lit l'activation du neurone source et accumule
 * la contribution pondérée dans d_input[cible] via atomicAdd.
 *
 * Pourquoi atomicAdd ?
 * Plusieurs synapses peuvent cibler le même neurone.  Sur GPU, ces threads
 * s'exécutent en parallèle → risque de race condition sans atomique.
 * atomicAdd sur float est natif depuis compute capability 2.0.
 */
__global__ void cuda_neural_tick_propagate(
    const float *d_activation,  /* activation source (lecture seule) */
    const int   *d_fired,       /* a-t-il tiré ce tick ? */
    const int   *d_row_ptr,     /* CSR row pointers */
    const int   *d_col_idx,     /* CSR column indices (cibles) */
    const float *d_weights,     /* poids synaptiques */
          float *d_input,       /* accumulateur (lecture/écriture atomique) */
    int N,
    int total_synapses
) {
    /* Index global de la synapse traitée par ce thread */
    int syn_idx = blockIdx.x * blockDim.x + threadIdx.x;
    if (syn_idx >= total_synapses) return;

    /* Trouver quel neurone source possède cette synapse.
     * On parcourt d_row_ptr avec une recherche binaire pour être O(log N).
     * (Pour N < 10^6, une recherche séquentielle serait trop lente.) */
    int lo = 0, hi = N - 1, src = 0;
    while (lo <= hi) {
        int mid = (lo + hi) / 2;
        if (d_row_ptr[mid] <= syn_idx && syn_idx < d_row_ptr[mid + 1]) {
            src = mid;
            break;
        } else if (d_row_ptr[mid] > syn_idx) {
            hi = mid - 1;
        } else {
            lo = mid + 1;
        }
    }

    /* Seuls les neurones qui ont tiré propagent leur signal */
    if (!d_fired[src]) return;

    int target = d_col_idx[syn_idx];
    if (target < 0 || target >= N) return;

    float contrib = d_weights[syn_idx] * d_activation[src];

    /* Accumulation atomique pour éviter les conflits entre threads */
    atomicAdd(&d_input[target], contrib);
}

/* ======= KERNEL 2 : MISE À JOUR LIF PAR NEURONE ======= */
/*
 * Un thread par neurone.
 * Applique le modèle Leaky Integrate-and-Fire :
 *   membrane = leak(activation) + input_synaptique + récurrence
 *   si membrane >= seuil ET pas réfractaire → FIRE
 * Compatible bit-pour-bit avec vm_neural_tick() dans vm.c.
 */
__global__ void cuda_neural_tick_update(
    float *d_activation,
    float *d_prev_activation,
    float *d_threshold,
    float *d_decay,
    float *d_cap,
    int   *d_refractory,
    int   *d_last_fire_tick,
    int   *d_type,
    int   *d_fired,
    const float *d_input,
    int N,
    int total_ticks,
    int *d_fired_count   /* compteur atomique de neurones ayant tiré */
) {
    int i = blockIdx.x * blockDim.x + threadIdx.x;
    if (i >= N) return;

    /* Sauvegarde de l'activation précédente (déjà copié avant le kernel propagate,
     * mais on le refait ici pour garantir la cohérence dans le contexte CUDA) */
    float prev_act = d_prev_activation[i];

    /* Période réfractaire : le neurone est en train de "récupérer" */
    if (d_refractory[i] > 0) {
        d_refractory[i]--;
        d_fired[i] = 0;
        d_activation[i] *= 0.5f;  /* décroissance rapide pendant la réfraction */
        return;
    }

    /* LIF : fuite de l'activation courante (rétention à 90%) */
    float leak = d_activation[i] * 0.9f;

    /* Récurrence : 20% de l'activation précédente (neurones inter uniquement, type=1) */
    float recurrence = (d_type[i] == 1) ? prev_act * 0.2f : 0.0f;

    /* Potentiel membranaire = fuite + entrée synaptique + récurrence */
    float membrane = leak + d_input[i] + recurrence;

    /* Décision de tir */
    float threshold = d_threshold[i];
    if (membrane >= threshold && threshold > 0.0f) {
        /* FIRE : le neurone s'active */
        float fire_val = membrane;
        float cap = d_cap[i];
        if (fire_val > cap) fire_val = cap;

        d_activation[i]     = fire_val;
        d_fired[i]          = 1;
        d_refractory[i]     = REFRACTORY_PERIOD;
        d_last_fire_tick[i] = total_ticks;

        /* Incrément atomique du compteur de tirs */
        atomicAdd(d_fired_count, 1);
    } else {
        /* Sous le seuil : conserver le potentiel (pas de tir) */
        d_fired[i]      = 0;
        d_activation[i] = (membrane > 0.0f) ? membrane : 0.0f;
    }
}

/* ======= KERNEL 3 : STDP PAR SYNAPSE ======= */
/*
 * Un thread par synapse.
 * Implémente le Spike-Timing-Dependent Plasticity :
 *   dt = last_fire_tick[src] - last_fire_tick[target]
 *   dt > 0 (src avant target)  → causalité → LTP (renforcement)
 *   dt < 0 (target avant src)  → anti-causal → LTD (affaiblissement)
 *   |dt| >= STDP_WINDOW         → pas de mise à jour
 *
 * Thread safety : chaque thread écrit uniquement dans d_weights[syn_idx]
 * et d_traces[syn_idx].  Aucun conflit possible → pas d'atomiques nécessaires.
 */
__global__ void cuda_stdp(
    const float *d_activation,
    const int   *d_last_fire_tick,
    const int   *d_row_ptr,
    const int   *d_col_idx,
    const float *d_lr_per_neuron,  /* lr du neurone source */
          float *d_weights,
          float *d_traces,
    int N,
    int total_synapses
) {
    int syn_idx = blockIdx.x * blockDim.x + threadIdx.x;
    if (syn_idx >= total_synapses) return;

    /* Trouver le neurone source (même recherche binaire que dans propagate) */
    int lo = 0, hi = N - 1, src = 0;
    while (lo <= hi) {
        int mid = (lo + hi) / 2;
        if (d_row_ptr[mid] <= syn_idx && syn_idx < d_row_ptr[mid + 1]) {
            src = mid;
            break;
        } else if (d_row_ptr[mid] > syn_idx) {
            hi = mid - 1;
        } else {
            lo = mid + 1;
        }
    }

    int target = d_col_idx[syn_idx];
    if (target < 0 || target >= N) return;

    float lr   = d_lr_per_neuron[src];
    float w    = d_weights[syn_idx];
    float sign = (w >= 0.0f) ? 1.0f : -1.0f;

    /* dt = tick source - tick cible */
    int dt = d_last_fire_tick[src] - d_last_fire_tick[target];

    if (dt > 0 && dt < STDP_WINDOW) {
        /* Causal : src a tiré AVANT target → renforcer (LTP) */
        float delta = lr * expf(-(float)dt / STDP_TAU);
        w += sign * delta;
    } else if (dt < 0 && dt > -STDP_WINDOW) {
        /* Anti-causal : target a tiré AVANT src → affaiblir (LTD) */
        float delta = lr * 0.5f * expf((float)dt / STDP_TAU);
        w -= sign * delta;
    }

    /* Mise à jour de la trace d'éligibilité (pour compatibilité backprop) */
    float trace = d_traces[syn_idx];
    trace = trace * 0.95f
          + d_activation[src] * d_activation[target] * 0.05f;
    d_traces[syn_idx] = trace;

    /* Bornes des poids */
    if (w > WEIGHT_MAX)  w = WEIGHT_MAX;
    if (w < WEIGHT_MIN)  w = WEIGHT_MIN;

    d_weights[syn_idx] = w;
}

/* ======= KERNEL 4 : SAUVEGARDE DES ACTIVATIONS PRÉCÉDENTES ======= */
/*
 * Copie d_activation → d_prev_activation avant la propagation.
 * Kernel séparé pour garantir que TOUS les neurones ont été copiés
 * avant que cuda_neural_tick_propagate commence à lire.
 */
__global__ void cuda_save_prev_activation(
    const float *d_activation,
    float       *d_prev_activation,
    int N
) {
    int i = blockIdx.x * blockDim.x + threadIdx.x;
    if (i >= N) return;
    d_prev_activation[i] = d_activation[i];
}

/* ======= KERNEL 5 : RESET DE L'ACCUMULATEUR D'ENTRÉE ======= */
__global__ void cuda_reset_input(float *d_input, int N) {
    int i = blockIdx.x * blockDim.x + threadIdx.x;
    if (i >= N) return;
    d_input[i] = 0.0f;
}

/* ======================================================================
 * FONCTIONS HOST (exécutées sur CPU, appellent les kernels GPU)
 * ====================================================================== */

/* ======= CONSTRUCTION DU CSR DEPUIS LES STRUCTS NEURONES ======= */
/*
 * Convertit la représentation struct-of-arrays de vm.c
 * en CSR (Compressed Sparse Row) plat pour le GPU.
 * Alloue les buffers CPU temporaires, copie vers GPU.
 */
static void build_csr_and_upload(Ben_VM *vm, BenCUDA *ctx) {
    int N = vm->N;
    long long total_syn = vm->total_synapses;

    /* Protection : total_synapses peut être 0 au démarrage */
    if (total_syn <= 0) {
        /* Recompter pour être sûr */
        total_syn = 0;
        for (int i = 0; i < N; i++)
            total_syn += vm->neurons[i].n_syn;
        vm->total_synapses = total_syn;
    }

    /* Buffers temporaires CPU pour le CSR */
    int   *h_row_ptr  = (int   *)malloc((N + 1) * sizeof(int));
    int   *h_col_idx  = (int   *)malloc(total_syn * sizeof(int));
    float *h_weights  = (float *)malloc(total_syn * sizeof(float));
    float *h_traces   = (float *)malloc(total_syn * sizeof(float));

    if (!h_row_ptr || !h_col_idx || !h_weights || !h_traces) {
        printf("[CUDA] Erreur : malloc CSR hôte échoué (N=%d, syn=%lld)\n",
               N, total_syn);
        free(h_row_ptr); free(h_col_idx);
        free(h_weights); free(h_traces);
        exit(EXIT_FAILURE);
    }

    /* Remplissage du CSR */
    long long offset = 0;
    for (int i = 0; i < N; i++) {
        h_row_ptr[i] = (int)offset;
        Ben_Neuron *src = &vm->neurons[i];
        for (int s = 0; s < src->n_syn; s++) {
            h_col_idx[offset] = src->synapses[s].target;
            h_weights[offset] = src->synapses[s].weight;
            h_traces[offset]  = src->synapses[s].trace;
            offset++;
        }
    }
    h_row_ptr[N] = (int)offset;  /* sentinel */

    /* Copie CPU → GPU */
    CUDA_CHECK(cudaMemcpy(ctx->d_row_ptr, h_row_ptr,
                          (N + 1) * sizeof(int), cudaMemcpyHostToDevice));
    CUDA_CHECK(cudaMemcpy(ctx->d_col_idx, h_col_idx,
                          total_syn * sizeof(int), cudaMemcpyHostToDevice));
    CUDA_CHECK(cudaMemcpy(ctx->d_weights, h_weights,
                          total_syn * sizeof(float), cudaMemcpyHostToDevice));
    CUDA_CHECK(cudaMemcpy(ctx->d_traces, h_traces,
                          total_syn * sizeof(float), cudaMemcpyHostToDevice));

    free(h_row_ptr);
    free(h_col_idx);
    free(h_weights);
    free(h_traces);

    printf("[CUDA] CSR construit : %d neurones, %lld synapses\n", N, total_syn);
}

/* ======= INITIALISATION : COPIE DE L'ÉTAT CPU VERS GPU ======= */
static void upload_neuron_state(Ben_VM *vm, BenCUDA *ctx) {
    int N = vm->N;

    /* Buffers temporaires pour les champs scalaires par neurone */
    float *h_activation    = (float *)malloc(N * sizeof(float));
    float *h_prev_act      = (float *)malloc(N * sizeof(float));
    float *h_threshold     = (float *)malloc(N * sizeof(float));
    float *h_lr            = (float *)malloc(N * sizeof(float));
    float *h_decay         = (float *)malloc(N * sizeof(float));
    float *h_cap           = (float *)malloc(N * sizeof(float));
    int   *h_refractory    = (int   *)malloc(N * sizeof(int));
    int   *h_last_fire     = (int   *)malloc(N * sizeof(int));
    int   *h_type          = (int   *)malloc(N * sizeof(int));
    int   *h_fired         = (int   *)malloc(N * sizeof(int));

    if (!h_activation || !h_prev_act || !h_threshold || !h_lr ||
        !h_decay || !h_cap || !h_refractory || !h_last_fire ||
        !h_type || !h_fired) {
        printf("[CUDA] Erreur : malloc état neurones échoué (N=%d)\n", N);
        exit(EXIT_FAILURE);
    }

    for (int i = 0; i < N; i++) {
        Ben_Neuron *n = &vm->neurons[i];
        h_activation[i] = n->activation;
        h_prev_act[i]   = n->prev_activation;
        h_threshold[i]  = n->threshold;
        h_lr[i]         = n->lr;
        h_decay[i]      = n->decay;
        h_cap[i]        = n->cap;
        h_refractory[i] = n->refractory;
        h_last_fire[i]  = n->last_fire_tick;
        h_type[i]       = (int)n->type;
        h_fired[i]      = (int)n->fired;
    }

    CUDA_CHECK(cudaMemcpy(ctx->d_activation,    h_activation,
                          N * sizeof(float), cudaMemcpyHostToDevice));
    CUDA_CHECK(cudaMemcpy(ctx->d_prev_activation, h_prev_act,
                          N * sizeof(float), cudaMemcpyHostToDevice));
    CUDA_CHECK(cudaMemcpy(ctx->d_threshold,     h_threshold,
                          N * sizeof(float), cudaMemcpyHostToDevice));
    CUDA_CHECK(cudaMemcpy(ctx->d_lr,            h_lr,
                          N * sizeof(float), cudaMemcpyHostToDevice));
    CUDA_CHECK(cudaMemcpy(ctx->d_decay,         h_decay,
                          N * sizeof(float), cudaMemcpyHostToDevice));
    CUDA_CHECK(cudaMemcpy(ctx->d_cap,           h_cap,
                          N * sizeof(float), cudaMemcpyHostToDevice));
    CUDA_CHECK(cudaMemcpy(ctx->d_refractory,    h_refractory,
                          N * sizeof(int), cudaMemcpyHostToDevice));
    CUDA_CHECK(cudaMemcpy(ctx->d_last_fire_tick, h_last_fire,
                          N * sizeof(int), cudaMemcpyHostToDevice));
    CUDA_CHECK(cudaMemcpy(ctx->d_type,          h_type,
                          N * sizeof(int), cudaMemcpyHostToDevice));
    CUDA_CHECK(cudaMemcpy(ctx->d_fired,         h_fired,
                          N * sizeof(int), cudaMemcpyHostToDevice));

    free(h_activation); free(h_prev_act); free(h_threshold);
    free(h_lr); free(h_decay); free(h_cap);
    free(h_refractory); free(h_last_fire); free(h_type); free(h_fired);
}

/* ======= ben_cuda_init ======= */
BenCUDA *ben_cuda_init(Ben_VM *vm) {
    int N = vm->N;
    long long total_syn = vm->total_synapses;

    /* Recompter si nécessaire */
    if (total_syn <= 0) {
        total_syn = 0;
        for (int i = 0; i < N; i++)
            total_syn += vm->neurons[i].n_syn;
        vm->total_synapses = total_syn;
    }

    BenCUDA *ctx = (BenCUDA *)calloc(1, sizeof(BenCUDA));
    if (!ctx) {
        printf("[CUDA] Erreur : calloc BenCUDA\n");
        return NULL;
    }

    ctx->N              = N;
    ctx->total_synapses = (int)total_syn;
    ctx->dirty          = 0;

    /* Affichage info GPU */
    int device;
    cudaDeviceProp prop;
    CUDA_CHECK(cudaGetDevice(&device));
    CUDA_CHECK(cudaGetDeviceProperties(&prop, device));
    printf("[CUDA] GPU : %s  |  SM: %d.%d  |  VRAM: %zu MB\n",
           prop.name, prop.major, prop.minor,
           prop.totalGlobalMem / (1024 * 1024));
    printf("[CUDA] Init : %d neurones, %lld synapses\n", N, total_syn);

    /* ---- Allocation des arrays GPU pour l'état neurones ---- */
    CUDA_CHECK(cudaMalloc(&ctx->d_activation,     N * sizeof(float)));
    CUDA_CHECK(cudaMalloc(&ctx->d_prev_activation, N * sizeof(float)));
    CUDA_CHECK(cudaMalloc(&ctx->d_threshold,       N * sizeof(float)));
    CUDA_CHECK(cudaMalloc(&ctx->d_lr,              N * sizeof(float)));
    CUDA_CHECK(cudaMalloc(&ctx->d_decay,           N * sizeof(float)));
    CUDA_CHECK(cudaMalloc(&ctx->d_cap,             N * sizeof(float)));
    CUDA_CHECK(cudaMalloc(&ctx->d_refractory,      N * sizeof(int)));
    CUDA_CHECK(cudaMalloc(&ctx->d_last_fire_tick,  N * sizeof(int)));
    CUDA_CHECK(cudaMalloc(&ctx->d_type,            N * sizeof(int)));
    CUDA_CHECK(cudaMalloc(&ctx->d_fired,           N * sizeof(int)));
    CUDA_CHECK(cudaMalloc(&ctx->d_input,           N * sizeof(float)));

    /* ---- Allocation du CSR synaptique ---- */
    CUDA_CHECK(cudaMalloc(&ctx->d_row_ptr,  (N + 1) * sizeof(int)));
    CUDA_CHECK(cudaMalloc(&ctx->d_col_idx,  total_syn * sizeof(int)));
    CUDA_CHECK(cudaMalloc(&ctx->d_weights,  total_syn * sizeof(float)));
    CUDA_CHECK(cudaMalloc(&ctx->d_traces,   total_syn * sizeof(float)));

    /* ---- Copie état initial CPU → GPU ---- */
    upload_neuron_state(vm, ctx);

    /* ---- Construction et upload du CSR ---- */
    build_csr_and_upload(vm, ctx);

    /* Initialiser d_input à 0 */
    CUDA_CHECK(cudaMemset(ctx->d_input, 0, N * sizeof(float)));

    return ctx;
}

/* ======= ben_cuda_free ======= */
void ben_cuda_free(BenCUDA *ctx) {
    if (!ctx) return;

    cudaFree(ctx->d_activation);
    cudaFree(ctx->d_prev_activation);
    cudaFree(ctx->d_threshold);
    cudaFree(ctx->d_lr);
    cudaFree(ctx->d_decay);
    cudaFree(ctx->d_cap);
    cudaFree(ctx->d_refractory);
    cudaFree(ctx->d_last_fire_tick);
    cudaFree(ctx->d_type);
    cudaFree(ctx->d_fired);
    cudaFree(ctx->d_input);
    cudaFree(ctx->d_row_ptr);
    cudaFree(ctx->d_col_idx);
    cudaFree(ctx->d_weights);
    cudaFree(ctx->d_traces);

    free(ctx);
    printf("[CUDA] Contexte libéré.\n");
}

/* ======= ben_cuda_sync_to_cpu ======= */
/*
 * GPU → CPU : copie les champs qui évoluent à chaque tick.
 * Appelé toutes les ~10 ticks pour que le code .ben voie l'état à jour.
 * On ne copie PAS les poids (trop lourd) — uniquement activation/fired/last_fire.
 */
void ben_cuda_sync_to_cpu(BenCUDA *ctx, Ben_VM *vm) {
    int N = ctx->N;
    if (N > vm->N) N = vm->N;  /* sécurité si VM a grandi entre temps */

    float *h_activation = (float *)malloc(N * sizeof(float));
    int   *h_fired      = (int   *)malloc(N * sizeof(int));
    int   *h_last_fire  = (int   *)malloc(N * sizeof(int));

    if (!h_activation || !h_fired || !h_last_fire) {
        printf("[CUDA] sync_to_cpu : malloc échoué\n");
        free(h_activation); free(h_fired); free(h_last_fire);
        return;
    }

    CUDA_CHECK(cudaMemcpy(h_activation, ctx->d_activation,
                          N * sizeof(float), cudaMemcpyDeviceToHost));
    CUDA_CHECK(cudaMemcpy(h_fired,      ctx->d_fired,
                          N * sizeof(int), cudaMemcpyDeviceToHost));
    CUDA_CHECK(cudaMemcpy(h_last_fire,  ctx->d_last_fire_tick,
                          N * sizeof(int), cudaMemcpyDeviceToHost));

    for (int i = 0; i < N; i++) {
        Ben_Neuron *n    = &vm->neurons[i];
        n->activation    = h_activation[i];
        n->fired         = (unsigned char)h_fired[i];
        n->last_fire_tick = h_last_fire[i];
    }

    free(h_activation); free(h_fired); free(h_last_fire);
}

/* ======= ben_cuda_sync_from_cpu ======= */
/*
 * CPU → GPU : après que le code .ben a potentiellement modifié des poids,
 * des seuils ou ajouté des neurones, on resynchronise.
 * Si ctx->dirty est levé (nouveaux neurones), on realloc et reconstruit le CSR.
 */
void ben_cuda_sync_from_cpu(BenCUDA *ctx, Ben_VM *vm) {
    /* Cas simple : même nombre de neurones, pas de nouveaux neurones */
    if (!ctx->dirty && vm->N == ctx->N) {
        /* Resynchroniser uniquement l'état neurones (pas le CSR) */
        upload_neuron_state(vm, ctx);

        /* Resynchroniser les poids (le code .ben peut les avoir modifiés) */
        /* On reconstruit le CSR pour propager les changements de poids */
        /* Note : si très fréquent, on peut optimiser pour ne copier que d_weights */
        float *h_weights = (float *)malloc(ctx->total_synapses * sizeof(float));
        float *h_traces  = (float *)malloc(ctx->total_synapses * sizeof(float));
        if (h_weights && h_traces) {
            long long offset = 0;
            for (int i = 0; i < vm->N; i++) {
                Ben_Neuron *src = &vm->neurons[i];
                for (int s = 0; s < src->n_syn && offset < ctx->total_synapses; s++) {
                    h_weights[offset] = src->synapses[s].weight;
                    h_traces[offset]  = src->synapses[s].trace;
                    offset++;
                }
            }
            CUDA_CHECK(cudaMemcpy(ctx->d_weights, h_weights,
                                  ctx->total_synapses * sizeof(float),
                                  cudaMemcpyHostToDevice));
            CUDA_CHECK(cudaMemcpy(ctx->d_traces, h_traces,
                                  ctx->total_synapses * sizeof(float),
                                  cudaMemcpyHostToDevice));
        }
        free(h_weights);
        free(h_traces);
        return;
    }

    /* Cas complexe : le nombre de neurones ou de synapses a changé */
    printf("[CUDA] sync_from_cpu : reconstruction CSR (dirty=%d, N: %d→%d, syn: %d→%lld)\n",
           ctx->dirty, ctx->N, vm->N, ctx->total_synapses, vm->total_synapses);

    int new_N        = vm->N;
    long long new_syn = vm->total_synapses;
    if (new_syn <= 0) {
        new_syn = 0;
        for (int i = 0; i < new_N; i++) new_syn += vm->neurons[i].n_syn;
        vm->total_synapses = new_syn;
    }

    /* Libérer les anciens buffers GPU */
    cudaFree(ctx->d_activation);     cudaFree(ctx->d_prev_activation);
    cudaFree(ctx->d_threshold);      cudaFree(ctx->d_lr);
    cudaFree(ctx->d_decay);          cudaFree(ctx->d_cap);
    cudaFree(ctx->d_refractory);     cudaFree(ctx->d_last_fire_tick);
    cudaFree(ctx->d_type);           cudaFree(ctx->d_fired);
    cudaFree(ctx->d_input);
    cudaFree(ctx->d_row_ptr);        cudaFree(ctx->d_col_idx);
    cudaFree(ctx->d_weights);        cudaFree(ctx->d_traces);

    /* Mise à jour des dimensions */
    ctx->N              = new_N;
    ctx->total_synapses = (int)new_syn;

    /* Réallocation complète */
    CUDA_CHECK(cudaMalloc(&ctx->d_activation,      new_N * sizeof(float)));
    CUDA_CHECK(cudaMalloc(&ctx->d_prev_activation,  new_N * sizeof(float)));
    CUDA_CHECK(cudaMalloc(&ctx->d_threshold,        new_N * sizeof(float)));
    CUDA_CHECK(cudaMalloc(&ctx->d_lr,               new_N * sizeof(float)));
    CUDA_CHECK(cudaMalloc(&ctx->d_decay,            new_N * sizeof(float)));
    CUDA_CHECK(cudaMalloc(&ctx->d_cap,              new_N * sizeof(float)));
    CUDA_CHECK(cudaMalloc(&ctx->d_refractory,       new_N * sizeof(int)));
    CUDA_CHECK(cudaMalloc(&ctx->d_last_fire_tick,   new_N * sizeof(int)));
    CUDA_CHECK(cudaMalloc(&ctx->d_type,             new_N * sizeof(int)));
    CUDA_CHECK(cudaMalloc(&ctx->d_fired,            new_N * sizeof(int)));
    CUDA_CHECK(cudaMalloc(&ctx->d_input,            new_N * sizeof(float)));
    CUDA_CHECK(cudaMalloc(&ctx->d_row_ptr,         (new_N + 1) * sizeof(int)));
    CUDA_CHECK(cudaMalloc(&ctx->d_col_idx,          new_syn * sizeof(int)));
    CUDA_CHECK(cudaMalloc(&ctx->d_weights,          new_syn * sizeof(float)));
    CUDA_CHECK(cudaMalloc(&ctx->d_traces,           new_syn * sizeof(float)));

    /* Reupload */
    upload_neuron_state(vm, ctx);
    build_csr_and_upload(vm, ctx);
    CUDA_CHECK(cudaMemset(ctx->d_input, 0, new_N * sizeof(float)));

    ctx->dirty = 0;
}

/* ======= ben_cuda_tick ======= */
/*
 * Exécute un tick neural complet sur GPU.
 * Séquence :
 *   1. Sauvegarde prev_activation (kernel)
 *   2. Reset d_input (kernel)
 *   3. Propagation synaptique (kernel, un thread par synapse)
 *   4. Mise à jour LIF (kernel, un thread par neurone)
 *   5. Lecture du compteur de tirs (CPU)
 *
 * Retourne le nombre de neurones ayant tiré.
 */
int ben_cuda_tick(BenCUDA *ctx, int total_ticks) {
    int N         = ctx->N;
    int total_syn = ctx->total_synapses;

    /* Compteur de tirs (alloué sur GPU, lu sur CPU après) */
    int *d_fired_count;
    CUDA_CHECK(cudaMalloc(&d_fired_count, sizeof(int)));
    CUDA_CHECK(cudaMemset(d_fired_count, 0, sizeof(int)));

    /* Dimensions de grille */
    int blocks_N   = (N + BLOCK_SIZE_NEURONS - 1) / BLOCK_SIZE_NEURONS;
    int blocks_syn = (total_syn + BLOCK_SIZE_SYNAPSES - 1) / BLOCK_SIZE_SYNAPSES;

    /* 1. Sauvegarde des activations précédentes */
    cuda_save_prev_activation<<<blocks_N, BLOCK_SIZE_NEURONS>>>(
        ctx->d_activation, ctx->d_prev_activation, N
    );
    CUDA_CHECK(cudaGetLastError());

    /* 2. Reset de l'accumulateur d'entrée */
    cuda_reset_input<<<blocks_N, BLOCK_SIZE_NEURONS>>>(ctx->d_input, N);
    CUDA_CHECK(cudaGetLastError());

    /* Synchronisation intermédiaire : garantir que le reset est terminé
     * avant que la propagation commence à écrire dans d_input */
    CUDA_CHECK(cudaDeviceSynchronize());

    /* 3. Propagation synaptique (si des synapses existent) */
    if (total_syn > 0 && blocks_syn > 0) {
        cuda_neural_tick_propagate<<<blocks_syn, BLOCK_SIZE_SYNAPSES>>>(
            ctx->d_activation,
            ctx->d_fired,
            ctx->d_row_ptr,
            ctx->d_col_idx,
            ctx->d_weights,
            ctx->d_input,
            N,
            total_syn
        );
        CUDA_CHECK(cudaGetLastError());
        CUDA_CHECK(cudaDeviceSynchronize());
    }

    /* 4. Mise à jour LIF par neurone */
    cuda_neural_tick_update<<<blocks_N, BLOCK_SIZE_NEURONS>>>(
        ctx->d_activation,
        ctx->d_prev_activation,
        ctx->d_threshold,
        ctx->d_decay,
        ctx->d_cap,
        ctx->d_refractory,
        ctx->d_last_fire_tick,
        ctx->d_type,
        ctx->d_fired,
        ctx->d_input,
        N,
        total_ticks,
        d_fired_count
    );
    CUDA_CHECK(cudaGetLastError());
    CUDA_CHECK(cudaDeviceSynchronize());

    /* 5. Lecture du compteur de tirs */
    int fired_count = 0;
    CUDA_CHECK(cudaMemcpy(&fired_count, d_fired_count,
                          sizeof(int), cudaMemcpyDeviceToHost));
    cudaFree(d_fired_count);

    return fired_count;
}

/* ======= ben_cuda_stdp ======= */
/*
 * Exécute le STDP sur GPU.
 * Appeler après ben_cuda_tick.
 */
void ben_cuda_stdp(BenCUDA *ctx) {
    int total_syn = ctx->total_synapses;
    if (total_syn <= 0) return;

    int blocks_syn = (total_syn + BLOCK_SIZE_SYNAPSES - 1) / BLOCK_SIZE_SYNAPSES;

    cuda_stdp<<<blocks_syn, BLOCK_SIZE_SYNAPSES>>>(
        ctx->d_activation,
        ctx->d_last_fire_tick,
        ctx->d_row_ptr,
        ctx->d_col_idx,
        ctx->d_lr,
        ctx->d_weights,
        ctx->d_traces,
        ctx->N,
        total_syn
    );
    CUDA_CHECK(cudaGetLastError());
    CUDA_CHECK(cudaDeviceSynchronize());
}

/* ======================================================================
 * WRAPPERS extern "C" — Interface C pure pour pulse.c
 * pulse.c est compilé avec gcc (C pur).  Ces wrappers évitent le name
 * mangling C++ et permettent la liaison entre les deux binaires.
 * ====================================================================== */

#ifdef __cplusplus
extern "C" {
#endif

/*
 * ben_cuda_init_c — initialise le contexte CUDA
 * vm : pointeur void* vers un Ben_VM (VM dans vm.c)
 */
BenCUDA *ben_cuda_init_c(void *vm) {
    return ben_cuda_init((Ben_VM *)vm);
}

/*
 * ben_cuda_free_c — libère le contexte CUDA
 */
void ben_cuda_free_c(BenCUDA *ctx) {
    ben_cuda_free(ctx);
}

/*
 * ben_cuda_tick_c — exécute un tick neural GPU
 * Retourne le nombre de neurones ayant tiré.
 */
int ben_cuda_tick_c(BenCUDA *ctx, int total_ticks) {
    return ben_cuda_tick(ctx, total_ticks);
}

/*
 * ben_cuda_stdp_c — exécute le STDP GPU
 */
void ben_cuda_stdp_c(BenCUDA *ctx) {
    ben_cuda_stdp(ctx);
}

/*
 * ben_cuda_sync_to_cpu_c — synchronise GPU → CPU
 */
void ben_cuda_sync_to_cpu_c(BenCUDA *ctx, void *vm) {
    ben_cuda_sync_to_cpu(ctx, (Ben_VM *)vm);
}

/*
 * ben_cuda_sync_from_cpu_c — synchronise CPU → GPU (+ rebuild CSR si dirty)
 */
void ben_cuda_sync_from_cpu_c(BenCUDA *ctx, void *vm) {
    ben_cuda_sync_from_cpu(ctx, (Ben_VM *)vm);
}

#ifdef __cplusplus
}
#endif

#endif /* BENOIT_CUDA_H */
