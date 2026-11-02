// Public deployment manifest per network. Addresses are copied from
// broadcast/DeployTestnetMocks.s.sol/46630/run-latest.json (+ ForgeAdmin.registry()/timelock() reads).
// Contract addresses are public data; no keys or RPC secrets belong here.
// Mainnet entries come only from NEXT_PUBLIC_MAINNET_* env (see .env.example); nothing is hardcoded.
import { MAINNET_ENABLED, NET_CONFIG } from "@/lib/protocol";

export type NetworkKey = "testnet" | "mainnet";
export type ContractEntry = { name: string; module: string; role: string; address: `0x${string}`; mock?: boolean };
export type Deployment = {
  key: NetworkKey;
  label: string;
  chainId: number;
  explorer: string | null;
  contracts: ContractEntry[];
};

export const DEPLOYMENTS: Record<NetworkKey, Deployment> = {
  testnet: {
    key: "testnet",
    label: "Robinhood Chain Testnet",
    chainId: 46630,
    explorer: "https://explorer.testnet.chain.robinhood.com",
    contracts: [
      { name: "LiquidityHub", module: "FORGEHUB", role: "Shared liquidity hub · spoke credit limits", address: "0x4E424aB496725DDeAe2890d193f07889248e6B92" },
      { name: "MarketFactory", module: "FORGEHUB", role: "Verifies and registers markets", address: "0x9484889951FCde41BE56C5bDE93EAFfaa98D15eE" },
      { name: "Market · tETH/tUSD", module: "FORGEHUB", role: "Isolated spoke market", address: "0x6F16DDDc77b14129C2ae50Bd4aD079eec3243c1A" },
      { name: "CuratorRegistry", module: "FORGEHUB", role: "Registered markets and curators", address: "0x665728868c7Ac7EbbF0fdE5Bd30Af5094e3211B7" },
      { name: "RiskEngine", module: "IRONCLAD", role: "Health factor and solvency checks", address: "0x30E67Bf7e1dDA34f8F7B0B261f358e7d0AA34810" },
      { name: "LiquidationEngine", module: "IRONCLAD", role: "Liquidation math", address: "0x3370C37629dE14256077e939076db4EDe405E260" },
      { name: "InterestRateModel", module: "FORGEHUB", role: "Variable rate curve", address: "0xA0f58c025d524985AdB823c3be736570cf1537D7" },
      { name: "OracleAdapter", module: "IRONCLAD", role: "Price feeds with staleness bounds", address: "0x138445E4Eb800afB44835dbB5CE0Dfd58269f81F" },
      { name: "PlaintextFHEAdapter", module: "VEILBOOK", role: "FHE interface stand-in (no encryption)", address: "0xa431F2621Da10eDAcF5263168cF9aCe67165cd14", mock: true },
      { name: "LensReader", module: "STEEL LENS", role: "Read-only market and user snapshots", address: "0x8C1E90549DAd239a1661f8E107D1Db8C0fD3902e" },
      { name: "AllowlistEligibility", module: "IRON GATE", role: "Optional borrower allowlist", address: "0xF7517854b0C868BEADEAF9c5a4a38750fDfC12a4" },
      { name: "EmergencyController", module: "BREAKGLASS", role: "Pause switches", address: "0x9A09a39Fbf18E8D0c85e834eaDF0BaeB87eb2B16" },
      { name: "ForgeAdmin", module: "GOVERNANCE", role: "Deploys timelock + registry", address: "0xEAd08A816C74f8F73B440729D90Db6BD66893550" },
      { name: "TimelockController", module: "GOVERNANCE", role: "Governor and curator of every market", address: "0x0e2A711D76b4b9fe652bf2915635fc314a9280dF" },
      { name: "tUSD", module: "TEST ASSET", role: "Mock loan token (no value)", address: "0xE29eFd2Df92921B36448f9519A83dCDEEeb4ea7E", mock: true },
      { name: "tETH", module: "TEST ASSET", role: "Mock collateral token (no value)", address: "0x8Bc345FBB223ecD2566e80a576A60c4d4BE17473", mock: true },
      { name: "Feed · tUSD/USD", module: "TEST ASSET", role: "Mock price feed, fixed 1.00", address: "0xaAf7e3A4131426C296B8D5B44487c10aCcBE397D", mock: true },
      { name: "Feed · tETH/USD", module: "TEST ASSET", role: "Mock price feed, fixed 2,000.00", address: "0x84048883d4608F5D27fB432EAd85d89F41Cb0dA3", mock: true },
    ],
  },
  mainnet: {
    key: "mainnet",
    label: "Robinhood Chain",
    chainId: 4663,
    explorer: MAINNET_ENABLED ? NET_CONFIG.mainnet.explorer : null,
    contracts: MAINNET_ENABLED
      ? [
          { name: "MarketFactory", module: "FORGEHUB", role: "Verifies and registers markets", address: NET_CONFIG.mainnet.marketFactory! },
          ...NET_CONFIG.mainnet.markets.map((a, i) => ({ name: `Market ${i + 1}`, module: "FORGEHUB", role: "Isolated spoke market", address: a })),
          { name: "LensReader", module: "STEEL LENS", role: "Read-only market and user snapshots", address: NET_CONFIG.mainnet.lensReader! },
        ]
      : [],
  },
};

export const explorerAddress = (d: Deployment, a: string) => (d.explorer ? `${d.explorer}/address/${a}` : null);
