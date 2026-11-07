# Oracles, tokens and infra on Robinhood Chain mainnet (4663)

Last checked: 2026-11-02. Method: web docs + direct on-chain reads (`cast call` via public RPC, no keys).
Status legend: VERIFIED-ONCHAIN = contract read returned the expected description/symbol on chain 4663;
LISTED = appears in an official source; UNVERIFIED = neither confirmed by official doc nor safe to rely on.
Re-check every address on the explorer the day of deployment.

## Network

| Item | Value | Status |
|---|---|---|
| Chain ID | 4663 (testnet: 46630) | VERIFIED-ONCHAIN (`eth_chainId` = 4663) |
| Official RPC | https://rpc.mainnet.chain.robinhood.com (rate-limited, also `/rpc`) | LISTED: https://docs.robinhood.com/chain/connecting |
| Public RPC (used by monitor) | https://robinhood-rpc.publicnode.com | VERIFIED-ONCHAIN; **does not serve historical state → fails as `anvil --fork-url`** |
| Public RPC (fork-capable) | https://robinhood.drpc.org | VERIFIED: fork simulation succeeded 2026-11-02 |
| Explorer | https://robinhoodchain.blockscout.com (Blockscout, API v2) | LISTED (chainid.network / docs); verify Foundry `--verifier blockscout --verifier-url https://robinhoodchain.blockscout.com/api/` before use |
| Chain registry | https://chainid.network/chains.json | LISTED |

## Price oracles

**Chainlink Data Feeds — LIVE.** Source of truth: https://docs.chain.link/data-feeds/price-feeds/addresses?network=robinhood
and the machine-readable directory https://reference-data-directory.vercel.app/feeds-robinhood-mainnet.json (58 feeds on 2026-11-02).
Tokenized equity feeds: https://docs.chain.link/data-feeds/tokenized-equity-feeds/robinhood ; Robinhood doc: https://docs.robinhood.com/chain/oracles-and-price-feeds/
All feeds: 8 decimals (USD pairs), heartbeat 86400 s, deviation threshold 0.5 %. Equity feeds have `marketHours = us_equities_24/5` — they **do not update on weekends/holidays**, so staleness must allow > 48h+ or the market must be gated with `IMarketStatus` (OracleAdapter.setMarketStatus).

| Feed | Proxy | Status |
|---|---|---|
| ETH / USD | 0x78F3556b67E17Df817D51Ef5a990cDaF09E8d3A9 | VERIFIED-ONCHAIN (`description()`="ETH / USD", 8 dec) |
| USDC / USD | 0x9e6f4605992a899eE2999999F3Ec80C41F452546 | VERIFIED-ONCHAIN |
| USDG / USD | 0x61B7e5650328764B076A108EFF5fa7282a1B9aD2 | VERIFIED-ONCHAIN |
| Robinhood NVDA / USD | 0x379EC4f7C378F34a1B47E4F3cbeBCbAC3E8E9F15 | VERIFIED-ONCHAIN (`description()`="RHNVDA / USD") |
| Robinhood TSLA / USD | 0x4A1166a659A55625345e9515b32adECea5547C38 | LISTED (directory) |
| Robinhood AAPL / USD | 0x6B22A786bAa607d76728168703a39Ea9C99f2cD0 | LISTED |
| Robinhood SPY / USD | 0x319724394D3A0e3669269846abE664Cd621f9f6A | LISTED |
| Robinhood QQQ / USD | 0x80901d846d5D7B030F26B480776EE3b29374C2ae | LISTED |
| WBTC / USD | 0x62107b0d3adA75fc1697fD342d99eed947a3aA5E | LISTED |
| USDT / USD | 0xbf3550B6fAe1671da7C238Af12e03Ac586BEf3B1 | LISTED |
| WSTETH / USD | 0x3F5040B50FB37934573B210fE54B53a6F1A792E8 | LISTED |

