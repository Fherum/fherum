#!/usr/bin/env bash
# Build the Safe Transaction Builder batch for M1 ASSAY (24 calls) from live chain reads.
# Usage: script/assay-safe-json.sh <assayRegistryAddress> [out.json]
set -euo pipefail
ASSAY=${1:?assay address}
OUT=${2:-out/safe-batch-assay.json}
RPC=${RPC:-https://robinhood.drpc.org}
SAFE=0x3E7CEd699783751FBc7eb1545144DCe6C64D38CB
MARKETS="0xbd603495e9267667309b50ADb533Ed6316189868 0xD0f9402F4aCdE4775d22D6bD5F26a3b387a991dF 0x7d8C5aE513F77E51B5Ce5D4f52d61436Be62Eb16 0x2E97d8Eb400Ad2418499342630a295CBAFAA5EEc 0xbf42dCd5EbA55c3dE22AcCF0ad2ba080FB2448EF 0x31c45ad8d37C762b458ed9361b3E4Af672046eA1 0x19dabE92D4c8dBEC53aA558B988ccbd7825589DC 0x55027eF1f7EfbbF8EE042f5e0fc1Bd715647B6BC 0xD68414C7E2C16B17EAc72FDF9A5711dDECb92abE 0x8CB37699e1F9d64Ea08f0414C2Ec4dE1106eA703 0x6dA5D9c84dAB4324dA4a532f0bdb6B01AAEc4E7E 0xdF7a59D46F96693bb759Bf4B7F0B15FCa201DcC3"

[ "$(cast code "$ASSAY" --rpc-url "$RPC")" != "0x" ] || { echo "no code at $ASSAY" >&2; exit 1; }
ORACLE=$(cast call "$ASSAY" "oracle()(address)" --rpc-url "$RPC")
tx() { printf '{"to":"%s","value":"0","data":"%s","contractMethod":null,"contractInputsValues":null}' "$1" "$2"; }
TXS=""
for m in $MARKETS; do
  [ "$(cast call "$m" "oracle()(address)" --rpc-url "$RPC")" = "$ORACLE" ] || { echo "oracle mismatch $m" >&2; exit 1; }
  T=$(cast call "$m" "collateralAsset()(address)" --rpc-url "$RPC")
  S=$(cast call "$T" "symbol()(string)" --rpc-url "$RPC" | tr -d '"')
  echo "$S $T"
  TXS="$TXS${TXS:+,}$(tx "$ASSAY" "$(cast calldata 'register(address,uint256)' "$T" 1000000000000000000)"),$(tx "$ORACLE" "$(cast calldata 'setMarketStatus(address,address)' "$T" "$ASSAY")")"
done
mkdir -p "$(dirname "$OUT")"
printf '{"version":"1.0","chainId":"4663","meta":{"name":"FHERUM M1 ASSAY (12 stock tokens)","createdFromSafeAddress":"%s"},"transactions":[%s]}\n' "$SAFE" "$TXS" > "$OUT"
echo "wrote $OUT (24 calls), oracle $ORACLE"
