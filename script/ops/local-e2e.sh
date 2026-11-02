#!/usr/bin/env bash
# Local end-to-end rehearsal of script/DeployMainnet.s.sol on a throwaway anvil chain (chainid 31337).
# No real network. Uses anvil's well-known dev key #0 (public test key, not a secret) only against 127.0.0.1.
# Usage: script/ops/local-e2e.sh            (starts/stops its own anvil on :8545)
set -euo pipefail
cd "$(dirname "$0")/../.."
PORT=${PORT:-8545}
RPC=http://127.0.0.1:$PORT
LOG=${TMPDIR:-/tmp}/fherum-anvil.log

anvil --port "$PORT" --chain-id 31337 --silent >"$LOG" 2>&1 &
ANVIL_PID=$!
trap 'kill $ANVIL_PID 2>/dev/null || true' EXIT
for _ in $(seq 1 50); do cast chain-id --rpc-url "$RPC" >/dev/null 2>&1 && break; sleep 0.2; done
[ "$(cast chain-id --rpc-url "$RPC")" = "31337" ] || { echo "anvil not on 31337"; exit 1; }

# Anvil default account 0 (public dev key). Accounts 1..3 used as Safe/guardian/curator stand-ins.
ANVIL_KEY0=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
DEPLOYER=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
export GOVERNOR_SAFE=0x70997970C51812dc3A010C7d01b50e0d17dc79C8
export GUARDIAN=0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC
export CURATOR=0x90F79bf6EB2c4f870365E51d0b2bc0f3B4F1E5B9

out=$(forge script script/ops/LocalMocks.s.sol --rpc-url "$RPC" --private-key "$ANVIL_KEY0" --broadcast 2>&1)
get() { echo "$out" | awk -v k="$1" '$1==k {print $2}' | tail -1; }
export BORROW_ASSET=$(get BORROW_ASSET) COLLATERAL_ASSET=$(get COLLATERAL_ASSET)
export BORROW_FEED=$(get BORROW_FEED) COLLATERAL_FEED=$(get COLLATERAL_FEED)
echo "mocks: borrow=$BORROW_ASSET collat=$COLLATERAL_ASSET"

export CONFIRM_MAINNET=yes ALLOW_ANVIL=yes TIMELOCK_DELAY=172800
export BORROW_DECIMALS=6 COLLATERAL_DECIMALS=18
export BORROW_MAX_ANSWER=200000000 COLLATERAL_MAX_ANSWER=10000000000000   # $2 / $100k caps (8 dec)
export COLLATERAL_MAX_DEVIATION_BPS=${COLLATERAL_MAX_DEVIATION_BPS:-1500} BORROW_MAX_DEVIATION_BPS=${BORROW_MAX_DEVIATION_BPS:-300}
export CURATOR_FEE_SHARE_WAD=${CURATOR_FEE_SHARE_WAD:-200000000000000000} EXPECT_CURATOR_FEE_SHARE_WAD=${CURATOR_FEE_SHARE_WAD:-200000000000000000}

# Negative test: refuses without CONFIRM_MAINNET.
if CONFIRM_MAINNET=no forge script script/DeployMainnet.s.sol --rpc-url "$RPC" >/dev/null 2>&1; then
  echo "FAIL: ran without CONFIRM_MAINNET"; exit 1; else echo "OK: refused without CONFIRM_MAINNET=yes"; fi
# Negative test: refuses on 31337 without ALLOW_ANVIL.
if ALLOW_ANVIL=no forge script script/DeployMainnet.s.sol --rpc-url "$RPC" >/dev/null 2>&1; then
  echo "FAIL: ran on 31337 without ALLOW_ANVIL"; exit 1; else echo "OK: refused wrong chain"; fi

dep=$(forge script script/DeployMainnet.s.sol --rpc-url "$RPC" --private-key "$ANVIL_KEY0" --broadcast 2>&1) || { echo "$dep"; exit 1; }
echo "$dep" | sed -n '/== FHERUM/,/MARKET/p'
dget() { echo "$dep" | awk -v k="$1" '$1==k {print $2}' | tail -1; }
export FACTORY=$(dget FACTORY) MARKET=$(dget MARKET) LENS=$(dget LENS) DEPLOYER

forge script script/VerifyDeployment.s.sol --rpc-url "$RPC" 2>&1 | sed -n '/chainId/,$p'

# Monitor smoke test against the local chain.
if command -v node >/dev/null; then
  RPC_URL=$RPC LENS=$LENS MARKETS=$MARKET node script/ops/monitor.mjs --once || true
fi
echo "E2E DONE"