(Full list: the directory JSON. Never copy a proxy from a third-party site.)

**Pyth, RedStone, Chronicle — UNVERIFIED.** No official Robinhood-Chain-4663 deployment page was found for any of them in this research pass. Do not use until the provider's own docs list chain 4663.

## Tokens

| Token | Address | Status |
|---|---|---|
| WETH | 0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73 | VERIFIED-ONCHAIN (symbol WETH, 18 dec); LISTED https://docs.robinhood.com/chain/contracts/ — re-confirm |
| USDG (Global Dollar, Paxos) | 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168 | VERIFIED-ONCHAIN (name "Global Dollar", 6 dec). Has Chainlink USDG/USD feed. |
| "USDC" 0x7eCca74AB958900EBBeD1b258cAb50Ae69409550 | — | **FAKE / DO NOT USE**: `name()` = "FatCatBatRatWifHat", 18 decimals. |
| Native USDC (Circle) | not found | UNVERIFIED — check https://developers.circle.com/stablecoins/usdc-contract-addresses before using a USDC market. A USDC/USD feed exists, but no official token address was confirmed. |
| NVDA stock token | 0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec | symbol NVDA, 18 dec on-chain; issuer source UNVERIFIED (found via third-party docs.crius.sh) |
| TSLA stock token | 0x322f0929c4625ed5bad873c95208d54e1c003b2d | same — UNVERIFIED issuer |
| AAPL stock token | 0xaf3d76f1834a1d425780943c99ea8a608f8a93f9 | same — UNVERIFIED issuer |
| SPY stock token | 0x117cc2133c37b721f49de2a7a74833232b3b4c0c | same — UNVERIFIED issuer |

Stock tokens: before listing, confirm the issuer, transfer restrictions (allowlists/blocklists could brick liquidations), pause/upgrade authority and corporate-action handling (splits!). Not recommended for V1 launch.

## Safe (multisig)

Canonical Safe contracts have bytecode on 4663 (VERIFIED-ONCHAIN `codesize > 0`):
Safe 1.4.1 singleton 0x41675C099F32341bf84BFc5382aF534df5C7461a, SafeL2 1.4.1 0x29fcB43b46531BcA003ddC8FCB67FFE91900C762, ProxyFactory 1.4.1 0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67, Safe 1.3.0 0xd9Db270c1B5E3Bd161E8c8503c55cEABeE709552, ProxyFactory 1.3.0 0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2, Multicall3 0xcA11bde05977b3631167028862bE2a173976CA11.
Official app.safe.global UI / Transaction Service support for 4663: **UNVERIFIED** (https://docs.safe.global/advanced/smart-account-supported-networks). If the UI is not available, deploy the Safe via the ProxyFactory with `safe-cli`/scripts and sign via a self-hosted Safe UI or `safe-cli`; budget time for this.

## Recommended V1 launch pair

Collateral WETH (ETH/USD feed, 24/7) — Borrow USDG (USDG/USD feed). Both feeds and tokens verified on-chain, crypto feeds trade 24/7 (no weekend staleness issue). This pair was used for the fork simulation.

## Stock-token markets (checked 2026-11-07)

TSLA / NVDA / AAPL tokens VERIFIED-ONCHAIN: name "<Co> • Robinhood Token", 18 dec, EIP-1967 beacon = 0xe10b6f6B275de231345c20D14Ab812db62151b00 (shared Stock beacon; copycat tickers exist, AddMarket.s.sol rejects any token not on this beacon).
Feeds VERIFIED-ONCHAIN: RHTSLA / USD, RHNVDA / USD, Robinhood AAPL / USD (8 dec, answering). Price already includes the ERC-8056 multiplier, never apply uiMultiplier again.
Add a market: script/AddMarket.s.sol (deploy, any EOA) then the printed 4-call Safe batch. Fork rehearsal: test/fork/AddMarketFork.t.sol.
