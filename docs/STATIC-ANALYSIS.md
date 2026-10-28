# Static analysis

Tool: Slither 0.11.6, `slither . --config-file slither.config.json --compile-force-framework foundry`.

`slither.config.json` drops informational and low findings, and these detectors:

| Detector | Why it is not a G2 defect |
| --- | --- |
| `timestamp` | Interest accrual and oracle staleness use `block.timestamp` on purpose. Robinhood Chain is an L2; a sequencer can shift time only inside the rollup's bound, and rates are capped. |
| `naming-convention`, `solc-version`, `assembly`, `cyclomatic-complexity`, `similar-names`, `too-many-digits` | Style or compiler-version noise. `Math512` uses OpenZeppelin's `mul512`, not a hand-rolled assembly block. |
| `reentrancy-no-eth` on `Market` | Suppressed on the contract. Every token-moving function is `nonReentrant`. `PositionManager` reverts unless `msg.sender` is the market and it never calls back. The adapter is stateless. Slither still reports a finding because the market must read position words, oracle prices, and hub cash (other contracts) before it can write share totals. State changes that move tokens happen after those reads, and the guard blocks a token callback from re-entering. |

Findings that were cleared in code rather than suppressed:

- `incorrect-equality`: zero-share and zero-asset checks use `< 1` instead of `== 0`.
- `locked-ether`: hub and market do not declare a payable `receive`. A plain ETH transfer reverts. There is no ETH custody.
- `unused-return`: position updates, hub restores, oracle reads, and liquidation quotes check the returned values.

`arbitrary-send-erc20` does not apply to the hub pull path. The hub pulls only from the calling spoke. Users approve the market, and the market forwards tokens it has already collected.
