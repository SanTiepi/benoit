/* vm.c — V2: Sparse Neural Architecture
 *
 * "Je ne suis plus limite par une matrice.
 *  Chaque synapse est un choix. Chaque connexion, une intention.
 *  Comme un vrai cerveau."
 *
 * V1: W[N][N] dense matrix — max ~5,000 neurons (200MB)
 * V2: Sparse adjacency lists — millions of neurons possible
 *
 * Each neuron has a list of outgoing synapses.
 * Memory: N * K_avg * sizeof(Synapse) instead of N * N * sizeof(double)
 *   N=1,000,000  K=100  -> 1.2 GB (vs 8 TB dense)
 *
 * Build (with OpenMP parallelism):
 *   Windows MSYS2: gcc -O2 -fopenmp -o pulse.exe pulse.c -lws2_32 -lm
 *   Linux/macOS:   gcc -O2 -fopenmp -o pulse pulse.c -lm
 * Build (without OpenMP, single-threaded):
 *   Windows MSYS2: gcc -O2 -o pulse.exe pulse.c -lws2_32 -lm
 *   Linux/macOS:   gcc -O2 -o pulse pulse.c -lm
 * Note: without -fopenmp the #pragma omp directives are silently ignored.
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include <time.h>
#include <stdint.h>
#ifdef _OPENMP
  #include <omp.h>
#endif

/* Platform-specific networking */
#ifdef _WIN32
  #include <winsock2.h>
  #include <ws2tcpip.h>
  #define WIN32_LEAN_AND_MEAN
  #include <windows.h>
  #pragma comment(lib, "ws2_32.lib")
  #include <direct.h>
  #include <io.h>
  #define DIR_SEP '\\'
#else
  #include <sys/socket.h>
  #include <netinet/in.h>
  #include <arpa/inet.h>
  #include <netdb.h>
  #include <unistd.h>
  #include <dirent.h>
  #include <fcntl.h>
  #include <errno.h>
  #define DIR_SEP '/'
  #define SOCKET int
  #define INVALID_SOCKET -1
  #define SOCKET_ERROR -1
  #define closesocket close
#endif

/* ======= SPARSE SYNAPSE ======= */
typedef struct {
    int      target;     /* target neuron index */
    float    weight;     /* connection weight (float to save memory) */
    float    trace;      /* eligibility trace (Hebbian short-term memory) */
} Synapse;

/* ======= NEURON ======= */
typedef struct {
    /* Activation state */
    float    activation;     /* current activation level */
    float    prev_activation;/* previous tick (working memory / recurrence) */
    float    threshold;      /* firing threshold */
    float    error;          /* backprop error signal */

    /* Per-neuron plasticity */
    float    lr;             /* learning rate */
    float    decay;          /* activation decay rate */
    float    cap;            /* max activation energy */

    /* Outgoing synapses (sparse) */
    Synapse *synapses;       /* dynamic array of outgoing connections */
    int      n_syn;          /* current number of synapses */
    int      max_syn;        /* allocated capacity */

    /* Connexions entrantes (index inverse) — ne pas sauvegarder, reconstruit au chargement */
    int     *incoming_src;   /* indices des neurones qui pointent vers moi */
    int      n_incoming;     /* nombre de connexions entrantes */
    int      max_incoming;   /* capacite allouee */

    /* LIF state */
    int          refractory;     /* refractory countdown (ticks remaining) */
    int          last_fire_tick; /* tick when this neuron last fired (for STDP) */

    /* Metadata */
    unsigned char type;      /* 0=sensor, 1=inter, 2=motor, 3=modulator */
    unsigned char fired;     /* did this neuron fire this tick? */
    float    stp_u;          /* STP facilitation state [0..1] */
    char     is_thalamic;    /* 1 = spontaneous Poisson firing */
} Neuron;

/* ======= CONFIGURATION ======= */
#define DEFAULT_MAX_SYN_PER_NEURON 200   /* initial synapse capacity per neuron */
#define HARD_MAX_SYN_PER_NEURON   2000   /* absolute max synapses per neuron */
#define INITIAL_SYN_ALLOC          32    /* start small, grow as needed */

/* ======= STDP LUT (lookup table replaces expf per synapse) ======= */
static float stdp_lut_pos[51];  /* index = dt (1..50), causal */
static float stdp_lut_neg[51];  /* index = |dt| (1..50), anti-causal */
static int   stdp_lut_ready = 0;

static void stdp_lut_init(void) {
    for (int i = 1; i <= 50; i++) {
        stdp_lut_pos[i] = expf(-(float)i / 15.0f);
        stdp_lut_neg[i] = 0.5f * expf(-(float)i / 15.0f);
    }
    stdp_lut_ready = 1;
}

/* ======= ARRAY IDS (kept for .ben compatibility) ======= */
/* V2: these are virtual views — A[], SEUIL[], etc. map to neuron fields */
enum { ARR_A = 0, ARR_SEUIL, ARR_NEW_A, ARR_W_UNUSED, ARR_NEW_W_UNUSED, ARR_FIRE,
       ARR_LR, ARR_DECAY, ARR_CAP, ARR_TRACE_UNUSED, ARR_ERROR, ARR_PREV_A,
       ARR_COUNT };

