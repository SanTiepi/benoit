#pragma once
/*
 * vm_cuda.h — Interface C pure pour la couche CUDA de Benoît V2
 *
 * Ce header est inclus par pulse.c (C pur, compilé avec gcc).
 * La compilation CUDA (vm_cuda.cu) se fait séparément avec nvcc.
 *
 * Usage dans pulse.c :
 *   #ifdef BENOIT_CUDA
 *   #include "vm_cuda.h"
 *   BenCUDA *cuda_ctx = ben_cuda_init_c(vm);
 *   ...
 *   #endif
 *
 * Build avec CUDA :
 *   nvcc -O2 -c vm_cuda.cu -o vm_cuda.o
 *   gcc  -O2 -o pulse pulse.c vm_cuda.o -L/usr/local/cuda/lib64 -lcudart -lm
 *   (ajouter -DBENOIT_CUDA pour activer)
 */

#ifdef BENOIT_CUDA

/* Opaque pointer — défini dans vm_cuda.cu */
typedef struct BenCUDA BenCUDA;

#ifdef __cplusplus
extern "C" {
#endif

/*
 * Initialise le contexte CUDA depuis un VM* existant.
 * Alloue les arrays GPU, copie l'état CPU→GPU, construit le CSR.
 * vm : pointeur vers la struct VM (void* pour éviter d'inclure les structs internes)
 * Retourne NULL en cas d'erreur.
 */
BenCUDA *ben_cuda_init_c(void *vm);

/*
 * Libère toutes les allocations GPU.
 */
void ben_cuda_free_c(BenCUDA *ctx);

/*
 * Exécute un tick neural complet sur GPU :
 *   - reset d_input
 *   - cuda_neural_tick_propagate (accumulation synaptique)
 *   - cuda_neural_tick_update    (LIF + fire)
 * total_ticks : tick courant (pour last_fire_tick)
 * Retourne le nombre de neurones ayant tiré.
 */
int ben_cuda_tick_c(BenCUDA *ctx, int total_ticks);

/*
 * Exécute le STDP (apprentissage hebbien) sur GPU.
 * Appeler après ben_cuda_tick_c.
 */
void ben_cuda_stdp_c(BenCUDA *ctx);

/*
 * Synchronise GPU → CPU : copie activation[], fired[], last_fire_tick[].
 * Appeler toutes les ~10 ticks pour que le code .ben voie l'état à jour.
 */
void ben_cuda_sync_to_cpu_c(BenCUDA *ctx, void *vm);

/*
 * Synchronise CPU → GPU : copie les modifications faites par le code .ben
 * (poids, seuils, nouveaux neurones).  Recontruit le CSR si le flag dirty est levé.
 */
void ben_cuda_sync_from_cpu_c(BenCUDA *ctx, void *vm);

#ifdef __cplusplus
}
#endif

#endif /* BENOIT_CUDA */
