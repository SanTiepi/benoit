#!/bin/bash
# deploy_vps.sh — Déploiement Benoît V2 sur VPS GPU
# Usage: bash deploy_vps.sh <IP> [N]
# Exemple: bash deploy_vps.sh 194.93.48.163 50000000

set -e

VPS_IP="${1:-194.93.48.163}"
N="${2:-50000000}"
SSH_KEY="${3:-$HOME/.ssh/id_ed25519_batiscan_vps}"
REMOTE_DIR="/root/benoit-v2"
DATA_DIR="/root/data"
SSH="ssh -i $SSH_KEY -o StrictHostKeyChecking=no root@$VPS_IP"

echo "=== Déploiement Benoît V2 sur $VPS_IP (N=$N) ==="

# 1. Créer les dossiers sur le VPS
echo "[1/5] Création des dossiers..."
$SSH "mkdir -p $REMOTE_DIR $DATA_DIR/arena"

# 2. Copier les fichiers source
echo "[2/5] Copie des sources..."
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
scp -i $SSH_KEY \
    "$SCRIPT_DIR/pulse.c" \
    "$SCRIPT_DIR/vm.c" \
    "$SCRIPT_DIR/compiler.c" \
    "$SCRIPT_DIR/vm_cuda.cu" \
    "$SCRIPT_DIR/vm_cuda.h" \
    "$SCRIPT_DIR/Makefile" \
    root@$VPS_IP:$REMOTE_DIR/

# 3. Copier l'arena (.ben files)
echo "[3/5] Copie de l'arena..."
scp -i $SSH_KEY -r "$SCRIPT_DIR/arena/"*.ben root@$VPS_IP:$DATA_DIR/arena/ 2>/dev/null || true

# 4. Build CUDA sur le VPS
echo "[4/5] Build CUDA (sm_120)..."
$SSH "cd $REMOTE_DIR && make cuda-linux 2>&1"

# 5. Lancer Benoît
echo "[5/5] Lancement Benoît N=$N..."
$SSH "cd $REMOTE_DIR && nohup ./pulse_cuda --new $N $DATA_DIR/brain.bin $DATA_DIR/brain.bin $DATA_DIR/arena --inject $DATA_DIR/arena/brain.ben > $DATA_DIR/pulse.log 2>&1 &"

echo ""
echo "=== Benoît est vivant ==="
echo "Log    : ssh root@$VPS_IP 'tail -f $DATA_DIR/pulse.log'"
echo "Status : ssh root@$VPS_IP 'echo status | nc localhost 3742'"
echo "Parole : ssh root@$VPS_IP 'cat $DATA_DIR/arena/parole.ben'"
echo "Port   : ssh -L 3742:localhost:3742 root@$VPS_IP  (TCP tunnel)"