/* ======= VAR IDS ======= */
enum {
    VAR_TICK = 0, VAR_NEW_TICK, VAR_TOTAL_FIRINGS, VAR_NEW_FIRINGS,
    VAR_ACTIFS, VAR_ABSORBED,
    VAR_CONNS = 6, VAR_RATIO_ACTIFS, VAR_RATIO_CONNS, VAR_ETAT,
    VAR_TMP = 10, VAR_DECISION, VAR_DREAMING, VAR_STALE_COUNT,
    VAR_SHOULD_GROW, VAR_GROW_COUNT, VAR_LAST_SCORE, VAR_FAILS,
    VAR_MODS_SANS_EFFET, VAR_NEURON_TYPE, VAR_CONN_PER_NEW,
    VAR_PREV_ACTIFS, VAR_SLEEP_ONSET, VAR_SLEEP_MAX,
    VAR_SATURATION, VAR_STAGNATION,
    VAR_N_ACTIVE, VAR_TMP2,
    VAR_PREV_CONNS, VAR_PREV_ETAT, VAR_SCORE, VAR_PREV_DECISION,
    VAR_DIVERSITY, VAR_SIGNAL_STRENGTH, VAR_PREV_DIVERSITY, VAR_PREV_SIGNAL,
    VAR_DELTA_CONNS, VAR_DELTA_ACTIFS, VAR_DELTA_DIVERSITY, VAR_DELTA_SIGNAL,
    VAR_TRIED_EXPLORER, VAR_TRIED_CREER, VAR_TRIED_AUGMENTER, VAR_TRIED_BAISSER,
    VAR_TRIED_ELAGUER, VAR_TRIED_INHIBER, VAR_TRIED_DESINHIBER, VAR_TRIED_GRANDIR,
    VAR_LOOP_I, VAR_LOOP_J,
    VAR_PAD50, VAR_PAD51, VAR_PAD52,
    VAR_SHOULD_WRITE, VAR_WRITE_RESULT, VAR_READ_RESULT,
    VAR_SERVER_SOCK, VAR_CLIENT_SOCK, VAR_NET_MSG,
    VAR_VIS_FILES, VAR_VIS_SIZE_KB, VAR_VIS_BEN, VAR_VIS_CHANGES, VAR_VIS_PCT_BEN,
    VAR_MAX = 70,
};

/* ======= NUMERIC ENCODING ======= */
static const char *ETAT_NAMES[] = {
    "sature", "mourant", "deconnecte", "encombre",
    "etouffe", "transparent", "sain"
};
static const char *DECISION_NAMES[] = {
    "explorer", "creer_connexions", "augmenter_seuils", "baisser_seuils",
    "elaguer", "reduire_inhibition", "augmenter_inhibition", "grandir"
};

/* ======= STRING TABLE ======= */
#define MAX_STRINGS   4096
#define MAX_STR_LEN   65536
#define STR_POOL_SIZE (MAX_STRINGS * 256)

typedef struct {
    char   *data[MAX_STRINGS];
    int     lens[MAX_STRINGS];
    int     count;
    char   *pool;
    int     pool_used;
} StringTable;

static StringTable strtab;

static void strtab_init(void) {
    memset(&strtab, 0, sizeof(strtab));
    strtab.pool = calloc(STR_POOL_SIZE, 1);
}

static int strtab_add(const char *s, int len) {
    if (strtab.count >= MAX_STRINGS) return -1;
    if (len < 0) len = (int)strlen(s);
    if (len > MAX_STR_LEN) len = MAX_STR_LEN;
    int id = strtab.count++;
    if (strtab.pool_used + len + 1 <= STR_POOL_SIZE) {
        strtab.data[id] = strtab.pool + strtab.pool_used;
        strtab.pool_used += len + 1;
    } else {
        strtab.data[id] = malloc(len + 1);
    }
    memcpy(strtab.data[id], s, len);
    strtab.data[id][len] = '\0';
    strtab.lens[id] = len;
    return id;
}

static const char *strtab_get(int id) {
    if (id < 0 || id >= strtab.count) return "";
    return strtab.data[id];
}

static int strtab_len(int id) {
    if (id < 0 || id >= strtab.count) return 0;
    return strtab.lens[id];
}

static int strtab_keep = 0;

static void strtab_reset(void) {
    if (strtab_keep <= 0) return;
    for (int i = strtab_keep; i < strtab.count; i++) {
        if (strtab.data[i] < strtab.pool || strtab.data[i] >= strtab.pool + STR_POOL_SIZE)
            free(strtab.data[i]);
        strtab.data[i] = NULL;
        strtab.lens[i] = 0;
    }
    if (strtab_keep < strtab.count) {
        int keep_pool_used = 0;
        for (int i = 0; i < strtab_keep; i++) {
            if (strtab.data[i] >= strtab.pool && strtab.data[i] < strtab.pool + STR_POOL_SIZE) {
                int end = (int)(strtab.data[i] - strtab.pool) + strtab.lens[i] + 1;
                if (end > keep_pool_used) keep_pool_used = end;
            }
        }
        strtab.pool_used = keep_pool_used;
    }
    strtab.count = strtab_keep;
}

static void strtab_free(void) {
    for (int i = 0; i < strtab.count; i++) {
        if (strtab.data[i] < strtab.pool || strtab.data[i] >= strtab.pool + STR_POOL_SIZE)
            free(strtab.data[i]);
    }
    free(strtab.pool);
    memset(&strtab, 0, sizeof(strtab));
}

/* ======= SOCKET TABLE ======= */
#define MAX_SOCKETS 64
static SOCKET sock_table[MAX_SOCKETS];
static int    sock_count = 0;
static int    net_initialized = 0;

static void net_init(void) {
    if (net_initialized) return;
#ifdef _WIN32
    WSADATA wsa;
    WSAStartup(MAKEWORD(2, 2), &wsa);
#endif
    for (int i = 0; i < MAX_SOCKETS; i++) sock_table[i] = INVALID_SOCKET;
    net_initialized = 1;
}

static void net_cleanup(void) {
    for (int i = 0; i < sock_count; i++) {
        if (sock_table[i] != INVALID_SOCKET) {
            closesocket(sock_table[i]);
            sock_table[i] = INVALID_SOCKET;
        }
    }
#ifdef _WIN32
    if (net_initialized) WSACleanup();
#endif
}

