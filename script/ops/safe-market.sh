#!/usr/bin/env bash
# Safe 0x3E7C...38CB (v1.4.1, 2-of-3) batch to list a stock-token market deployed by script/AddMarket.s.sol.
# Usage:
#   ./script/ops/safe-market.sh <NVDA|AAPL|TSLA> <market> hash                    list the 4 Safe tx hashes (read-only)
#   ./script/ops/safe-market.sh <SYM> <market> approve <i> <keystore>            owner approves tx i (0..3)
#   ./script/ops/safe-market.sh <SYM> <market> exec <i> <keystore>               execute tx i once 2 owners approved
# Tx i uses Safe nonce BASE+i (BASE = Safe nonce when you start), run in order 0,1,2,3.
set -euo pipefail
SYM=${1:?symbol}; MKT=${2:?market}; shift 2
R=${RPC:-https://robinhood.drpc.org}
S=0x3E7CEd699783751FBc7eb1545144DCe6C64D38CB
Z=0x0000000000000000000000000000000000000000
ORACLE=0x4572B9F17C9052fDAB5691f0dFbF0715dd60F9dE; HUB=0x7A7FfDFBB89C296106dA1A85B6fb13F27Ca357d8; FACTORY=0x16A295d143CeB63371078bFDf0681dBBeBff547a
case $SYM in
  NVDA) T=0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC F=0x379EC4f7C378F34a1B47E4F3cbeBCbAC3E8E9F15 MAX=100000000000 ;;
  AAPL) T=0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9 F=0x6B22A786bAa607d76728168703a39Ea9C99f2cD0 MAX=150000000000 ;;
  TSLA) T=0x322F0929c4625eD5bAd873c95208D54E1c003b2d F=0x4A1166a659A55625345e9515b32adECea5547C38 MAX=500000000000 ;;
  *) echo "unknown symbol $SYM"; exit 1 ;;
esac
STATE=script/ops/.safe-$SYM-base
TO=($ORACLE $ORACLE $HUB $FACTORY)
DATA=(
"$(cast calldata 'setFeed(address,address,uint8,uint32,uint256)' $T $F 18 90000 $MAX)"
"$(cast calldata 'setMaxDeviation(address,uint16)' $T 1500)"
"$(cast calldata 'setAssetAllowed(address,bool)' $T true)"
"$(cast calldata 'registerMarket(address,uint256)' $MKT 1000000000)"
)
NAMES=("oracle.setFeed $SYM" "oracle.setMaxDeviation $SYM 15%" "hub.setAssetAllowed $SYM" "factory.registerMarket $MKT credit 1000 USDG")

nonce() { cast call $S 'nonce()(uint256)' --rpc-url "$R"; }
[ -f $STATE ] || nonce > $STATE
BASE=$(cat $STATE)
who() { case "$1" in 0x*) echo "--from $1 --unlocked";; *) echo "--account $1";; esac; }
h() { cast call $S "getTransactionHash(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,uint256)(bytes32)" \
  "${TO[$1]}" 0 "${DATA[$1]}" 0 0 0 0 $Z $Z "$((BASE + $1))" --rpc-url "$R"; }

case "${1:-}" in
hash)
  echo "safe nonce now: $(nonce)  base for $SYM: $BASE"
  for i in 0 1 2 3; do echo "$i ${NAMES[$i]}  $(h $i)"; done ;;
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
*) sed -n 2,7p "$0" ;;
esac
