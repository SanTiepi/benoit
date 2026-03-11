#!/bin/bash
# teach.sh — Envoyer une leçon à Benoît (local ou remote)
# Usage:
#   bash teach.sh local  "explication"                      # leçon simple
#   bash teach.sh local  "explication" cycle nouveau.ben    # remplacer cycle.ben
#   bash teach.sh remote "explication"                      # leçon sur VPS
#   bash teach.sh remote "explication" cycle nouveau.ben    # remplacer cycle.ben sur VPS

MODE="${1:-local}"
LECON="$2"
CIBLE="$3"
FICHIER="$4"

VPS_HOST="83.228.221.188"
VPS_USER="ubuntu"
SSH_KEY="$HOME/.ssh/id_ed25519_batiscan_vps"
REMOTE_ARENA="/mnt/data/benoit/arena"

if [ -z "$LECON" ]; then
    echo "Usage: bash teach.sh [local|remote] \"explication\" [cible] [fichier.ben]"
    exit 1
fi

write_lecon() {
    local dir="$1"
    echo "-- Lecon de l'assistant" > "$dir/lecon.ben"
    echo "-- $LECON" >> "$dir/lecon.ben"
    echo "lecon: \"$LECON\"" >> "$dir/lecon.ben"
    echo "  lecon.ben written"
}

if [ "$MODE" = "local" ]; then
    ARENA="arena"
    write_lecon "$ARENA"
    if [ -n "$CIBLE" ] && [ -n "$FICHIER" ]; then
        cp "$FICHIER" "$ARENA/nouveau_${CIBLE}.ben"
        echo "  nouveau_${CIBLE}.ben written"
    fi
    echo "  Waiting for Benoît to learn..."
    sleep 5
    if [ -f "$ARENA/appris.ben" ]; then
        echo "  === LEARNED ==="
        cat "$ARENA/appris.ben"
    else
        echo "  (not yet consumed — check later)"
    fi

elif [ "$MODE" = "remote" ]; then
    SSH="ssh -i $SSH_KEY $VPS_USER@$VPS_HOST"
    SCP="scp -i $SSH_KEY"

    # Write lecon locally then upload
    TMP=$(mktemp -d)
    echo "-- Lecon de l'assistant" > "$TMP/lecon.ben"
    echo "-- $LECON" >> "$TMP/lecon.ben"
    echo "lecon: \"$LECON\"" >> "$TMP/lecon.ben"
    $SCP "$TMP/lecon.ben" "$VPS_USER@$VPS_HOST:$REMOTE_ARENA/"
    echo "  lecon.ben uploaded"

    if [ -n "$CIBLE" ] && [ -n "$FICHIER" ]; then
        $SCP "$FICHIER" "$VPS_USER@$VPS_HOST:$REMOTE_ARENA/nouveau_${CIBLE}.ben"
        echo "  nouveau_${CIBLE}.ben uploaded"
    fi

    rm -rf "$TMP"

    echo "  Waiting for Benoît to learn..."
    sleep 5
    $SSH "cat $REMOTE_ARENA/appris.ben 2>/dev/null || echo '(not yet consumed)'"
fi