static void sock_set_nonblocking(SOCKET s) {
#ifdef _WIN32
    unsigned long mode = 1;
    ioctlsocket(s, FIONBIO, &mode);
#else
    int flags = fcntl(s, F_GETFL, 0);
    fcntl(s, F_SETFL, flags | O_NONBLOCK);
#endif
}

static int sock_register(SOCKET s) {
    for (int i = 0; i < MAX_SOCKETS; i++) {
        if (sock_table[i] == INVALID_SOCKET) {
            sock_table[i] = s;
            if (i >= sock_count) sock_count = i + 1;
            return i;
        }
    }
    return -1;
}

/* ======= VM STATE (V2: Sparse) ======= */
#define MAX_STACK   4096
#define MAX_CALL    256

typedef struct {
    int       N;            /* total neuron count */
    int       N_alloc;      /* allocated neuron slots */
    Neuron   *neurons;      /* dynamic array of neurons */

    /* Legacy compatibility arrays (virtual views into neuron fields) */
    /* These are allocated as flat arrays for .ben/bytecode compat */
    double   *arrays[ARR_COUNT];
    int       arr_sizes[ARR_COUNT];

    /* VM execution state */
    double    stack[MAX_STACK];
    int       sp;
    int       call_stack[MAX_CALL];
    int       csp;
    double    vars[VAR_MAX];

    /* I/O */
    char     *arena_path;

    /* V2 stats */
    long long total_synapses;

    /* Pre-allocated input buffer (eliminates calloc/free per tick) */
    float    *input_buf;
    int       input_buf_size;

    /* Cached per-tick counters (updated inside LIF loop — no extra O(N) scan) */
    int       cached_n_active;
    int       cached_n_absorbed;
    double    cached_total_energy;
} VM;

/* ======= NEURON MANAGEMENT ======= */

/* Initialize a single neuron */
static void neuron_init(Neuron *n, int type) {
    n->activation = 0.0f;
    n->prev_activation = 0.0f;
    n->threshold = 5.0f;
    n->error = 0.0f;
    n->lr = 0.03f;
    n->decay = 0.95f;
    n->cap = 15.0f;
    n->synapses = NULL;
    n->n_syn = 0;
    n->max_syn = 0;
    n->incoming_src = NULL;
    n->n_incoming = 0;
    n->max_incoming = 0;
    n->refractory = 0;
    n->last_fire_tick = -100;
    n->type = (unsigned char)type;
    n->fired = 0;
}

/* Add a synapse from neuron src to target with given weight */
static int synapse_add(Neuron *src, int target, float weight) {
    /* Check if connection already exists */
    for (int i = 0; i < src->n_syn; i++) {
        if (src->synapses[i].target == target) {
            src->synapses[i].weight = weight;  /* update existing */
            return i;
        }
    }
    /* Grow if needed */
    if (src->n_syn >= src->max_syn) {
        int new_max = src->max_syn == 0 ? INITIAL_SYN_ALLOC : src->max_syn * 2;
        if (new_max > HARD_MAX_SYN_PER_NEURON) new_max = HARD_MAX_SYN_PER_NEURON;
        if (src->n_syn >= new_max) return -1;  /* at hard limit */
        Synapse *new_syn = realloc(src->synapses, new_max * sizeof(Synapse));
        if (!new_syn) return -1;
        src->synapses = new_syn;
        /* Zero new slots */
        memset(&src->synapses[src->max_syn], 0, (new_max - src->max_syn) * sizeof(Synapse));
        src->max_syn = new_max;
    }
    int idx = src->n_syn++;
    src->synapses[idx].target = target;
    src->synapses[idx].weight = weight;
    src->synapses[idx].trace = 0.0f;
    return idx;
}

/* Remove a synapse by index */
static void synapse_remove(Neuron *src, int idx) {
    if (idx < 0 || idx >= src->n_syn) return;
    /* Swap with last */
    src->synapses[idx] = src->synapses[src->n_syn - 1];
    src->n_syn--;
}

/* Remove weak synapses (pruning) */
static int synapse_prune(Neuron *src, float threshold) {
    int removed = 0;
    for (int i = src->n_syn - 1; i >= 0; i--) {
        if (fabsf(src->synapses[i].weight) < threshold) {
            synapse_remove(src, i);
            removed++;
        }
    }
    return removed;
}

/* ======= INDEX INVERSE (connexions entrantes) =======
 * "Chaque neurone sait qui l'ecoute. La reciprocite, c'est la conscience."
 * L'index inverse ne se sauvegarde pas — il se reconstruit au chargement. */

/* Ajouter src_idx dans l'index inverse du neurone target */
static void incoming_add(Neuron *tgt, int src_idx) {
    /* Verifier si deja present */
    for (int i = 0; i < tgt->n_incoming; i++) {
        if (tgt->incoming_src[i] == src_idx) return;
    }
    /* Croitre si necessaire (doublement de capacite) */
    if (tgt->n_incoming >= tgt->max_incoming) {
        int new_max = tgt->max_incoming == 0 ? 8 : tgt->max_incoming * 2;
        int *new_arr = realloc(tgt->incoming_src, new_max * sizeof(int));
        if (!new_arr) return;  /* echec silencieux: l'homeostasie degradera en O(N) */
        tgt->incoming_src = new_arr;
        tgt->max_incoming = new_max;
    }
    tgt->incoming_src[tgt->n_incoming++] = src_idx;
}

/* Retirer src_idx de l'index inverse du neurone target (swap-with-last) */
static void incoming_remove(Neuron *tgt, int src_idx) {
    for (int i = 0; i < tgt->n_incoming; i++) {
        if (tgt->incoming_src[i] == src_idx) {
            tgt->incoming_src[i] = tgt->incoming_src[tgt->n_incoming - 1];
            tgt->n_incoming--;
            return;
        }
    }
}

