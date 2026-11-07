#!/usr/bin/env bash
# Safe 0x3E7C...38CB (v1.4.1, 2-of-3) batch for TSLA/USDG market 0x6dA5...4E7E, via approveHash (no Safe UI needed).
# Usage:
#   ./script/ops/safe-tsla.sh hash                      list the 4 Safe tx hashes (read-only)
#   ./script/ops/safe-tsla.sh approve <i> <keystore>    owner approves tx i (0..3)
#   ./script/ops/safe-tsla.sh exec <i> <keystore>       execute tx i once 2 owners approved
# Tx i uses Safe nonce i, so run in order 0,1,2,3.
set -euo pipefail
R=${RPC:-https://robinhood.drpc.org}
S=0x3E7CEd699783751FBc7eb1545144DCe6C64D38CB
Z=0x0000000000000000000000000000000000000000
TO=(0x4572B9F17C9052fDAB5691f0dFbF0715dd60F9dE 0x4572B9F17C9052fDAB5691f0dFbF0715dd60F9dE 0x7A7FfDFBB89C296106dA1A85B6fb13F27Ca357d8 0x16A295d143CeB63371078bFDf0681dBBeBff547a)
DATA=(
0x5db8eac8000000000000000000000000322f0929c4625ed5bad873c95208d54e1c003b2d0000000000000000000000004a1166a659a55625345e9515b32adecea5547c3800000000000000000000000000000000000000000000000000000000000000120000000000000000000000000000000000000000000000000000000000015f90000000000000000000000000000000000000000000000000000000746a528800
0x1b9e2c4a000000000000000000000000322f0929c4625ed5bad873c95208d54e1c003b2d00000000000000000000000000000000000000000000000000000000000005dc
0xe53c0456000000000000000000000000322f0929c4625ed5bad873c95208d54e1c003b2d0000000000000000000000000000000000000000000000000000000000000001
0xfe3513350000000000000000000000006da5d9c84dab4324da4a532f0bdb6b01aaec4e7e000000000000000000000000000000000000000000000000000000003b9aca00
)
NAMES=("oracle.setFeed TSLA" "oracle.setMaxDeviation TSLA 15%" "hub.setAssetAllowed TSLA" "factory.registerMarket 0x6dA5 credit 1000 USDG")

who() { case "$1" in 0x*) echo "--from $1 --unlocked";; *) echo "--account $1";; esac; }
h() { cast call $S "getTransactionHash(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,uint256)(bytes32)" \
  "${TO[$1]}" 0 "${DATA[$1]}" 0 0 0 0 $Z $Z "$1" --rpc-url "$R"; }

case "${1:-}" in
hash)
  echo "safe nonce now: $(cast call $S 'nonce()(uint256)' --rpc-url "$R")"
  for i in 0 1 2 3; do echo "$i ${NAMES[$i]}  $(h $i)"; done ;;
approve)
  H=$(h "$2"); echo "approve tx $2 (${NAMES[$2]}) hash $H"
  cast send $S "approveHash(bytes32)" "$H" $(who "$3") --rpc-url "$R" ;;
exec)
  i=$2; H=$(h "$i")
  [ "$(cast call $S 'nonce()(uint256)' --rpc-url "$R")" = "$i" ] || { echo "Safe nonce != $i, run in order"; exit 1; }
  case "$3" in 0x*) ME=$3;; *) ME=$(cast wallet address --account "$3");; esac
  SIG=0x; n=0
  for o in $(cast call $S "getOwners()(address[])" --rpc-url "$R" | tr -d '[],' | tr ' ' '\n' | sort -f); do
    ok=$(cast call $S "approvedHashes(address,bytes32)(uint256)" "$o" "$H" --rpc-url "$R")
    if [ "$ok" != "0" ] || [ "$(echo $o | tr A-F a-f)" = "$(echo $ME | tr A-F a-f)" ]; then
      SIG=${SIG}$(printf '%064s' "${o#0x}" | tr ' ' 0 | tr A-F a-f)$(printf '%064d' 0)01; n=$((n+1))
    fi
  done
  [ $n -ge 2 ] || { echo "only $n approval(s), need 2"; exit 1; }
  echo "exec tx $i (${NAMES[$i]}) with $n sigs"
  cast send $S "execTransaction(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,bytes)(bool)" \
    "${TO[$i]}" 0 "${DATA[$i]}" 0 0 0 0 $Z $Z "$SIG" $(who "$3") --rpc-url "$R" ;;
*) sed -n 2,7p "$0" ;;
esac
