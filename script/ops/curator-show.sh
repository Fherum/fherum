#!/usr/bin/env bash
# FHERUM curator on Robinhood Chain mainnet: read-only proof (no keys, no tx).
# usage: ./script/ops/curator-show.sh
set -uo pipefail
R=${RPC:-https://robinhood.drpc.org}; EXP=https://robinhoodchain.blockscout.com
REG=0x2a359cc48c2ab2C8197c2eD68616f95A12e0ec75
TL=0x47cB8ee6CfDd18dA1450AC3a85a3179583Eb61A7
SAFE=0x3E7CEd699783751FBc7eb1545144DCe6C64D38CB
CUR=0x785213e0Fc5fB1A7c19AF26b3ea533Df56A448b7
OLD=0xD7193c0A30e6267D4C13c7Fc912deA97A2F4Af3A
MKTS=(0xa4eE12E6f0C998B7Cc2F7Cc7724B2598Cb9370D7 0x6dA5D9c84dAB4324dA4a532f0bdb6B01AAEc4E7E 0xdF7a59D46F96693bb759Bf4B7F0B15FCa201DcC3)
TX_GRANT=0xcf9003fad5a12b935ed97dd5400cda0f6854a738663224a91a8047fbf403231c
TX_REVOKE=0x7516aabb9345e6fd1cef4e52c1acedf13246d35ec466196b1cab307c9866f5cf

G=$'\e[32m'; Y=$'\e[33m'; B=$'\e[1m'; D=$'\e[2m'; N=$'\e[0m'
c() { cast call "$@" --rpc-url "$R"; }
ok() { [ "$1" = true ] && echo "${G}✔ true${N}" || echo "${Y}✘ $1${N}"; }
h() { echo; echo "${B}── $1${N}"; sleep 0.4; }
ROLE=$(cast keccak CURATOR_ROLE); ZERO=0x0000000000000000000000000000000000000000000000000000000000000000
PROPOSER=$(cast keccak PROPOSER_ROLE)

echo "${B}FHERUM · CURATOR · Robinhood Chain mainnet${N}"
echo "${D}read-only proof, every value read live from chain${N}"

h "1. Network"
echo "chain id      $(cast chain-id --rpc-url "$R")"
echo "block         $(cast block-number --rpc-url "$R")"

h "2. CuratorRegistry"
echo "address       $REG"
echo "bytecode      $(( ($(cast code $REG --rpc-url "$R" | wc -c) - 3) / 2 )) bytes deployed"
echo "timelock()    $(c $REG 'timelock()(address)')"

h "3. Who is curator"
echo "curator $CUR  hasRole $(ok "$(c $REG 'hasRole(bytes32,address)(bool)' $ROLE $CUR)")"
echo "old     $OLD  hasRole $(c $REG 'hasRole(bytes32,address)(bool)' $ROLE $OLD)  ${D}(revoked)${N}"
echo "admin   $SAFE  hasRole $(ok "$(c $REG 'hasRole(bytes32,address)(bool)' $ZERO $SAFE)")  ${D}(Safe)${N}"

h "4. Safe admin"
echo "owners        $(c $SAFE 'getOwners()(address[])')"
echo "threshold     $(c $SAFE 'getThreshold()(uint256)') of 3"

h "5. Timelock"
D_=$(c $TL 'getMinDelay()(uint256)' | cut -d' ' -f1)
echo "minDelay      $D_ s = ${B}$((D_ / 3600)) hours${N}"
echo "registry is proposer  $(ok "$(c $TL 'hasRole(bytes32,address)(bool)' $PROPOSER $REG)")"

h "6. Markets under curation"
for m in "${MKTS[@]}"; do
  col=$(c "$(c $m 'collateralAsset()(address)')" 'symbol()(string)' | tr -d '"')
  caps=($(c $m 'caps()(uint256,uint256,uint256,uint256)' | cut -d' ' -f1))
  printf "%-6s/USDG  %s  registered %s  timelock is curator %s  caps supply %s / borrow %s USDG\n" \
    "$col" "$m" "$(ok "$(c $REG 'isMarket(address)(bool)' $m)")" \
    "$(ok "$(c $m 'hasRole(bytes32,address)(bool)' $ROLE $TL)")" "$((caps[0] / 1000000))" "$((caps[1] / 1000000))"
done

h "7. Curator rotation via Safe 2-of-3"
for t in $TX_GRANT $TX_REVOKE; do
  st=$(cast receipt $t status --rpc-url "$R")
  echo "tx $t  block $(cast receipt $t blockNumber --rpc-url "$R")  status $(ok "$st") success"
done

h "8. Verify yourself"
echo "$EXP/address/$REG"
echo "$EXP/address/$CUR"
echo "$EXP/tx/$TX_GRANT"
echo
echo "${G}${B}Curator live on mainnet. Every change waits $((D_ / 3600))h in a public timelock.${N}"