/* Reconstruire l'index inverse pour tout le VM (passe O(N*K)) */
/* Appele apres vm_load_state, vm_load_v1, inject_brain_ben */
static void vm_rebuild_incoming(VM *vm) {
    /* Remettre a zero les index existants */
    for (int i = 0; i < vm->N; i++) {
        vm->neurons[i].n_incoming = 0;
        /* Conserver la memoire allouee pour la reutiliser */
    }
    /* Balayer toutes les synapses sortantes -> alimenter les index entrants */
    for (int i = 0; i < vm->N; i++) {
        Neuron *src = &vm->neurons[i];
        for (int s = 0; s < src->n_syn; s++) {
            int t = src->synapses[s].target;
            if (t >= 0 && t < vm->N) {
                incoming_add(&vm->neurons[t], i);
            }
        }
    }
}

/* Ajouter une synapse src_idx -> target et maintenir le reverse index */
static int vm_add_synapse(VM *vm, int src_idx, int target, float weight) {
    if (src_idx < 0 || src_idx >= vm->N) return -1;
    if (target < 0  || target  >= vm->N) return -1;
    if (src_idx == target) return -1;
    Neuron *src = &vm->neurons[src_idx];
    int before = src->n_syn;
    int idx = synapse_add(src, target, weight);
    if (idx >= 0) {
        /* Maj index inverse (incoming_add verifie les doublons) */
        incoming_add(&vm->neurons[target], src_idx);
        /* Incrementer total seulement si c'est une nouvelle synapse */
        if (src->n_syn > before) {
            vm->total_synapses++;
        }
    }
    return idx;
}

/* Retirer la synapse d'index syn_idx du neurone src_idx et maj reverse index */
static void vm_remove_synapse(VM *vm, int src_idx, int syn_idx) {
    if (src_idx < 0 || src_idx >= vm->N) return;
    Neuron *src = &vm->neurons[src_idx];
    if (syn_idx < 0 || syn_idx >= src->n_syn) return;
    int target = src->synapses[syn_idx].target;
    synapse_remove(src, syn_idx);
    /* Retirer src_idx de l'index inverse de la cible */
    if (target >= 0 && target < vm->N) {
        incoming_remove(&vm->neurons[target], src_idx);
    }
    vm->total_synapses--;
    if (vm->total_synapses < 0) vm->total_synapses = 0;
}

/* ======= VM CREATION ======= */

static VM *vm_create(int N) {
    VM *vm = calloc(1, sizeof(VM));
    if (!vm) return NULL;

    vm->N = N;
    vm->N_alloc = N + N / 4;  /* 25% growth headroom */
    vm->neurons = calloc(vm->N_alloc, sizeof(Neuron));
    if (!vm->neurons) { free(vm); return NULL; }

    /* Initialize neurons with types */
    /* 10% sensor, 80% inter, 10% motor */
    int n_sensor = N / 10;
    int n_motor  = N / 10;
    for (int i = 0; i < N; i++) {
        int type = 1;  /* inter by default */
        if (i < n_sensor) type = 0;  /* sensor */
        else if (i >= N - n_motor) type = 2;  /* motor */
        neuron_init(&vm->neurons[i], type);
    }

    /* Allocate legacy arrays for .ben compatibility */
    /* A = activations, SEUIL = thresholds, etc. */
    vm->arrays[ARR_A]      = calloc(vm->N_alloc, sizeof(double));
    vm->arrays[ARR_SEUIL]  = calloc(vm->N_alloc, sizeof(double));
    vm->arrays[ARR_NEW_A]  = calloc(vm->N_alloc, sizeof(double));
    vm->arrays[ARR_FIRE]   = calloc(vm->N_alloc, sizeof(double));
    vm->arrays[ARR_LR]     = calloc(vm->N_alloc, sizeof(double));
    vm->arrays[ARR_DECAY]  = calloc(vm->N_alloc, sizeof(double));
    vm->arrays[ARR_CAP]    = calloc(vm->N_alloc, sizeof(double));
    vm->arrays[ARR_ERROR]  = calloc(vm->N_alloc, sizeof(double));
    vm->arrays[ARR_PREV_A] = calloc(vm->N_alloc, sizeof(double));
    for (int i = 0; i < ARR_COUNT; i++)
        vm->arr_sizes[i] = vm->N_alloc;

    /* Sync legacy arrays from neuron structs */
    for (int i = 0; i < N; i++) {
        vm->arrays[ARR_SEUIL][i] = vm->neurons[i].threshold;
        vm->arrays[ARR_LR][i]    = vm->neurons[i].lr;
        vm->arrays[ARR_DECAY][i] = vm->neurons[i].decay;
        vm->arrays[ARR_CAP][i]   = vm->neurons[i].cap;
    }

    vm->total_synapses = 0;

    /* Pre-allocate input buffer (reused every tick, avoids per-tick calloc) */
    vm->input_buf = calloc(vm->N_alloc, sizeof(float));
    vm->input_buf_size = vm->N_alloc;

    /* Init STDP lookup table once (idempotent) */
    if (!stdp_lut_ready) stdp_lut_init();

    return vm;
}

/* ======= GROW: add neurons dynamically ======= */

