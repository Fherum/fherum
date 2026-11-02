#!/usr/bin/env python3
"""FHERUM independent reference model (brief section 6), PUBLIC mode, single collateral / single debt.

Written from the brief formulas, not transpiled from Solidity. Integer math only (Python big ints), with the
rounding direction the protocol documents for each step. Run:

    python3 test/reference/model.py

It writes test/reference/vectors.json (human-readable) and test/reference/ReferenceVectors.sol (the same
vectors as Solidity constants, so Foundry needs no fs read permission outside src/).
"""
import json
import os

WAD = 10**18
RAY = 10**27
YEAR = 365 * 24 * 3600
MAX = 2**256 - 1


def div_floor(a, b):
    return a // b


def div_ceil(a, b):
    return -((-a) // b)


# 6.x token value: amount * price / 10^dec, price scaled to WAD per whole token.
def price_wad(raw, price_dec):
    if raw <= 0:
        raise ValueError("ZeroPrice")
    return raw * 10 ** (18 - price_dec)


def value(amount, pwad, dec, up):
    f = div_ceil if up else div_floor
    return f(amount * pwad, 10**dec)


def tokens(v, pwad, dec, up):
    f = div_ceil if up else div_floor
    return f(v * 10**dec, pwad)


# 6.x Health Factor: HF = C * LT / D (floored), max when D == 0.
def health_factor(c, d, lt):
    if d == 0:
        return MAX
    return div_floor(c * lt, d)


def liquidatable(c, d, lt):
    return d > 0 and c * lt < d * WAD


def within_ltv(c, d, ltv):
    return c * ltv >= d * WAD


# 6.x kinked rate model.
def borrow_rate(base, s1, s2, opt, u):
    u = min(u, WAD)
    if u <= opt:
        return base + div_floor(s1 * u, opt)
    return base + s1 + div_floor(s2 * (u - opt), WAD - opt)


def utilization(debt, supply):
    if supply == 0:
        return 0 if debt == 0 else WAD
    if debt >= supply:
        return WAD
    return div_floor(debt * WAD, supply)


# 6.x linear index accrual with reserve factor.
def accrue(borrow_idx, supply_idx, bshares, sshares, rate, rf, dt):
    if dt == 0 or bshares == 0 or rate == 0:
        return borrow_idx, supply_idx, 0, 0
    factor = div_floor(rate * dt, YEAR) * 10**9
    nb = div_floor(borrow_idx * (RAY + factor), RAY)
    old_debt = div_ceil(bshares * borrow_idx, RAY)
    new_debt = div_ceil(bshares * nb, RAY)
    interest = new_debt - old_debt
    if interest == 0 or sshares == 0:
        return nb, supply_idx, interest, 0
    fee = div_floor(interest * rf, WAD)
    ns = supply_idx + div_floor((interest - fee) * RAY, sshares)
    fee_shares = div_floor(fee * RAY, ns) if fee > 0 else 0
    return nb, ns, interest, fee_shares


# 6.10 target-HF liquidation with the fallback/dust rules in docs/DECISIONS.md.
def target_repay_value(c, d, lt, b, hft):
    a = div_ceil(hft * d, WAD)
    cc = div_floor(lt * c, WAD)
    if a <= cc:
        return 0
    ltb = div_ceil(lt * b, WAD)
    if hft <= ltb:
        return MAX
    return div_ceil((a - cc) * WAD, hft - ltb)


def liquidation_quote(q):
    """Returns (repay, seize) or the error name."""
    debt, coll, req = q["debtAssets"], q["collateralAssets"], q["repayRequested"]
    dp, cp, dd, cd = q["debtPrice"], q["collPrice"], q["debtDecimals"], q["collDecimals"]
    b, cf, dust, lt, hft = q["bonus"], q["closeFactor"], q["dust"], q["lt"], q["targetHf"]
    dv = value(debt, dp, dd, True)
    cv = value(coll, cp, cd, False)
    if req == 0 or debt == 0:
        return "NothingToRepay"
    mx = debt
    if dv >= dust:
        t = target_repay_value(cv, dv, lt, b, hft)
        residual_dust = t < dv and dv - t < dust
        if not residual_dust:
            cap = div_floor(debt * cf, WAD)
            if cap == 0:
                return "NothingToRepay"
            mx = min(mx, cap)
            if t != MAX:
                mx = min(mx, tokens(t, dp, dd, True))
    cover = tokens(div_floor(cv * WAD, b), dp, dd, False)
    mx = min(mx, cover)
    if mx == 0:
        return "NothingToRepay"
    repay = min(req, mx)
    if repay < mx and repay < debt:
        if value(debt - repay, dp, dd, True) < dust:
            return "DustResidual"
    rv = value(repay, dp, dd, False)
    seize = tokens(div_floor(rv * b, WAD), cp, cd, False)
    seize = min(seize, coll)
    if seize == 0:
        return "ZeroSeize"
    return repay, seize


def build():
    v = {"values": [], "hf": [], "rates": [], "accrual": [], "liquidation": []}
    e18 = 10**18

    # tokens with different decimals, extreme valid prices, minimum amounts
    for cat, amt, raw, pdec, tdec in [
        ("min_token_6dec", 1, 1e8, 8, 6),
        ("usdc_like", 1_000 * 10**6, 99_990_000, 8, 6),
        ("wbtc_like", 3 * 10**8, 6_543_210_000_000, 8, 8),
        ("eth_18", 5 * e18, 312_345_678_900, 8, 18),
        ("extreme_low_price", 10**30, 1, 8, 18),
        ("extreme_high_price", 10**12, 10**20, 8, 18),
        ("price_18dec", 7 * e18, 2 * e18, 18, 18),
        ("zero_amount", 0, 1e8, 8, 18),
    ]:
        raw = int(raw)
        p = price_wad(raw, pdec)
        v["values"].append({"cat": cat, "amount": amt, "rawPrice": raw, "priceDecimals": pdec,
                            "tokenDecimals": tdec, "down": value(amt, p, tdec, False),
                            "up": value(amt, p, tdec, True)})

    lt = 85 * 10**16
    for cat, c, d in [
        ("exact_threshold", 1000 * e18, 850 * e18),
        ("just_above", 1000 * e18, 850 * e18 - 1),
        ("just_below", 1000 * e18, 850 * e18 + 1),
        ("zero_debt", 1000 * e18, 0),
        ("zero_collateral", 0, 1 * e18),
        ("dust_values", 1, 1),
        ("max_permitted", 10**36, 10**36),
    ]:
        v["hf"].append({"cat": cat, "c": c, "d": d, "lt": lt, "hf": health_factor(c, d, lt),
                        "liquidatable": liquidatable(c, d, lt), "withinLtv": within_ltv(c, d, 75 * 10**16)})

    base, s1, s2, opt = 0, 4 * 10**16, 75 * 10**16, 80 * 10**16
    for cat, u in [("u0", 0), ("below_kink", opt - 1), ("kink", opt), ("above_kink", opt + 1),
                   ("half", WAD // 2), ("u100", WAD)]:
        v["rates"].append({"cat": cat, "u": u, "base": base, "s1": s1, "s2": s2, "opt": opt,
                           "rate": borrow_rate(base, s1, s2, opt, u)})
    for cat, debt, supply in [("util_empty", 0, 0), ("util_no_supply", 5, 0), ("util_over", 11, 10),
                              ("util_round", 1, 3)]:
        v["rates"].append({"cat": cat, "u": utilization(debt, supply), "base": base, "s1": s1, "s2": s2,
                           "opt": opt, "rate": borrow_rate(base, s1, s2, opt, utilization(debt, supply)),
                           "debt": debt, "supply": supply})

    for cat, dt, rate in [("one_second", 1, 5 * 10**16), ("one_hour", 3600, 5 * 10**16),
                          ("one_year", YEAR, 79 * 10**16), ("ten_years", 10 * YEAR, 79 * 10**16),
                          ("zero_dt", 0, 5 * 10**16)]:
        bi, si, bs, ss, rf = RAY, RAY, 700 * e18, 1000 * e18, 10**17
        nb, ns, interest, fee_shares = accrue(bi, si, bs, ss, rate, rf, dt)
        v["accrual"].append({"cat": cat, "dt": dt, "rate": rate, "bShares": bs, "sShares": ss, "rf": rf,
                             "borrowIndex": nb, "supplyIndex": ns, "interest": interest, "feeShares": fee_shares,
                             "debtOfOneShare": div_ceil(1 * nb, RAY), "supplyOfOneShare": div_floor(1 * ns, RAY)})

    base_q = {"bonus": 105 * 10**16, "closeFactor": 5 * 10**17, "dust": 100 * e18, "lt": lt,
              "targetHf": 105 * 10**16, "debtPrice": e18, "debtDecimals": 18, "collDecimals": 18}
    for cat, debt, coll, cp, req, extra in [
        ("partial_target", 700 * e18, 1000 * e18, 8 * 10**17, MAX, {}),
        ("partial_requested", 700 * e18, 1000 * e18, 8 * 10**17, 100 * e18, {}),
        ("full_close_dust_residual", 150 * e18, 200 * e18, 8 * 10**17, MAX, {}),
        ("dust_residual_reverts", 150 * e18, 200 * e18, 8 * 10**17, 90 * e18, {}),
        ("below_dust_full", 50 * e18, 60 * e18, 8 * 10**17, MAX, {}),
        ("infeasible_target_closefactor", 700 * e18, 1000 * e18, 3 * 10**17, MAX, {}),
        ("bad_debt_cover_cap", 700 * e18, 100 * e18, 3 * 10**17, MAX, {"closeFactor": WAD}),
        ("rounding_odd_amounts", 777_777_777_777_777_777_777, 999_999_999_999_999_999_999, 789_123_456_789_012_345, MAX, {}),
        ("diff_decimals", 700 * 10**6, 1000 * 10**8, 8 * 10**17, MAX, {"debtDecimals": 6, "collDecimals": 8}),
        ("high_target", 700 * e18, 1000 * e18, 8 * 10**17, MAX, {"targetHf": 15 * 10**17}),
        ("max_bonus", 700 * e18, 1000 * e18, 8 * 10**17, MAX, {"bonus": 115 * 10**16}),
    ]:
        q = dict(base_q)
        q.update({"debtAssets": debt, "collateralAssets": coll, "collPrice": cp, "repayRequested": req})
        q.update(extra)
        r = liquidation_quote(q)
        q["cat"] = cat
        if isinstance(r, str):
            q.update({"error": r, "repay": 0, "seize": 0})
        else:
            q.update({"error": "", "repay": r[0], "seize": r[1]})
        v["liquidation"].append(q)
    return v


FIELDS = {
    "ValueV": ["cat", "amount", "rawPrice", "priceDecimals", "tokenDecimals", "down", "up"],
    "HfV": ["cat", "c", "d", "lt", "hf", "liquidatable", "withinLtv"],
    "RateV": ["cat", "u", "base", "s1", "s2", "opt", "rate", "debt", "supply", "fromUtil"],
    "AccrualV": ["cat", "dt", "rate", "bShares", "sShares", "rf", "borrowIndex", "supplyIndex", "interest",
                 "feeShares"],
    "LiqV": ["cat", "debtAssets", "collateralAssets", "repayRequested", "debtPrice", "collPrice", "debtDecimals",
             "collDecimals", "p.bonus", "p.closeFactor", "p.dust", "p.lt", "p.targetHf", "err", "repay", "seize"],
}


def to_sol(v):
    def u(x):
        return str(int(x))

    lines = ["// SPDX-License-Identifier: MIT", "// GENERATED by test/reference/model.py. Do not edit.",
             "pragma solidity 0.8.28;", "", "library ReferenceVectors {"]
    lines += ["    struct ValueV { string cat; uint256 amount; uint256 rawPrice; uint8 priceDecimals;"
              " uint8 tokenDecimals; uint256 down; uint256 up; }",
              "    struct HfV { string cat; uint256 c; uint256 d; uint256 lt; uint256 hf; bool liquidatable;"
              " bool withinLtv; }",
              "    struct RateV { string cat; uint256 u; uint256 base; uint256 s1; uint256 s2; uint256 opt;"
              " uint256 rate; uint256 debt; uint256 supply; bool fromUtil; }",
              "    struct AccrualV { string cat; uint256 dt; uint256 rate; uint256 bShares; uint256 sShares;"
              " uint256 rf; uint256 borrowIndex; uint256 supplyIndex; uint256 interest; uint256 feeShares; }",
              "    struct LiqParams { uint256 bonus; uint256 closeFactor; uint256 dust; uint256 lt;"
              " uint256 targetHf; }",
              "    struct LiqV { string cat; uint256 debtAssets; uint256 collateralAssets; uint256 repayRequested;"
              " uint256 debtPrice; uint256 collPrice; uint8 debtDecimals; uint8 collDecimals; LiqParams p;"
              " string err; uint256 repay; uint256 seize; }", ""]

    def fn(name, typ, rows):
        out = [f"    function {name}() internal pure returns ({typ}[] memory r) {{",
               f"        r = new {typ}[]({len(rows)});"]
        fields = FIELDS[typ]
        for i, row in enumerate(rows):
            vals = [x.strip() for x in row.split(", ")]
            # Field-by-field assignment keeps the stack shallow for wide structs.
            for fld, val in zip(fields, vals):
                out.append(f"        r[{i}].{fld} = {val};")
        out += ["    }", ""]
        return out

    lines += fn("values", "ValueV", [
        f'"{x["cat"]}", {u(x["amount"])}, {u(x["rawPrice"])}, {x["priceDecimals"]}, {x["tokenDecimals"]}, '
        f'{u(x["down"])}, {u(x["up"])}' for x in v["values"]])
    lines += fn("hf", "HfV", [
        f'"{x["cat"]}", {u(x["c"])}, {u(x["d"])}, {u(x["lt"])}, {u(x["hf"])}, '
        f'{str(x["liquidatable"]).lower()}, {str(x["withinLtv"]).lower()}' for x in v["hf"]])
    lines += fn("rates", "RateV", [
        f'"{x["cat"]}", {u(x["u"])}, {u(x["base"])}, {u(x["s1"])}, {u(x["s2"])}, {u(x["opt"])}, '
        f'{u(x["rate"])}, {u(x.get("debt", 0))}, {u(x.get("supply", 0))}, {str("debt" in x).lower()}'
        for x in v["rates"]])
    lines += fn("accrual", "AccrualV", [
        f'"{x["cat"]}", {x["dt"]}, {u(x["rate"])}, {u(x["bShares"])}, {u(x["sShares"])}, {u(x["rf"])}, '
        f'{u(x["borrowIndex"])}, {u(x["supplyIndex"])}, {u(x["interest"])}, {u(x["feeShares"])}'
        for x in v["accrual"]])
    lines += fn("liquidation", "LiqV", [
        f'"{x["cat"]}", {u(x["debtAssets"])}, {u(x["collateralAssets"])}, {u(x["repayRequested"])}, '
        f'{u(x["debtPrice"])}, {u(x["collPrice"])}, {x["debtDecimals"]}, {x["collDecimals"]}, {u(x["bonus"])}, '
        f'{u(x["closeFactor"])}, {u(x["dust"])}, {u(x["lt"])}, {u(x["targetHf"])}, "{x["error"]}", '
        f'{u(x["repay"])}, {u(x["seize"])}' for x in v["liquidation"]])
    lines[-1:] = ["}", ""]
    return "\n".join(lines)


if __name__ == "__main__":
    here = os.path.dirname(os.path.abspath(__file__))
    vec = build()
    with open(os.path.join(here, "vectors.json"), "w") as f:
        json.dump(vec, f, indent=1, default=str)
        f.write("\n")
    with open(os.path.join(here, "ReferenceVectors.sol"), "w") as f:
        f.write(to_sol(vec))
    print({k: len(x) for k, x in vec.items()})
