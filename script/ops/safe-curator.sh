#!/usr/bin/env bash
# Safe 0x3E7C...38CB (v1.4.1, 2-of-3) batch to rotate CURATOR_ROLE on CuratorRegistry to a new wallet
# (old curator 0xD7193c...4Af3A keystore password lost).
# Usage:
#   ./script/ops/safe-curator.sh <newCurator> hash                  list the 2 Safe tx hashes (read-only)
#   ./script/ops/safe-curator.sh <newCurator> approve <i> <keystore> owner approves tx i (0..1)
#   ./script/ops/safe-curator.sh <newCurator> exec <i> <keystore>    execute tx i once 2 owners approved
#   ./script/ops/safe-curator.sh <newCurator> check                 show role state (read-only)
# Tx i uses Safe nonce BASE+i (BASE = Safe nonce when you start), run in order 0,1.
set -euo pipefail
NEW=${1:?new curator address}; shift
R=${RPC:-https://robinhood.drpc.org}
S=0x3E7CEd699783751FBc7eb1545144DCe6C64D38CB
Z=0x0000000000000000000000000000000000000000
REG=0x2a359cc48c2ab2C8197c2eD68616f95A12e0ec75
OLD=0xD7193c0A30e6267D4C13c7Fc912deA97A2F4Af3A
ROLE=$(cast keccak "CURATOR_ROLE")
STATE=script/ops/.safe-curator-base
TO=($REG $REG)
DATA=(
"$(cast calldata 'grantRole(bytes32,address)' $ROLE $NEW)"
"$(cast calldata 'revokeRole(bytes32,address)' $ROLE $OLD)"
)
NAMES=("registry.grantRole CURATOR $NEW" "registry.revokeRole CURATOR $OLD")

nonce() { cast call $S 'nonce()(uint256)' --rpc-url "$R"; }
[ -f $STATE ] || nonce > $STATE
BASE=$(cat $STATE)
who() { case "$1" in 0x*) echo "--from $1 --unlocked";; *) echo "--account $1";; esac; }
h() { cast call $S "getTransactionHash(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,uint256)(bytes32)" \
  "${TO[$1]}" 0 "${DATA[$1]}" 0 0 0 0 $Z $Z "$((BASE + $1))" --rpc-url "$R"; }

case "${1:-}" in
hash)
  echo "safe nonce now: $(nonce)  base: $BASE"
  for i in 0 1; do echo "$i ${NAMES[$i]}  $(h $i)"; done ;;
check)
  echo "new curator has role: $(cast call $REG 'hasRole(bytes32,address)(bool)' $ROLE $NEW --rpc-url "$R")"
  echo "old curator has role: $(cast call $REG 'hasRole(bytes32,address)(bool)' $ROLE $OLD --rpc-url "$R")" ;;
approve)
  H=$(h "$2"); echo "approve tx $2 (${NAMES[$2]}) hash $H"
  cast send $S "approveHash(bytes32)" "$H" $(who "$3") --rpc-url "$R" ;;
exec)
  i=$2; H=$(h "$i")
  [ "$(nonce)" = "$((BASE + i))" ] || { echo "Safe nonce $(nonce) != $((BASE + i)), run in order"; exit 1; }
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
*) sed -n 2,9p "$0" ;;
esac