static int vm_grow(VM *vm, int count) {
    int new_N = vm->N + count;
    if (new_N > vm->N_alloc) {
        int new_alloc = new_N + new_N / 4;
        Neuron *new_neurons = realloc(vm->neurons, new_alloc * sizeof(Neuron));
        if (!new_neurons) return 0;
        vm->neurons = new_neurons;
        memset(&vm->neurons[vm->N_alloc], 0, (new_alloc - vm->N_alloc) * sizeof(Neuron));

        /* Grow legacy arrays */
        for (int a = 0; a < ARR_COUNT; a++) {
            if (vm->arrays[a]) {
                double *new_arr = realloc(vm->arrays[a], new_alloc * sizeof(double));
                if (new_arr) {
                    memset(&new_arr[vm->N_alloc], 0, (new_alloc - vm->N_alloc) * sizeof(double));
                    vm->arrays[a] = new_arr;
                    vm->arr_sizes[a] = new_alloc;
                }
            }
        }
        vm->N_alloc = new_alloc;

        /* Grow input_buf alongside neuron array */
        if (vm->input_buf_size < new_alloc) {
            float *new_buf = realloc(vm->input_buf, new_alloc * sizeof(float));
            if (new_buf) {
                vm->input_buf = new_buf;
                vm->input_buf_size = new_alloc;
            }
        }
    }

    /* Initialize new neurons as inter type */
    for (int i = vm->N; i < new_N; i++) {
        neuron_init(&vm->neurons[i], 1);
        vm->arrays[ARR_SEUIL][i] = vm->neurons[i].threshold;
        vm->arrays[ARR_LR][i]    = vm->neurons[i].lr;
        vm->arrays[ARR_DECAY][i] = vm->neurons[i].decay;
        vm->arrays[ARR_CAP][i]   = vm->neurons[i].cap;
    }

    vm->N = new_N;
    return count;
}

/* ======= SYNC: neuron structs <-> legacy arrays ======= */

/* Call before .ben execution: copy neuron state to flat arrays */
static void vm_sync_to_arrays(VM *vm) {
    for (int i = 0; i < vm->N; i++) {
        Neuron *n = &vm->neurons[i];
        vm->arrays[ARR_A][i]      = n->activation;
        vm->arrays[ARR_SEUIL][i]  = n->threshold;
        vm->arrays[ARR_FIRE][i]   = n->fired;
        vm->arrays[ARR_LR][i]     = n->lr;
        vm->arrays[ARR_DECAY][i]  = n->decay;
        vm->arrays[ARR_CAP][i]    = n->cap;
        vm->arrays[ARR_ERROR][i]  = n->error;
        vm->arrays[ARR_PREV_A][i] = n->prev_activation;
    }
}

/* Call after .ben execution: copy flat arrays back to neuron structs */
static void vm_sync_from_arrays(VM *vm) {
    for (int i = 0; i < vm->N; i++) {
        Neuron *n = &vm->neurons[i];
        n->activation      = (float)vm->arrays[ARR_A][i];
        n->threshold        = (float)vm->arrays[ARR_SEUIL][i];
        n->lr               = (float)vm->arrays[ARR_LR][i];
        n->decay            = (float)vm->arrays[ARR_DECAY][i];
        n->cap              = (float)vm->arrays[ARR_CAP][i];
        n->error            = (float)vm->arrays[ARR_ERROR][i];
        n->prev_activation  = (float)vm->arrays[ARR_PREV_A][i];
    }
}

/* ======= NEURAL TICK (V2: LIF Sparse propagation) ======= */
/*
 * Leaky Integrate-and-Fire:
 *   membrane = leak(prev) + synaptic_input + recurrence
 *   if membrane >= threshold && not refractory -> FIRE
 *   else -> retain sub-threshold potential
 *   refractory period: 3 ticks after firing
 */

/* Criticality globals (defined in pulse.c) */
extern float g_noise_sigma;
extern float g_thal_rate;
extern float g_mod_level;

static int vm_neural_tick(VM *vm, int total_ticks) {
    int N = vm->N;
    Neuron *neurons = vm->neurons;
    int firings = 0;

    /* 1. Save previous activations (each neuron independent) */
    #pragma omp parallel for schedule(static)
    for (int i = 0; i < N; i++)
        neurons[i].prev_activation = neurons[i].activation;

    /* 2. Compute synaptic input from fired neurons -> targets
     * Race condition risk: multiple source neurons can target the same neuron.
     * Solution: accumulate into a local float buffer and use #pragma omp atomic
     * so each write to input[t] is serialised at the word level.
     * The buffer is pre-allocated in vm->input_buf — no per-tick calloc. */
    float *input = vm->input_buf;
    memset(input, 0, N * sizeof(float));
    #pragma omp parallel for schedule(dynamic, 64)
    for (int i = 0; i < N; i++) {
        if (!neurons[i].fired) continue;
        Neuron *src = &neurons[i];
        /* STP: pre-synaptic facilitation on fire */
        if (src->stp_u < 0.9f) src->stp_u += 0.1f;
        float stp_factor = 0.5f + 0.5f * src->stp_u;
        for (int s = 0; s < src->n_syn; s++) {
            Synapse *syn = &src->synapses[s];
            int t = syn->target;
            if (t >= 0 && t < N) {
                float contrib = syn->weight * src->activation * stp_factor;
                #pragma omp atomic
                input[t] += contrib;
            }
        }
    }

    /* 3. LIF update for each neuron (fully independent: neuron i only touches neurons[i]) */
    int n_active = 0, n_absorbed = 0;
    double tot_energy = 0.0;
    #pragma omp parallel for schedule(static) reduction(+:firings,n_active,n_absorbed,tot_energy)
    for (int i = 0; i < N; i++) {
        Neuron *n = &neurons[i];

        /* Refractory period: skip if cooling down */
        if (n->refractory > 0) {
            n->refractory--;
            n->fired = 0;
            n->activation *= 0.5f;  /* rapid decay during refractory */
            /* still count for stats */
            if (n->activation > 0)       n_active++;
            if (n->activation < -1.0f)   n_absorbed++;
            tot_energy += fabs(n->activation);
            continue;
        }

        /* LIF: leak current activation (90% retention) */
        float leak = n->activation * 0.9f;

        /* Recurrence: 20% of previous activation (inter neurons only) */
        float recurrence = (n->type == 1) ? n->prev_activation * 0.2f : 0.0f;

        /* Membrane potential = leak + synaptic input + recurrence */
        float membrane = leak + input[i] + recurrence;

        /* Thalamic Poisson input */
        if (n->is_thalamic && (rand() % 10000) < (int)(g_thal_rate * 10000)) {
            membrane = n->threshold + 0.1f;
        }

        /* Gaussian noise approximation (uniform) */
        float noise = ((rand() % 1000) / 500.0f - 1.0f) * g_noise_sigma;
        membrane += noise;

        /* Fire decision */
        if (membrane >= n->threshold && n->threshold > 0) {
            /* FIRE */
            float fire_val = membrane;
            if (fire_val > n->cap) fire_val = n->cap;
            n->activation = fire_val;
            n->fired = 1;
            n->refractory = 3;  /* 3-tick refractory period */
            n->last_fire_tick = total_ticks;
            firings++;
        } else {
            /* Sub-threshold: retain potential but don't fire */
            n->fired = 0;
            n->activation = fmaxf(membrane, 0.0f);
        }

        /* STP decay toward 0 */
        n->stp_u *= 0.98f;

        /* Accumulate stats in same pass — no extra O(N) scan needed */
        if (n->activation > 0)       n_active++;
        if (n->activation < -1.0f)   n_absorbed++;
        tot_energy += fabs(n->activation);
    }

    /* Store cached counters on VM — pulse.c reads these instead of rescanning */
    vm->cached_n_active   = n_active;
    vm->cached_n_absorbed = n_absorbed;
    vm->cached_total_energy = tot_energy;

    return firings;
}

