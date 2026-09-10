#!/usr/bin/env bash
# Deploy llm-relay to the A100 box (207.211.185.21).
# Usage: ./deploy.sh [token]
set -euo pipefail

REMOTE="ubuntu@207.211.185.21"
REMOTE_DIR="/opt/llm-relay"
SERVICE_NAME="llm-relay"
TOKEN="${1:-}"

if [ -z "$TOKEN" ]; then
    echo "Usage: $0 <relay-token>"
    echo "Generate one: openssl rand -hex 32"
    exit 1
fi

echo "=== Copying tree ==="
scp -r "$(dirname "$0")" "$REMOTE:$REMOTE_DIR/"

echo "=== Setting token ==="
ssh "$REMOTE" "echo 'LLM_RELAY_TOKEN=$TOKEN' | sudo tee /etc/llm-relay/env && sudo chmod 600 /etc/llm-relay/env"

echo "=== Installing systemd service ==="
ssh "$REMOTE" "sudo cp $REMOTE_DIR/deploy/llm-relay.service /etc/systemd/system/ && sudo systemctl daemon-reload && sudo systemctl enable --now $SERVICE_NAME"

echo "=== Verifying ==="
sleep 2
ssh "$REMOTE" "curl -sf http://127.0.0.1:8787/relay/health" && echo " OK" || { echo " FAILED"; exit 1; }

echo ""
echo "Deployed. Metrics: ssh $REMOTE 'curl -s -H \"X-Relay-Token: $TOKEN\" http://127.0.0.1:8787/relay/metrics'"
