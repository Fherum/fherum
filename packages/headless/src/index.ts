// @fherum/headless — read FHERUM lending markets and build transactions from any app.
// Read-only helpers use a viem PublicClient. Write helpers only RETURN tx requests
// ({ to, data, value }); signing and sending stays in the integrator's wallet.
import {
  createPublicClient,
  encodeFunctionData,
  http,
  parseAbi,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";

// ── network ────────────────────────────────────────────────────────────────
export const ROBINHOOD_CHAIN = {
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://robinhood.daybreak-rpc.network"] } },
  blockExplorers: { default: { name: "Blockscout", url: "https://robinhoodchain.blockscout.com" } },
} as const;

/** Public mainnet addresses (Robinhood Chain 4663). Verify any address with `cast code` before relying on it. */
export const FHERUM = {
  lensReader: "0xeC2f34031a2476bc0Df896356E7BD84f7240A14c",
  marketFactory: "0x16A295d143CeB63371078bFDf0681dBBeBff547a",
  liquidityHub: "0x7A7FfDFBB89C296106dA1A85B6fb13F27Ca357d8",
  oracleAdapter: "0x4572B9F17C9052fDAB5691f0dFbF0715dd60F9dE",
  hearth: {
    router: "0x15619a79ea3A3128D56B4FDFa11b7F46D3D67Fc3",
    accountFactory: "0x9Af0369575FE50afA36F160c88f2A74Fda339d12",
    hookRegistry: "0xa33c7120e65545854eccd69E8C9Bd657d8141eD8",
  },
  tokens: {
    USDG: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168",
    WETH: "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73",
  },
  /** Known markets [pair, address]. Loan asset is USDG for all of them. */
  markets: [
    ["WETH/USDG", "0xa4eE12E6f0C998B7Cc2F7Cc7724B2598Cb9370D7"],
    ["COIN/USDG", "0xbd603495e9267667309b50ADb533Ed6316189868"],
    ["SPY/USDG", "0xD0f9402F4aCdE4775d22D6bD5F26a3b387a991dF"],
    ["SPCX/USDG", "0x7d8C5aE513F77E51B5Ce5D4f52d61436Be62Eb16"],
    ["GOOGL/USDG", "0x2E97d8Eb400Ad2418499342630a295CBAFAA5EEc"],
    ["QQQ/USDG", "0xbf42dCd5EbA55c3dE22AcCF0ad2ba080FB2448EF"],
    ["META/USDG", "0x31c45ad8d37C762b458ed9361b3E4Af672046eA1"],
    ["AAPL/USDG", "0x19dabE92D4c8dBEC53aA558B988ccbd7825589DC"],
    ["AMZN/USDG", "0x55027eF1f7EfbbF8EE042f5e0fc1Bd715647B6BC"],
    ["MSFT/USDG", "0xD68414C7E2C16B17EAc72FDF9A5711dDECb92abE"],
    ["MU/USDG", "0x8CB37699e1F9d64Ea08f0414C2Ec4dE1106eA703"],
    ["TSLA/USDG", "0x6dA5D9c84dAB4324dA4a532f0bdb6B01AAEc4E7E"],
    ["NVDA/USDG", "0xdF7a59D46F96693bb759Bf4B7F0B15FCa201DcC3"],
    ["GLD/USDG", "0xABd644EACDdeBCD86ce1fE1C6616C6EFD99e1c86"],
    ["SLV/USDG", "0x23C369264b4AcBE9d5eE201fb40415244f0a3b36"],
    ["USO/USDG", "0x1e3347b2e99568c360C72E0bfE4F359f55cB2D6a"],
  ] as const satisfies readonly (readonly [string, Address])[],
} as const;

// ── ABIs (subset) ──────────────────────────────────────────────────────────
export const lensAbi = parseAbi([
  "struct MarketSnapshot { uint256 totalSupplyAssets; uint256 totalDebtAssets; uint256 totalSupplyShares; uint256 totalBorrowShares; uint256 totalCollateral; uint256 availableLiquidity; uint256 utilizationWad; uint256 borrowRatePerYearWad; uint256 supplyRatePerYearWad; uint256 supplyCap; uint256 borrowCap; uint256 walletSupplyCap; uint256 walletBorrowCap; uint256 ltvWad; uint256 liquidationThresholdWad; uint256 liquidationBonusWad; uint256 closeFactorWad; uint256 reserveFactorWad; uint256 dustValueWad; uint256 supplyIndex; uint256 borrowIndex; bool paused; bool borrowPaused; bool removeCollateralPaused; bool liquidationPaused; bool repayPaused; uint8 privacyMode; address eligibility; }",
  "struct UserSnapshot { uint256 supplyShares; uint256 supplyAssets; uint256 collateralAssets; uint256 debtShares; uint256 debtAssets; uint256 healthFactorWad; bool eligible; }",
  "function snapshot(address market) view returns (MarketSnapshot)",
  "function userSnapshot(address market, address user) view returns (UserSnapshot)",
]);
export const marketAbi = parseAbi([
  "function collateralAsset() view returns (address)",
  "function borrowAsset() view returns (address)",
  "function supply(uint256 assets)",
  "function withdraw(uint256 assets)",
  "function addCollateral(uint256 assets)",
  "function removeCollateral(uint256 assets)",
  "function borrow(uint256 assets)",
  "function repay(address onBehalf, uint256 assets)",
]);
export const erc20Abi = parseAbi([
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
]);
export const hearthAbi = parseAbi([
  "function createAccount(address executor) returns (address account)",
  "function applyStack(address vault, bytes32 stackId)",
]);

// ── types ──────────────────────────────────────────────────────────────────
export type TxRequest = { to: Address; data: Hex; value: bigint };
export type Token = { address: Address; symbol: string; decimals: number };
export type Market = {
  address: Address;
  collateral: Token;
  loan: Token;
  supplyApy: number; // fraction, 0.0425 = 4.25%
  borrowApy: number;
  utilization: number;
  totalSupply: bigint; // loan-asset units
  totalDebt: bigint;
  availableLiquidity: bigint;
  ltv: number;
  liquidationThreshold: number;
  supplyCap: bigint;
  borrowCap: bigint;
  paused: boolean;
  borrowPaused: boolean;
};
export type Position = {
  supplied: bigint;
  collateral: bigint;
  debt: bigint;
  healthFactor: number; // Infinity when no debt
  eligible: boolean;
};

const wad = (v: bigint) => Number(v) / 1e18;

// ── client ─────────────────────────────────────────────────────────────────
export type HeadlessOptions = { rpcUrl?: string; client?: PublicClient; lensReader?: Address };

export function createHeadless(opts: HeadlessOptions = {}) {
  const client: PublicClient =
    opts.client ??
    (createPublicClient({ chain: ROBINHOOD_CHAIN, transport: http(opts.rpcUrl ?? ROBINHOOD_CHAIN.rpcUrls.default.http[0]) }) as PublicClient);
  const lens = opts.lensReader ?? FHERUM.lensReader;
  const tokens = new Map<string, Promise<Token>>();

  const token = (address: Address) => {
    const k = address.toLowerCase();
    if (!tokens.has(k))
      tokens.set(
        k,
        Promise.all([
          client.readContract({ address, abi: erc20Abi, functionName: "symbol" }),
          client.readContract({ address, abi: erc20Abi, functionName: "decimals" }),
        ]).then(([symbol, decimals]) => ({ address, symbol, decimals })),
      );
    return tokens.get(k)!;
  };

  async function getMarket(market: Address): Promise<Market> {
    const [s, col, bor] = await Promise.all([
      client.readContract({ address: lens, abi: lensAbi, functionName: "snapshot", args: [market] }),
      client.readContract({ address: market, abi: marketAbi, functionName: "collateralAsset" }),
      client.readContract({ address: market, abi: marketAbi, functionName: "borrowAsset" }),
    ]);
    const [collateral, loan] = await Promise.all([token(col), token(bor)]);
    return {
      address: market,
      collateral,
      loan,
      supplyApy: wad(s.supplyRatePerYearWad),
      borrowApy: wad(s.borrowRatePerYearWad),
      utilization: wad(s.utilizationWad),
      totalSupply: s.totalSupplyAssets,
      totalDebt: s.totalDebtAssets,
      availableLiquidity: s.availableLiquidity,
      ltv: wad(s.ltvWad),
      liquidationThreshold: wad(s.liquidationThresholdWad),
      supplyCap: s.supplyCap,
      borrowCap: s.borrowCap,
      paused: s.paused,
      borrowPaused: s.borrowPaused,
    };
  }

  /** Reads every known market; markets that fail to read are skipped, not thrown. */
  async function listMarkets(addresses: readonly Address[] = FHERUM.markets.map(([, a]) => a)): Promise<Market[]> {
    const rs = await Promise.allSettled(addresses.map(getMarket));
    return rs.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
  }

  async function getPosition(market: Address, user: Address): Promise<Position> {
    const u = await client.readContract({ address: lens, abi: lensAbi, functionName: "userSnapshot", args: [market, user] });
    return {
      supplied: u.supplyAssets,
      collateral: u.collateralAssets,
      debt: u.debtAssets,
      healthFactor: u.debtAssets === BigInt(0) ? Infinity : wad(u.healthFactorWad),
      eligible: u.eligible,
    };
  }

  /** Approve tx if `owner` has not yet approved `amount` of `asset` to `spender`, else null. */
  async function approvalIfNeeded(asset: Address, owner: Address, spender: Address, amount: bigint): Promise<TxRequest | null> {
    const a = await client.readContract({ address: asset, abi: erc20Abi, functionName: "allowance", args: [owner, spender] });
    return a >= amount ? null : tx.approve(asset, spender, amount);
  }

  return { client, getMarket, listMarkets, getPosition, approvalIfNeeded, tx };
}

// ── tx builders (pure, no network) ─────────────────────────────────────────
const call = (to: Address, data: Hex): TxRequest => ({ to, data, value: BigInt(0) });
const m = (market: Address, functionName: "supply" | "withdraw" | "addCollateral" | "removeCollateral" | "borrow", assets: bigint) =>
  call(market, encodeFunctionData({ abi: marketAbi, functionName, args: [assets] }));

export const tx = {
  approve: (asset: Address, spender: Address, amount: bigint) =>
    call(asset, encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [spender, amount] })),
  supply: (market: Address, assets: bigint) => m(market, "supply", assets),
  withdraw: (market: Address, assets: bigint) => m(market, "withdraw", assets),
  addCollateral: (market: Address, assets: bigint) => m(market, "addCollateral", assets),
  removeCollateral: (market: Address, assets: bigint) => m(market, "removeCollateral", assets),
  borrow: (market: Address, assets: bigint) => m(market, "borrow", assets),
  repay: (market: Address, onBehalf: Address, assets: bigint) =>
    call(market, encodeFunctionData({ abi: marketAbi, functionName: "repay", args: [onBehalf, assets] })),
  hearth: {
    /** Creates a per-owner HEARTH vault; `executor` is the agent allowed to act through the hook stack. */
    createAccount: (executor: Address, factory: Address = FHERUM.hearth.accountFactory) =>
      call(factory, encodeFunctionData({ abi: hearthAbi, functionName: "createAccount", args: [executor] })),
    /** Installs a published hook stack (e.g. H1-STARTER) on the vault in one tx. */
    applyStack: (vault: Address, stackId: Hex, router: Address = FHERUM.hearth.router) =>
      call(router, encodeFunctionData({ abi: hearthAbi, functionName: "applyStack", args: [vault, stackId] })),
  },
};
