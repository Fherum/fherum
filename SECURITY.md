# Security Policy

FHERUM contracts are **unaudited**. Mainnet markets run with conservative supply and borrow caps.

## Reporting a vulnerability

Please do **not** open a public issue for security bugs. Report privately via GitHub Security Advisories ("Report a vulnerability" on this repository) or DM [@Fherumfi](https://x.com/Fherumfi) on X.

Include affected contract/address, impact, and a reproduction (Foundry test preferred). We aim to acknowledge within 72 hours.

## Emergency controls

- Guardian can pause borrow, collateral withdrawal and liquidation. Repay is never paused.
- Every curator change waits 48 hours in a public `TimelockController` and can be cancelled.
- Admin is a Safe 2-of-3.

See `docs/ops/INCIDENT-RESPONSE.md`.
