#!/usr/bin/env bash
# setup-lumina.sh — Install and start a Lumina light node on Celestia mocha-4.
#
# Usage:
#   bash scripts/setup-lumina.sh
#
# After the node starts, get the auth token and paste it into .env.local:
#   lumina node auth <permissions>
#
# Then run the app:
#   npm run dev

set -euo pipefail

NETWORK="mocha"
LUMINA_VERSION="latest"

echo "==> Checking for Rust / cargo..."
if ! command -v cargo &>/dev/null; then
  echo "  Rust not found. Install from https://rustup.rs and re-run this script."
  exit 1
fi

echo "==> Installing lumina-cli from crates.io..."
cargo install lumina-cli --locked

echo ""
echo "==> Lumina installed: $(lumina --version)"
echo ""
echo "==> Starting Lumina light node on ${NETWORK}..."
echo "    Press Ctrl-C to stop."
echo ""
echo "    Once the node has synced a few headers, open a second terminal and run:"
echo "      lumina node auth --permissions header_r,blob_rw"
echo "    Copy the printed token into .env.local as CELESTIA_AUTH_TOKEN=<token>"
echo ""

lumina node --network "${NETWORK}"
