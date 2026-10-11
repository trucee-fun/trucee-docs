# Research & data

This page collects the numbers behind Trucee and shows how to reproduce each one. Every figure comes with the command, file or external source it was taken from. File paths refer to the Trucee source repository. The simulator lives in `sim/` and needs only Python 3 (standard library, no packages).

| Claim | Number | Source |
|---|---|---|
| Average sniper profit, plain DBC vs the Zero-PvP router (simulated order flow) | +10.5671 SOL vs -0.0582 SOL per run | `cd sim && python3 sniper_report.py` |
| Python port of the DBC swap math vs the real DBC program | 21,000 swaps, 0 mismatches | `sim/replay_diff.py` on the recorded LiteSVM swaps |
| Router buffer never goes negative (solvency fuzz, on-chain dust and haircut) | 13,800 runs recorded, 0 negative; a fresh 2,160-run check also 0 | `sim/run_fuzz.py`, `docs/trucee-plan.md` |
| DBC graduations that were real competition | 495 of 94,332 in 30 days | [Litmus](https://github.com/omreor/litmus) |

## 1. Sniper extraction (simulated order flow)

{% hint style="warning" %}
**This is a simulation, not a replay of real pools.** The order flow is generated, not taken from mainnet. Replaying real mainnet DBC pools needs mass mainnet RPC reads and is on the [Roadmap](roadmap.md). The swap math underneath is the same port that matches the real DBC program bit for bit (section 3).
{% endhint %}

### The question

On a plain bonding curve, a sniper who buys first and sells into the buyers who follow takes a profit, and those buyers pay for it. Does that profit survive when every pre-graduation buy and exit goes through the Zero-PvP router, which refunds each exit at cost basis?

### The scenario

All parameters are defined in `sim/sniper_report.py` and documented in `docs/sniper-stat.md`.

* 300 random curves, one scenario per curve. Both variants (plain DBC and the Zero-PvP router) get exactly the same order flow.
* Curve: 16 segments, 28 SOL starting market cap, price multiplier 17, migration threshold 85 SOL of quote, 1% fee. Only the liquidity per segment is random (0.3 to 3 times a constant-liquidity baseline, `sim/curve_factory.py`).
* Sniper: buys first, a size between 1 and 5 SOL, and exits before graduation.
* Retail: 60 buys follow the sniper, each sized `10^uniform(-1.5, 0.5)` SOL (about 0.03 to 3.16 SOL). A buy that would graduate the curve is skipped in both variants, so the sniper can still exit before graduation.
* After the sniper exits, every retail buyer exits too. This is the worst case (the hype died) and shows who absorbed the loss.
* Zero-PvP router settings: `avg` lot accounting, 16 lamports withheld per buy, 2 lamports withheld per exit. These are the router's on-chain constants `DUST_PER_BUY` and `HAIRCUT_PER_EXIT`.
* Deterministic: the script seeds `random.Random(42)`, so every run prints identical output.

### The result

```
$ cd sim && python3 sniper_report.py
300 runs, 1% fee, 85 SOL threshold, sniper buys first, 60 retail buys
  plain DBC  sniper PnL avg : +10.5671 SOL
  plain DBC  retail PnL avg : -11.4428 SOL
  Zero-PvP   sniper PnL avg : -0.0582 SOL
  Zero-PvP   retail PnL avg : -0.8175 SOL
  Zero-PvP   sniper max PnL : -0.020464 SOL
  Zero-PvP   min buffer     : 0 lamports
```

| Variant | Sniper PnL (avg per run) | Retail PnL (avg per run, all 60 buyers together) |
|---|---|---|
| Plain DBC | +10.5671 SOL | -11.4428 SOL |
| Zero-PvP router | -0.0582 SOL | -0.8175 SOL |

### How to read it

* **Plain DBC:** the sniper takes +10.5671 SOL per run on average, and retail ends at -11.4428 SOL.
* **Zero-PvP router:** the sniper ends at -0.0582 SOL on average. The best sniper run out of all 300 still ended at -0.020464 SOL, so the sniper never made a profit in any run.
* **Retail's -0.8175 SOL is the fee, not extraction.** Through the router, an exit refunds `basis - fee_at_cost - haircut` (`docs/trucee-plan.md`). A retail buyer who exits pays the 1% fee on the buy and the 1% fee at cost on the exit, about 2% of what they paid. The scenario makes every retail buyer exit, which is the worst case. Buyers who hold to graduation share the buffer surplus pro rata by basis instead (see [How it works](how-it-works.md)).
* **Min buffer 0 lamports:** across all 300 runs, the per-market buffer that pays the refunds never went below zero.

### Limits

* The order flow is synthetic: one sniper strategy (buy first, exit before graduation), 60 retail buys, one curve family (fixed start market cap, price multiplier and threshold) and a 1% fee.
* It does not say how much snipers took from real pools. That needs the real-pool replay, which is a roadmap item.

## 2. Contested graduations on DBC (Litmus)

[Litmus](https://github.com/omreor/litmus) is an independent analytics project that classifies every DBC pool and graduation, using each pool's own transactions as evidence. Its README (snapshot 2026-09-29 15:43 UTC) reports that **of 94,332 DBC graduations in the last 30 days, only 495 were contested**. The same figure is recorded in `docs/trucee-plan.md`.

How Litmus defines the terms (from its README):

* **Contested:** independent buyers competed to fill the curve, confirmed from the curve's own transactions.
* **Uncontested:** a rule fired and the curve was filled without real competition, for example the creator, the launchpad's own wallet or a single bundle filled it, or it completed in its creation slot.
* **Unverified:** no rule fired, but the transactions that would confirm competition have not been replayed yet.

{% hint style="info" %}
This is third-party data. Trucee did not produce or re-check it. Litmus publishes its own precision review and asks readers to treat the contested count as an upper bound.
{% endhint %}

**Why it matters here:** a DBC graduation on its own says little about real demand, and the race to fill a curve is rarely a fair contest. Trucee does not change who can buy. It changes what an early buyer can take from later buyers before graduation, which is what section 1 measures.

## 3. Methodology: DBC port, differential replay and solvency fuzz

The solvency question (can the buffer always pay every refund?) lives in the last few lamports, so the model has to match DBC's integer math exactly before any fuzz result means anything.

### Python port of the DBC swap math

`sim/dbc_curve.py` is an integer port of the swap math in [Meteora's dynamic-bonding-curve program](https://github.com/MeteoraAg/dynamic-bonding-curve) (`curve.rs`, `state/virtual_pool.rs`, `state/config.rs`). Rounding directions are copied exactly. It models the quote-token fee mode with a static base fee only (no fee scheduler, rate limiter or dynamic fee), which matches the Trucee preset rule of a static, quote-collected fee (`docs/trucee-plan.md`).

### Differential replay against the real DBC program

1. `sim/export_configs.py` exports random curve configs. A zero fee is raised to DBC's 25 bps minimum.
2. `litesvm-diff/src/harness.ts` runs the real mainnet DBC program (a dumped `.so`) inside LiteSVM. For each config it creates the config and pool, runs a random sequence of buys (PartialFill) and sells (ExactIn) from 5 traders, and records the balance deltas and the pool state after every swap.
3. `sim/replay_diff.py` replays every recorded swap through the port. A swap passes only if the port matches the chain exactly on the amount taken from the trader, the amount delivered, the resulting `sqrt_price` and the `quote_reserve`. A swap that failed on chain must also fail in the port.

```
$ cd sim
$ python3 replay_diff.py ../litesvm-diff/out/results.json
scenarios: 60  swaps: 9000  exact matches: 9000
mismatches: 0
$ python3 replay_diff.py ../litesvm-diff/out/results_b.json
scenarios: 100  swaps: 12000  exact matches: 12000
mismatches: 0
```

That is 21,000 swaps with 0 mismatches, the "bit-exact vs DBC (21k swaps)" result in `docs/trucee-plan.md`. To record new swaps instead of replaying the committed ones, run `npx tsx src/harness.ts SCENARIOS.json OUT.json [opsPerScenario]` in `litesvm-diff/`.

### Solvency fuzz

`sim/zero_pvp.py` models the router. The claim under test: the buffer is at least zero at every step, for every curve and every ordering of trades, and the identity `sum(gross - basis) == sum(remaining basis) - quote_reserve` holds exactly.

`sim/run_fuzz.py` tests it:

* **Curves:** random, from 1 to 16 segments, 5 to 60 SOL starting market cap, price multiplier 2 to 120, migration threshold 10 to 400 SOL, fee 0%, 0.25%, 1% or 5%.
* **Traders:** 2 to 30 users and up to 400 steps per run. Buys are log-uniform from 0.001 to 50 SOL. Exits are full or partial.
* **Drivers:** `random` picks a random action each step. `adversarial` is a greedy attacker: each step it tries every candidate action (4 buys and, once anyone holds tokens, 8 exits) and picks the one that pushes the buffer lowest.
* **Endings:** stop at graduation, or `+full-unwind`: if the curve has not graduated when the steps run out, every holder exits in random order (a dead curve).
* **Lot accounting:** `avg`, `fifo` and `lifo`. Three modes, two drivers and two endings give 12 report sections.

| Flag | Default | Meaning |
|---|---|---|
| `--random N` | 600 | runs per random section |
| `--adversarial N` | 150 | runs per adversarial section |
| `--seed S` | 0 | first seed; run `i` uses seed `S + i` |
| `--haircut L` | 0 | lamports withheld per exit |
| `--dust-per-buy L` | 0 | lamports withheld per buy |

A fresh run with the router's on-chain constants (`DUST_PER_BUY = 16`, `HAIRCUT_PER_EXIT = 2` in `zpvp/programs/zpvp_router/src/math.rs`):

```
cd sim && python3 run_fuzz.py --random 300 --adversarial 60 --seed 777 --haircut 2 --dust-per-buy 16
```

All 12 sections (2,160 runs) report 0 runs with a negative buffer, a worst min buffer of 0 lamports and an identity drift of 0. The cumulative total recorded in `docs/trucee-plan.md` is 13,800 fuzz runs with no negative buffer.

{% hint style="info" %}
**Why the router withholds a few lamports.** Run the same seed without them (`--haircut 0 --dust-per-buy 0`, the defaults) and the buffer dips below zero in most runs, by at most 507 lamports, while the identity still holds exactly. DBC rounds in the pool's favour, and that dust has to come from somewhere. Withholding 16 lamports per buy and 2 per exit absorbs it, so the buffer stays solvent.
{% endhint %}

The unit tests in `sim/test_sim.py` cover the port and the router on fixed cases: a round trip never returns more than was paid, an early exit never profits, a tiny-slice exit attack cannot drain the buffer, and random orderings stay solvent.

```
cd sim && python3 -m unittest test_sim
```

For the on-chain tests (negative tests and the devnet end-to-end run), see [Security](security.md).

## Reproduce everything

```
cd sim
python3 sniper_report.py
python3 replay_diff.py ../litesvm-diff/out/results.json
python3 replay_diff.py ../litesvm-diff/out/results_b.json
python3 run_fuzz.py --random 300 --adversarial 60 --seed 777 --haircut 2 --dust-per-buy 16
python3 -m unittest test_sim
```

## Not done yet

* **Real-pool replay:** replaying real mainnet DBC pools to measure what snipers actually took, and what they would have taken through Trucee. This is on the [Roadmap](roadmap.md). Until then, section 1 is a labelled simulation.
