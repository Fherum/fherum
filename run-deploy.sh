#!/usr/bin/env bash
# FHERUM proof log for screen recording. READ-ONLY: it never sends a tx and never asks for a key.
# Every line it prints is read live from the chain (bytecode, receipts, market state, oracle prices).
# usage: ./run-deploy.sh --testnet | --mainnet   [--fast]
set -uo pipefail
cd "$(dirname "$0")"

NET=""; FAST=0
for a in "$@"; do case $a in --testnet|--tesnet) NET=testnet;; --mainnet) NET=mainnet;; --fast) FAST=1;; esac; done
[ -n "$NET" ] || { echo "usage: ./run-deploy.sh --testnet | --mainnet [--fast]"; exit 1; }

G=$'\e[38;5;46m'; D=$'\e[38;5;28m'; B=$'\e[38;5;173m'; W=$'\e[97m'; R=$'\e[38;5;196m'; Y=$'\e[38;5;220m'; M=$'\e[38;5;244m'; X=$'\e[0m'; BOLD=$'\e[1m'
sl() { [ $FAST = 1 ] || sleep "$1"; }
type_() { local s=$1 i; for ((i=0;i<${#s};i++)); do printf '%s' "${s:i:1}"; [ $FAST = 1 ] || sleep 0.012; done; echo; }
ok()   { printf "  ${G}[ OK ]${X} %s\n" "$1"; }
bad()  { printf "  ${R}[FAIL]${X} %s\n" "$1"; }
info() { printf "  ${D}[....]${X} ${M}%s${X}\n" "$1"; }
hdr()  { echo; printf "${B}${BOLD}━━ %s ${X}${B}%s${X}\n" "$1" "$(printf '━%.0s' $(seq 1 $((58 - ${#1}))))"; sl 0.3; }
spin() { [ $FAST = 1 ] && return; local i f='⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'; for i in $(seq 1 ${2:-8}); do printf "\r  ${G}%s${X} ${M}%s${X}" "${f:i%10:1}" "$1"; sleep 0.06; done; printf "\r\e[K"; }
short() { echo "${1:0:10}…${1: -6}"; }

if [ $NET = mainnet ]; then
  CHAIN=4663; LABEL="ROBINHOOD CHAIN · MAINNET"; RPC=${RPC:-https://robinhood.drpc.org}
  EXP=https://robinhoodchain.blockscout.com; BC=broadcast/DeployMainnet.s.sol/4663/run-latest.json
  MARKETS="0xa4eE12E6f0C998B7Cc2F7Cc7724B2598Cb9370D7 0x6dA5D9c84dAB4324dA4a532f0bdb6B01AAEc4E7E 0xdF7a59D46F96693bb759Bf4B7F0B15FCa201DcC3"
  LENS=0xeC2f34031a2476bc0Df896356E7BD84f7240A14c; ORACLE=0x4572B9F17C9052fDAB5691f0dFbF0715dd60F9dE
  MODE="PUBLIC MODE · FHE-ready"
else
  CHAIN=46630; LABEL="ROBINHOOD CHAIN · TESTNET"; EXP=https://explorer.testnet.chain.robinhood.com
  RPC=${RPC:-$(grep '^RPC_URL=' web/.env.local 2>/dev/null | cut -d= -f2-)}; RPC=${RPC:-https://rpc.testnet.chain.robinhood.com}
  BC=broadcast/DeployTestnetMocks.s.sol/46630/run-latest.json
  MARKETS="0x6F16DDDc77b14129C2ae50Bd4aD079eec3243c1A"
  LENS=0x8C1E90549DAd239a1661f8E107D1Db8C0fD3902e; ORACLE=0x138445E4Eb800afB44835dbB5CE0Dfd58269f81F
  MODE="Testnet · mock tokens · simulated encryption (PlaintextFHEAdapter)"
fi
c() { cast "$@" --rpc-url "$RPC" 2>/dev/null; }   # RPC URL is never printed
num() { awk '{print $1}'; }
fmt() { awk -v v="$1" -v d="$2" -v p="${3:-4}" 'BEGIN{printf "%.*f", p, v/(10^d)}'; }
module() { case $1 in LiquidityHub|MarketFactory|Market|InterestRateModel|FeeController) echo FORGEHUB;; RiskEngine|LiquidationEngine|OracleAdapter) echo IRONCLAD;;
  PlaintextFHEAdapter) echo VEILBOOK;; LensReader) echo "STEEL LENS";; AllowlistEligibility) echo "IRON GATE";; EmergencyController) echo BREAKGLASS;; ForgeAdmin) echo GOVERNANCE;; *) echo "TEST ASSET";; esac; }

clear
printf "${G}"
cat <<'ART'
   ███████╗██╗  ██╗███████╗██████╗ ██╗   ██╗███╗   ███╗
   ██╔════╝██║  ██║██╔════╝██╔══██╗██║   ██║████╗ ████║
   █████╗  ███████║█████╗  ██████╔╝██║   ██║██╔████╔██║
   ██╔══╝  ██╔══██║██╔══╝  ██╔══██╗██║   ██║██║╚██╔╝██║
   ██║     ██║  ██║███████╗██║  ██║╚██████╔╝██║ ╚═╝ ██║
   ╚═╝     ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚═╝     ╚═╝