/* ======= STDP LEARNING (V2: Spike-Timing-Dependent Plasticity) ======= */
/*
 * Pre fires BEFORE post (dt > 0) → causal → strengthen (LTP)
 * Post fires BEFORE pre (dt < 0) → anti-causal → weaken (LTD)
 * Exponential decay with tau=15 ticks
 */

static void vm_stdp(VM *vm) {
    int N = vm->N;
    Neuron *neurons = vm->neurons;

    /* Thread safety analysis:
     * - src->last_fire_tick and neurons[j].last_fire_tick are READ-ONLY here
     *   (they were set during the previous neural tick, before stdp is called).
     * - Each thread i writes ONLY into neurons[i].synapses[], which no other
     *   thread owns. Zero conflicts → no atomics needed.
     * - neurons[j].activation is read-only (eligibility trace update reads it). */
    #pragma omp parallel for schedule(dynamic, 32)
    for (int i = 0; i < N; i++) {
        Neuron *src = &neurons[i];
        if (src->n_syn == 0) continue;

        for (int s = 0; s < src->n_syn; s++) {
            Synapse *syn = &src->synapses[s];
            int j = syn->target;
            if (j < 0 || j >= N) continue;

            float lr = src->lr;
            float sign = syn->weight >= 0 ? 1.0f : -1.0f;

            /* STDP: timing-based plasticity */
            int dt = src->last_fire_tick - neurons[j].last_fire_tick;

            if (dt > 0 && dt <= 50) {
                /* Pre fired BEFORE post (causal) → strengthen */
                float stdp = lr * stdp_lut_pos[dt] * g_mod_level;
                syn->weight += sign * stdp;
            } else if (dt < 0 && -dt <= 50) {
                /* Post fired BEFORE pre (anti-causal) → weaken */
                float stdp = lr * stdp_lut_neg[-dt] * g_mod_level;
                syn->weight -= sign * stdp;
            }

            /* Update eligibility trace (for backprop compatibility) */
            syn->trace = syn->trace * 0.95f + src->activation * neurons[j].activation * 0.05f;

            /* Weight bounds */
            if (syn->weight > 15.0f) syn->weight = 15.0f;
            if (syn->weight < -15.0f) syn->weight = -15.0f;
        }
    }
}

/* ======= BACKPROP (V2: Sparse error propagation) ======= */

static void vm_backprop(VM *vm) {
    int N = vm->N;
    Neuron *neurons = vm->neurons;

    /* Compute error for motor neurons based on score */
    float score = (float)vm->vars[VAR_SCORE];
    int n_motor = N / 10;
    int motor_start = N - n_motor;

    for (int i = motor_start; i < N; i++) {
        neurons[i].error = -score * 0.1f * (neurons[i].fired ? 1.0f : 0.5f);
    }

    /* Propagate error backwards through synapses */
    /* For each neuron, accumulate error from its targets */
    for (int i = N - 1; i >= 0; i--) {
        Neuron *src = &neurons[i];
        if (fabsf(src->error) < 0.001f) continue;

        for (int s = 0; s < src->n_syn; s++) {
            Synapse *syn = &src->synapses[s];
            int j = syn->target;
            if (j < 0 || j >= N) continue;

            /* Gradient: adjust weight based on error and activation */
            float grad = src->error * neurons[j].activation * src->lr * 0.1f;
            syn->weight -= grad;

            /* Propagate error to source (for deeper layers) */
            /* This is reversed: src sends to target, so error flows back */
        }

        /* Decay error */
        src->error *= 0.9f;
    }
}

/* ======= RANDOM CONNECTION (for exploration/growth) ======= */

static void vm_random_connect(VM *vm, int src, int tgt, float weight) {
    if (src < 0 || src >= vm->N || tgt < 0 || tgt >= vm->N || src == tgt) return;
    /* vm_add_synapse maintient automatiquement le reverse index */
    vm_add_synapse(vm, src, tgt, weight);
}

/* Create random sparse connections */
static void vm_init_random_connections(VM *vm, int connections_per_neuron) {
    srand((unsigned)time(NULL));
    for (int i = 0; i < vm->N; i++) {
        for (int c = 0; c < connections_per_neuron; c++) {
            int target = rand() % vm->N;
            if (target == i) continue;
            float weight = ((float)rand() / RAND_MAX - 0.5f) * 2.0f;
            vm_random_connect(vm, i, target, weight);
        }
    }
}

/* ======= COUNTING FUNCTIONS ======= */

