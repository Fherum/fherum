// Single source of truth for what the UI is allowed to claim.
// Everything here is taken from the repo (README, FIELD-MATRIX, contracts),
// not invented. When a deployment exists, fill DEPLOYMENT from the manifest.

export const CHAINS = {
  testnet: {
    id: 46630,
    name: "Robinhood Chain Testnet",
    rpc: "https://rpc.testnet.chain.robinhood.com",
  },
  mainnet: {
    id: 4663,
    name: "Robinhood Chain",
    rpc: "https://rpc.mainnet.chain.robinhood.com",
  },
} as const;

export const TARGET_CHAIN = CHAINS.testnet;

/** null = not deployed. The UI must render empty states, never sample data. */
export const DEPLOYMENT: {
  lensReader: `0x${string}` | null;
  marketFactory: `0x${string}` | null;
  explorer: string | null;
} = {
  lensReader: (process.env.NEXT_PUBLIC_LENS_READER as `0x${string}`) || null,
  marketFactory: (process.env.NEXT_PUBLIC_MARKET_FACTORY as `0x${string}`) || null,
  explorer: process.env.NEXT_PUBLIC_EXPLORER || null,
};

export const isDeployed = () => DEPLOYMENT.lensReader !== null;

/** Privacy mode shipping today. README: "privacyMode is Public on every market. There is no setter." */
export const PRIVACY_MODE = "Public" as const;
export const FHE_STATUS =
  "No FHE vendor serves chain 4663 / 46630 yet. Positions are public until one does.";

/** Hard bounds enforced in contracts (README → Roles). */
export const HARD_BOUNDS = [
  { param: "Loan-to-value", rule: "≤ liquidation threshold" },
  { param: "Liquidation threshold", rule: "≤ 95%" },
  { param: "Liquidation bonus", rule: "≤ 15%" },
  { param: "Reserve factor", rule: "≤ 50%" },
  { param: "Timelock delay", rule: "> 0 (ForgeAdmin)" },
];

export type ModuleStatus = "in-repo" | "public-mode" | "awaiting-vendor";

export const STACK: {
  brand: string;
  role: string;
  line: string;
  contracts: string;
  status: ModuleStatus;
}[] = [
  {
    brand: "VEILBOOK",
    role: "Position layer",
    line: "Position storage reserves slots for vendor ciphertext handles. Amounts are public integers until an FHE stack serves this chain.",
    contracts: "PositionManager · PlaintextFHEAdapter",
    status: "awaiting-vendor",
  },
  {
    brand: "IRONCLAD",
    role: "Risk engine",
    line: "LTV, liquidation threshold and Health Factor with fixed-point math, called through the FHE adapter interface.",
    contracts: "RiskEngine · OracleAdapter",
    status: "public-mode",
  },
  {
    brand: "FORGEHUB",
    role: "Curated markets",
    line: "A hub custodies per-market liquidity under a credit line. Spokes carry curator-set risk, routed through a timelock.",
    contracts: "LiquidityHub · Market · MarketFactory · CuratorRegistry",
    status: "in-repo",
  },
  {
    brand: "STEEL LENS",
    role: "Public analytics",
    line: "Read-only views for totals, utilization, rates, caps, pause state and privacy mode.",
    contracts: "LensReader",
    status: "in-repo",
  },
  {
    brand: "IRON GATE",
    role: "Eligibility",
    line: "Optional address-set or Merkle gate on supply and borrow. Off unless a market sets it.",
    contracts: "AllowlistEligibility",
    status: "in-repo",
  },
  {
    brand: "BREAKGLASS",
    role: "Liquidation & pause",
    line: "Bonus-capped seizure. Guardian can pause borrow, collateral withdrawal and liquidation; repay never pauses.",
    contracts: "LiquidationEngine · EmergencyController",
    status: "in-repo",
  },
];

export const STATUS_LABEL: Record<ModuleStatus, string> = {
  "in-repo": "Contracts in repo · not deployed",
  "public-mode": "Runs on public values",
  "awaiting-vendor": "Confidential mode awaiting vendor",
};

/** Roles (README → Roles). Used by the curator console permission matrix. */
export const ROLES = [
  {
    role: "Governor",
    holder: "Timelock (factory markets) · Safe admins the timelock",
    can: ["Asset allowlist", "Credit lines", "Spoke registration", "Oracle feeds", "Unpause"],
    cannot: ["Bypass timelock on factory markets"],
  },
  {
    role: "Curator",
    holder: "Queues through CuratorRegistry",
    can: ["Queue risk params", "Queue caps", "Queue rate params", "Cancel queued"],
    cannot: ["Exceed hard bounds", "Execute before delay"],
  },
  {
    role: "Guardian",
    holder: "Pause key",
    can: ["Pause borrow", "Pause collateral withdrawal", "Pause liquidation"],
    cannot: ["Unpause", "Cancel timelock", "Edit allowlist", "Move tokens"],
  },
  {
    role: "Liquidator",
    holder: "Permissionless",
    can: ["Repay debt of a position with HF < 1", "Seize collateral up to bonus cap"],
    cannot: ["Socialize bad debt"],
  },
];

/** What each user action does under pause (EmergencyController taxonomy). */
export const PAUSE_MATRIX = [
  { action: "Supply", paused: false },
  { action: "Withdraw borrow asset", paused: false },
  { action: "Repay", paused: false },
  { action: "Borrow", paused: true },
  { action: "Withdraw collateral", paused: true },
  { action: "Liquidate", paused: true },
];

/** FIELD-MATRIX.md, condensed. */
export const FIELDS = [
  { data: "Assets, risk params, caps, rates", today: "Public", target: "Public" },
  { data: "Oracle price, timestamp, validity", today: "Public", target: "Public" },
  { data: "Market totals & utilization", today: "Public", target: "Public" },
  { data: "Wallet address & action timing", today: "Public", target: "Public" },
  { data: "ERC-20 transfer amounts", today: "Public", target: "Public" },
  { data: "Your collateral amount", today: "Public", target: "Encrypted" },
  { data: "Your debt", today: "Public", target: "Encrypted" },
  { data: "Your Health Factor", today: "Public", target: "Authorized only" },
  { data: "Liquidation eligibility", today: "Public", target: "Minimum signal" },
] as const;
