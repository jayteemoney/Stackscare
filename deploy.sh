#!/usr/bin/env bash
# ClarityCare Deployment Script
#
# Prerequisites:
#   - clarinet installed: https://github.com/hirosystems/clarinet
#   - Stacks wallet private key set in env or clarinet secrets
#   - Pinata account for IPFS: https://pinata.cloud
#   - Anthropic API key: https://console.anthropic.com
#
# Usage:
#   ./deploy.sh [testnet|mainnet]
#
# References:
#   - Clarinet deployments: https://docs.hiro.so/clarinet/guides/how-to-deploy-with-clarinet-cli
#   - Stacks Explorer: https://explorer.hiro.so

set -e

NETWORK=${1:-testnet}
PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "==> Deploying ClarityCare to $NETWORK"
echo ""

# 1. Check contract syntax
echo "[1/4] Checking Clarity contract..."
cd "$PROJECT_ROOT/claritycare-contracts"
clarinet check
echo "    Contract syntax OK"

# 2. Run tests
echo "[2/4] Running contract tests..."
npm test
echo "    All tests passed"

# 3. Deploy contract via Clarinet
echo "[3/4] Deploying contract to $NETWORK..."
if [ "$NETWORK" = "mainnet" ]; then
  echo "    WARNING: You are deploying to MAINNET."
  read -r -p "    Type 'yes' to confirm: " CONFIRM
  if [ "$CONFIRM" != "yes" ]; then
    echo "    Aborted."
    exit 1
  fi
  clarinet deployments apply --mainnet
else
  clarinet deployments apply --testnet
fi

echo "    Contract deployed!"
echo ""
echo "[4/4] Next steps:"
echo "    1. Copy the deployed contract address from the output above"
echo "    2. Set NEXT_PUBLIC_CONTRACT_ADDRESS=<address> in frontend/.env.local"
echo "    3. Start backend:"
echo "       cd backend && pip install -r requirements.txt && uvicorn main:app --reload"
echo "    4. Start frontend:"
echo "       cd frontend && npm run dev"
echo ""
echo "Done. View your contract on Stacks Explorer:"
if [ "$NETWORK" = "mainnet" ]; then
  echo "    https://explorer.hiro.so"
else
  echo "    https://explorer.hiro.so/?chain=testnet"
fi