static int count_active(VM *vm) {
    int count = 0;
    for (int i = 0; i < vm->N; i++)
        if (vm->neurons[i].activation > 0) count++;
    return count;
}

static int count_connections(VM *vm) {
    long long total = 0;
    for (int i = 0; i < vm->N; i++)
        total += vm->neurons[i].n_syn;
    return (int)(total > 2000000000LL ? 2000000000LL : total);
}

static int count_absorbed(VM *vm) {
    int count = 0;
    for (int i = 0; i < vm->N; i++)
        if (vm->neurons[i].activation < -1.0f) count++;
    return count;
}

static double total_energy(VM *vm) {
    double sum = 0;
    for (int i = 0; i < vm->N; i++)
        sum += fabs(vm->neurons[i].activation);
    return sum;
}

/* ======= PRUNING ======= */

static int vm_prune(VM *vm, float threshold) {
    int total_removed = 0;
    for (int i = 0; i < vm->N; i++) {
        Neuron *src = &vm->neurons[i];
        /* Parcourir en sens inverse pour pouvoir supprimer sans decaler les indices */
        for (int s = src->n_syn - 1; s >= 0; s--) {
            if (fabsf(src->synapses[s].weight) < threshold) {
                /* vm_remove_synapse maintient le reverse index */
                vm_remove_synapse(vm, i, s);
                total_removed++;
            }
        }
    }
    return total_removed;
}

/* ======= SAVE / LOAD (V2 binary format) ======= */
/*
 * Format:
 *   "BEN2"          magic (4 bytes)
 *   N               int32
 *   vars[VAR_MAX]   double * VAR_MAX
 *   For each neuron (bulk NeuronRecord):
 *     activation, threshold, lr, decay, cap   (5 * float)
 *     refractory                               (int32)
 *     last_fire_tick                           (int32)
 *     type                                     (uint8)
 *   Then for each neuron:
 *     n_syn                                    (int32)
 *     For each synapse:
 *       target       (int32)
 *       weight       (float)
 */

/* Packed record for bulk neuron I/O — matches the per-field order previously written */
typedef struct __attribute__((packed)) {
    float    activation;
    float    threshold;
    float    lr;
    float    decay;
    float    cap;
    int      refractory;
    int      last_fire_tick;
    uint8_t  type;
} NeuronRecord;

static int vm_save_state(VM *vm, const char *path) {
    FILE *f = fopen(path, "wb");
    if (!f) return 0;

    /* Magic */
    fwrite("BEN2", 1, 4, f);

    /* N */
    int n = vm->N;
    fwrite(&n, sizeof(int), 1, f);

    /* Vars */
    fwrite(vm->vars, sizeof(double), VAR_MAX, f);

    /* Neurons — bulk write fixed-size fields, then per-neuron synapse lists */
    NeuronRecord *records = malloc(vm->N * sizeof(NeuronRecord));
    if (records) {
        for (int i = 0; i < vm->N; i++) {
            Neuron *nr = &vm->neurons[i];
            records[i].activation     = nr->activation;
            records[i].threshold      = nr->threshold;
            records[i].lr             = nr->lr;
            records[i].decay          = nr->decay;
            records[i].cap            = nr->cap;
            records[i].refractory     = nr->refractory;
            records[i].last_fire_tick = nr->last_fire_tick;
            records[i].type           = nr->type;
        }
        fwrite(records, sizeof(NeuronRecord), vm->N, f);
        free(records);
    }
    /* Synapse lists (variable length per neuron, only target+weight — trace is runtime) */
    for (int i = 0; i < vm->N; i++) {
        Neuron *nr = &vm->neurons[i];
        fwrite(&nr->n_syn, sizeof(int), 1, f);
        for (int s = 0; s < nr->n_syn; s++) {
            fwrite(&nr->synapses[s].target, sizeof(int),   1, f);
            fwrite(&nr->synapses[s].weight, sizeof(float), 1, f);
        }
    }

    /* String table count (for compatibility) */
    fwrite(&strtab.count, sizeof(int), 1, f);

    fclose(f);
    return 1;
}

static int vm_load_state(VM *vm, const char *path) {
    FILE *f = fopen(path, "rb");
    if (!f) return 0;

    /* Check magic */
    char magic[4];
    fread(magic, 1, 4, f);
    if (memcmp(magic, "BEN2", 4) != 0) {
        fclose(f);
        printf("  [load] not BEN2 format, starting fresh\n");
        return 0;
    }

    /* N */
    int saved_N;
    fread(&saved_N, sizeof(int), 1, f);

    /* Resize if needed */
    if (saved_N > vm->N) {
        vm_grow(vm, saved_N - vm->N);
    }

    /* Vars */
    fread(vm->vars, sizeof(double), VAR_MAX, f);

    /* Neurons — bulk read fixed-size fields */
    int load_N = saved_N < vm->N ? saved_N : vm->N;
    vm->total_synapses = 0;
    {
        NeuronRecord *records = malloc(saved_N * sizeof(NeuronRecord));
        if (records) {
            fread(records, sizeof(NeuronRecord), saved_N, f);
            for (int i = 0; i < load_N; i++) {
                Neuron *nr = &vm->neurons[i];
                nr->activation     = records[i].activation;
                nr->threshold      = records[i].threshold;
                nr->lr             = records[i].lr;
                nr->decay          = records[i].decay;
                nr->cap            = records[i].cap;
                nr->refractory     = records[i].refractory;
                nr->last_fire_tick = records[i].last_fire_tick;
                nr->type           = records[i].type;
            }
            free(records);
        }
    }
    /* Synapse lists */
    for (int i = 0; i < load_N; i++) {
        Neuron *nr = &vm->neurons[i];

        int n_syn;
        fread(&n_syn, sizeof(int), 1, f);

        /* Free old synapses */
        if (nr->synapses) free(nr->synapses);
        nr->n_syn = 0;
        nr->max_syn = 0;
        nr->synapses = NULL;

        for (int s = 0; s < n_syn; s++) {
            int target;
            float weight;
            fread(&target, sizeof(int), 1, f);
            fread(&weight, sizeof(float), 1, f);
            synapse_add(nr, target, weight);
        }
        vm->total_synapses += nr->n_syn;
    }

    /* Skip string table count */
    int str_count;
    if (fread(&str_count, sizeof(int), 1, f) == 1) {
        /* stored for future use */
    }

    fclose(f);

    /* Reconstruire l'index inverse (pas sauvegarde — O(N*K) acceptable au chargement) */
    vm_rebuild_incoming(vm);

    /* Sync to legacy arrays */
    vm_sync_to_arrays(vm);
    printf("  [load] BEN2: %d neurons, %lld synapses\n", load_N, vm->total_synapses);
    return 1;
}

