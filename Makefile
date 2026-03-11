# Benoît V2 — Makefile
# Usage:
#   make              → build CPU (avec OpenMP si disponible)
#   make cuda         → build GPU Windows (CUDA + OpenMP)
#   make cuda-linux   → build GPU Linux (CUDA + OpenMP)
#   make clean        → nettoyer les binaires et objets

CC      = gcc
NVCC    = nvcc
CFLAGS  = -O2 -fopenmp
# Blackwell RTX PRO 6000 = sm_120 | A100 = sm_80 | RTX 30xx = sm_86 | RTX 20xx = sm_75
CUDA_ARCH = -arch=sm_120

# ----------------------------------------------------------------
# Cibles Windows
# ----------------------------------------------------------------

# Build CPU par défaut (Windows)
pulse.exe: pulse.c vm.c compiler.c
	$(CC) $(CFLAGS) -o pulse.exe pulse.c -lws2_32 -lm

# Build CUDA Windows (nécessite CUDA Toolkit et CUDA_PATH défini)
cuda: vm_cuda.o
	$(CC) $(CFLAGS) -DBENOIT_CUDA -o pulse_cuda.exe pulse.c vm_cuda.o -lws2_32 -lm -lcudart -L$(CUDA_PATH)/lib/x64

# Compilation du noyau CUDA (commun Windows/Linux)
vm_cuda.o: vm_cuda.cu vm_cuda.h
	$(NVCC) -O2 $(CUDA_ARCH) -c vm_cuda.cu -o vm_cuda.o

# ----------------------------------------------------------------
# Cibles Linux / VPS
# ----------------------------------------------------------------

# Build CPU Linux
pulse: pulse.c vm.c compiler.c
	$(CC) $(CFLAGS) -o pulse pulse.c -lm

# Build CUDA Linux (image Docker nvidia/cuda ou VPS GPU)
cuda-linux: vm_cuda.o
	$(CC) $(CFLAGS) -DBENOIT_CUDA -o pulse_cuda pulse.c vm_cuda.o -lm -L/usr/local/cuda/lib64 -lcudart -Wl,-rpath,/usr/local/cuda/lib64

# ----------------------------------------------------------------
# Nettoyage
# ----------------------------------------------------------------
clean:
	rm -f pulse.exe pulse_cuda.exe pulse pulse_cuda vm_cuda.o

.PHONY: cuda cuda-linux clean
