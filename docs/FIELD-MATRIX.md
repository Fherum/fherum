# Field matrix (shipping class)

The target column is the G0 classification for a later confidential release. The shipping column is what this repository stores and emits today. G1 was NO-GO for FHE on Robinhood Chain 4663/46630, so the shipping class of position amounts is Public.

| Data | Target after a vendor GO | Shipping in G2 | Where it lives |
| --- | --- | --- | --- |
| Assets, token addresses | Public | Public | Market immutables, hub allowlist |
| Risk parameters, caps, rates | Public | Public | Market storage and events |
| Oracle price, timestamp, validity | Public | Public | OracleAdapter, never cached as a fake price |
| Total supply, debt, utilization, indexes | Public | Public | Reserve on the market |
| Wallet address, action timing | Public | Public | `owner`, events, base chain |
| User supply shares | Public aggregate; position target was encrypted | Public integer in word 0 | PositionManager via PlaintextFHEAdapter |
| User collateral amount | Encrypted target | Public integer in word 0 | PositionManager. Collateral is escrowed 1:1 |
| User debt shares and debt assets | Encrypted target | Public integer in word 0, assets derived from the public index | PositionManager and ReserveAccounting |
| Health Factor | Authorized result | Public view, computed, not stored | RiskEngine |
| Liquidation eligibility | Minimum signal | Public, because amounts are public | `isLiquidatable` |
| ERC-20 transfer amounts | Public | Public | Token transfers user to market to hub |
| Curator and pause actions | Public | Public | Events. Factory markets route risk setters through the timelock |
| Entry eligibility | Public | Public address set or off | `AllowlistEligibility`. Default is off |
| Pause scope | Public | Borrow, collateral withdrawal, liquidation | `EmergencyController` taxonomy. Repay has no pause bit |
| Ciphertext handles | Vendor handles | Reserved slots, always zero | Position slots 2-4, 6-8, 10-13 |
| Decryption metadata | Provider-dependent | None. `decrypt` only unpacks a public integer | PlaintextFHEAdapter |

`privacyMode` on the market is Public. The UI copy for a later app, when one exists, has to say that positions are public and that FHE is waiting on network support. This repository has no app.

Do not describe an ERC-20 deposit, borrow, repay, withdraw, or liquidation transfer as confidential. Those amounts are visible on the chain. Internal accounting is the same public number in G2, routed through the adapter so a later implementation has one call path.