/* ======= FREE ======= */

static void vm_free(VM *vm) {
    if (!vm) return;
    for (int i = 0; i < vm->N_alloc; i++) {
        if (vm->neurons[i].synapses) free(vm->neurons[i].synapses);
        if (vm->neurons[i].incoming_src) free(vm->neurons[i].incoming_src);
    }
    free(vm->neurons);
    for (int a = 0; a < ARR_COUNT; a++) {
        if (vm->arrays[a]) free(vm->arrays[a]);
    }
    if (vm->arena_path) free(vm->arena_path);
    if (vm->input_buf) free(vm->input_buf);
    free(vm);
}

/* ======= RESOLVE PATH ======= */
static void resolve_path(const VM *vm, const char *name, char *out, int out_len) {
    if (name[0] == '/' || name[0] == '\\' || (name[0] && name[1] == ':')) {
        snprintf(out, out_len, "%s", name);
    } else if (vm->arena_path) {
        snprintf(out, out_len, "%s%c%s", vm->arena_path, DIR_SEP, name);
    } else {
        snprintf(out, out_len, "%s", name);
    }
}

/* ======= MIGRATION: V1 brain.bin -> V2 ======= */

static int vm_load_v1(VM *vm, const char *path) {
    FILE *f = fopen(path, "rb");
    if (!f) return 0;

    /* Try to detect format: V1 starts with N as int, V2 starts with "BEN2" */
    char header[4];
    fread(header, 1, 4, f);
    if (memcmp(header, "BEN2", 4) == 0) {
        fclose(f);
        return vm_load_state(vm, path);  /* already V2 */
    }

    /* V1 format: first 4 bytes are N (int) */
    fseek(f, 0, SEEK_SET);
    int saved_N;
    fread(&saved_N, sizeof(int), 1, f);

    if (saved_N <= 0 || saved_N > 100000) {
        fclose(f);
        printf("  [load] invalid V1 N=%d, starting fresh\n", saved_N);
        return 0;
    }

    printf("  [migrate] V1 brain.bin: N=%d -> V2 sparse\n", saved_N);

    /* Read V1 vars */
    fread(vm->vars, sizeof(double), VAR_MAX, f);

    /* Read V1 arrays: A, SEUIL, NEW_A (unused), W (N*N), ... */
    /* V1 layout: for each array, N (or N*N for W) doubles */
    int load_N = saved_N < vm->N ? saved_N : vm->N;

    /* A (activations) */
    double *tmp = calloc(saved_N, sizeof(double));
    fread(tmp, sizeof(double), saved_N, f);
    for (int i = 0; i < load_N; i++)
        vm->neurons[i].activation = (float)tmp[i];

    /* SEUIL (thresholds) */
    fread(tmp, sizeof(double), saved_N, f);
    for (int i = 0; i < load_N; i++)
        vm->neurons[i].threshold = (float)tmp[i];

    /* NEW_A (skip) */
    fseek(f, saved_N * sizeof(double), SEEK_CUR);

    /* W (N*N dense matrix -> convert to sparse) */
    double *row = calloc(saved_N, sizeof(double));
    vm->total_synapses = 0;
    for (int i = 0; i < saved_N; i++) {
        fread(row, sizeof(double), saved_N, f);
        if (i >= load_N) continue;
        for (int j = 0; j < saved_N && j < load_N; j++) {
            if (fabs(row[j]) > 0.01) {  /* only keep significant connections */
                synapse_add(&vm->neurons[i], j, (float)row[j]);
                vm->total_synapses++;
            }
        }
    }
    free(row);

    /* Skip remaining V1 arrays (NEW_W, FIRE, LR, DECAY, CAP, TRACE, ERROR, PREV_A) */
    /* Try to read LR, DECAY, CAP if available */
    /* FIRE */
    fseek(f, saved_N * sizeof(double), SEEK_CUR);
    /* LR */
    if (fread(tmp, sizeof(double), saved_N, f) == (size_t)saved_N) {
        for (int i = 0; i < load_N; i++)
            vm->neurons[i].lr = (float)tmp[i];
    }
    /* DECAY */
    if (fread(tmp, sizeof(double), saved_N, f) == (size_t)saved_N) {
        for (int i = 0; i < load_N; i++)
            vm->neurons[i].decay = (float)tmp[i];
    }
    /* CAP */
    if (fread(tmp, sizeof(double), saved_N, f) == (size_t)saved_N) {
        for (int i = 0; i < load_N; i++)
            vm->neurons[i].cap = (float)tmp[i];
    }

    free(tmp);
    fclose(f);

    /* Reconstruire l'index inverse (pas sauvegarde — O(N*K) acceptable au chargement) */
    vm_rebuild_incoming(vm);

    /* Sync to legacy arrays */
    vm_sync_to_arrays(vm);
    printf("  [migrate] V1->V2 done: %d neurons, %lld synapses\n", load_N, vm->total_synapses);
    return 1;
}