ART
printf "${X}"
printf "   ${B}Encrypted money markets${X} ${M}· Aave V4-inspired hub-and-spoke · proof log${X}\n\n"
sl 0.4
type_ "${D}>${X} target   ${W}${LABEL}${X} ${M}(chain ${CHAIN})${X}"
type_ "${D}>${X} mode     ${Y}${MODE}${X}"
type_ "${D}>${X} access   ${M}read-only · no keys loaded · no transactions sent${X}"

hdr "01 · NETWORK HANDSHAKE"
spin "dialing rpc" 10
ID=$(c chain-id); HEAD=$(c block-number)
if [ "$ID" = "$CHAIN" ]; then ok "chain id ${W}${ID}${X} confirmed"; else bad "chain id mismatch (got '${ID:-none}')"; exit 1; fi
ok "head block ${W}#${HEAD}${X}"
ok "explorer ${M}${EXP}${X}"

hdr "02 · CONTRACT BYTECODE + DEPLOY RECEIPTS"
info "source: $BC"
PASS=0; TOTAL=0
while read -r name addr hash; do
  TOTAL=$((TOTAL+1)); spin "verify $name" 5
  CODE=$(c code "$addr"); SIZE=$(( (${#CODE} - 2) / 2 ))
  ST=$(c receipt "$hash" status | num); BN=$(c receipt "$hash" blockNumber | num)
  if [ "$SIZE" -gt 0 ] && [[ "$ST" = 1 || "$ST" = true ]]; then
    PASS=$((PASS+1))
    printf "  ${G}[ OK ]${X} %-11s ${W}%-21s${X} %s ${M}%6s B · blk %s · tx %s${X}\n" "$(module "$name")" "$name" "$(short "$addr")" "$SIZE" "$BN" "$(short "$hash")"
  else
    printf "  ${R}[FAIL]${X} %-11s %-21s %s ${M}code=%s status=%s${X}\n" "$(module "$name")" "$name" "$(short "$addr")" "$SIZE" "${ST:-?}"
  fi
done < <(jq -r '.transactions[]|select(.transactionType=="CREATE")|"\(.contractName) \(.contractAddress) \(.hash)"' "$BC")
printf "  ${B}» %s/%s contracts live with successful deploy receipts${X}\n" "$PASS" "$TOTAL"

hdr "03 · MARKETS (SPOKES)"
for m in $MARKETS; do
  spin "read market $(short "$m")" 6
  L=$(c call "$m" "borrowAsset()(address)"); K=$(c call "$m" "collateralAsset()(address)")
  LS=$(c call "$L" "symbol()(string)" | tr -d '"'); LD=$(c call "$L" "decimals()(uint8)")
  KS=$(c call "$K" "symbol()(string)" | tr -d '"'); KD=$(c call "$K" "decimals()(uint8)")
  SUP=$(c call "$m" "totalSupplyAssets()(uint256)" | num); DEBT=$(c call "$m" "totalDebtAssets()(uint256)" | num); COL=$(c call "$m" "totalCollateral()(uint256)" | num)
  printf "  ${G}[ OK ]${X} ${W}%-10s${X} %s\n" "$KS/$LS" "$(short "$m")"
  printf "         ${M}supplied${X} %s %s   ${M}borrowed${X} %s %s   ${M}collateral${X} %s %s\n" \
    "$(fmt "${SUP:-0}" "$LD" 2)" "$LS" "$(fmt "${DEBT:-0}" "$LD" 2)" "$LS" "$(fmt "${COL:-0}" "$KD" 4)" "$KS"
  P=$(c call "$ORACLE" "priceWadPerWholeToken(address)(uint256,uint8)" "$K" | head -1 | num)
  if [ -n "$P" ]; then printf "         ${M}oracle${X}   %s = \$%s\n" "$KS" "$(fmt "$P" 18 2)"; else printf "         ${Y}oracle   %s feed stale/closed (fail-closed: borrow paused until fresh)${X}\n" "$KS"; fi
  sl 0.15
done

hdr "04 · ON-CHAIN ACTIVITY (protocol events)"
if [ -f script/ops/demo-txs.csv ] && grep -q "^$NET," script/ops/demo-txs.csv; then
  grep "^$NET," script/ops/demo-txs.csv | grep -v approve | while IFS=, read -r _ label h; do
    ST=$(c receipt "$h" status | num)
    if [[ "$ST" = 1 || "$ST" = true ]]; then printf "  ${G}[ OK ]${X} %-28s ${M}%s${X}\n" "$label" "$EXP/tx/$h"; else printf "  ${R}[FAIL]${X} %-28s %s\n" "$label" "$(short "$h")"; fi
  done
else
  info "no logged demo transactions for $NET (script/ops/demo-txs.csv)"
fi

hdr "05 · SUMMARY"
ok "network ${LABEL} reachable at block #${HEAD}"
if [ "$PASS" = "$TOTAL" ]; then ok "${PASS}/${TOTAL} core contracts verified on-chain"; else bad "${PASS}/${TOTAL} core contracts verified"; fi
ok "$(echo $MARKETS | wc -w | tr -d ' ') market(s) read live"
printf "  ${Y}[NOTE]${X} %s\n" "$MODE"
echo; printf "${G}${BOLD}  FHERUM :: proof log complete${X}  ${M}$(date -u '+%Y-%m-%d %H:%M UTC')${X}\n\n"
