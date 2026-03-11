#!/bin/bash
# deploy.sh — Deploy Benoît to Infomaniak VPS
# Usage: bash deploy.sh

set -e

VPS_HOST="83.228.221.188"
VPS_USER="ubuntu"
SSH_KEY="$HOME/.ssh/id_ed25519_batiscan_vps"
SSH="ssh -i $SSH_KEY $VPS_USER@$VPS_HOST"
SCP="scp -i $SSH_KEY"
REMOTE_DIR="/mnt/data/benoit"

echo "=== 1. Preparing remote directories ==="
$SSH "sudo mkdir -p $REMOTE_DIR/{brain,arena,src} && sudo chown -R $VPS_USER:$VPS_USER $REMOTE_DIR"

echo "=== 2. Uploading source files ==="
$SCP pulse.c vm.c compiler.c Dockerfile docker-compose.yml "$VPS_USER@$VPS_HOST:$REMOTE_DIR/src/"

echo "=== 3. Uploading arena ==="
$SCP -r arena/ "$VPS_USER@$VPS_HOST:$REMOTE_DIR/arena/"

echo "=== 4. Uploading brain.bin (if exists) ==="
if [ -f brain.bin ]; then
    $SCP brain.bin "$VPS_USER@$VPS_HOST:$REMOTE_DIR/brain/"
    echo "  brain.bin uploaded"
else
    echo "  no brain.bin (fresh start)"
fi

echo "=== 5. Building Docker image ==="
$SSH "cd $REMOTE_DIR/src && docker build -t benoit ."

echo "=== 6. Stopping old container (if any) ==="
$SSH "docker stop benoit_pulse 2>/dev/null || true && docker rm benoit_pulse 2>/dev/null || true"

echo "=== 7. Starting Benoît ==="
$SSH "cd $REMOTE_DIR/src && docker compose up -d"

echo "=== 8. Checking status ==="
sleep 3
$SSH "docker logs benoit_pulse --tail 20"

echo ""
echo "=== DONE ==="
echo "Benoît lives at $VPS_HOST:3742"
echo "Connect: telnet $VPS_HOST 3742"
echo "Logs:    ssh -i $SSH_KEY $VPS_USER@$VPS_HOST 'docker logs -f benoit_pulse'"
