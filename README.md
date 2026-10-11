---
description: >-
  No PvP until graduation. Before a Trucee token graduates, every buyer can
  exit at their cost basis, so nobody profits off the buyers who come after them.
---

# Introduction

**No PvP until graduation.**

Trucee is a Zero-PvP bonding curve built on [Meteora's Dynamic Bonding Curve](https://docs.meteora.ag/core-products/dbc/what-is-dbc) (DBC). Before a token graduates, every buyer can exit at their cost basis, so nobody can profit off other buyers until the curve completes. Think of it as pump.fun without victims.

{% hint style="warning" %}
**Status:** the Trucee programs run on Solana devnet. They are unaudited and not deployed to mainnet yet. See the [Roadmap](roadmap.md).
{% endhint %}

## The problem

On a bonding curve every buy raises the price and every sell lowers it. Before graduation, whoever buys first can sell into the buyers who come after them. Snipers do exactly that, and later buyers become their exit liquidity.

* **Snipers win, later buyers pay.** On the same simulated order flow (300 random curves, 1% fee, a sniper buying first, 60 retail buys), a sniper extracts **+10.57 SOL** on average from a plain DBC curve. Through the Trucee router the same sniper averages **−0.06 SOL** and never profits in any of the 300 runs. This is a simulation, not a replay of real pools (`sim/sniper_report.py`, seed 42).
* **Few curves see real competition.** Of 94,332 DBC graduations in the 30 days to 2026-09-29, [Litmus](https://github.com/omreor/litmus) counts 495 as *contested* (independent buyers competed to fill the curve) and 93,769 as *uncontested* (filled without real competition, for example by the creator, the launchpad's own wallet or one bundle).

## What Trucee changes

Trucee changes three things before graduation. Everything else is a normal DBC launch.

1. **Exit at cost.** Every holder can sell back through the Trucee router at any time before graduation. The router sells the tokens into the curve, parks the proceeds in a per-market buffer and refunds the holder's cost basis (what their buys put into the curve), minus the trading fee and a few lamports of rounding haircut. Selling is never blocked; it just cannot turn a profit at another buyer's expense.
2. **Gains wait for graduation.** When an exit sells for more than its cost basis, the difference stays in the buffer. The buffer covers exits that sell below cost, and whatever is left when the curve completes is split among the open positions pro rata to their cost basis. Anyone can crank a claim; the share always lands in the holder's own quote token account.
3. **Transfers wait for graduation.** A Token-2022 transfer hook rejects every transfer of the token whose top-level instruction is not the Trucee router. Tokens stay in your wallet, but direct DBC swaps, wallet-to-wallet transfers and aggregator routes fail until graduation. The hook is the enforcement tool; the new part is the cost-basis exit.

**At graduation**, DBC itself revokes the transfer hook on the swap that completes the curve. That is DBC's on-chain behaviour, not a Trucee setting. The token becomes a plain Token-2022 token, its liquidity migrates to a Meteora DAMM v2 pool, and it trades freely.

As far as public sources show, no other launchpad on DBC or elsewhere offers a cost-basis exit before graduation. Transfer hooks themselves are common on DBC. Trucee runs on unmodified DBC transfer-hook pools (the router calls DBC's `swap2_with_transfer_hook`), so the same rules can be adopted by any DBC launchpad.

{% hint style="info" %}
**Live on devnet with router v5.** The router also has **Auto-Exit** (set a deadline; if the curve has not completed by then, anyone can trigger your exit at cost and the refund goes to your own account) and an **Anti-Whale cap** (a buy may not leave one position above 20% of the curve's base supply, so a curve needs at least five positions to graduate). Both run on devnet since the router v5 upgrade on 2026-10-11.
{% endhint %}

## Proof so far

* A Python port of the DBC curve matches the on-chain program swap for swap (21,000 swaps).
* 13,800 randomized fuzz runs never produced a negative buffer.
* 36 negative tests.
* The devnet end-to-end run on router v5 passes 15 of 15 checks, and the full lifecycle (launch, buy, exit at cost, graduation, DAMM v2 migration, surplus claim) has run on devnet.

Commands, limits and known risks are on the [Security](security.md) and [Research & data](research-and-data.md) pages.

## Where to go next

* [How it works](how-it-works.md): the mechanism and the refund math.
* [For traders](traders.md): buy, exit at cost, claim the surplus.
* [For creators](creators.md): launch a token on a Zero-PvP curve.
* [Developers quickstart](developers/quickstart.md) and [Programs reference](developers/programs.md): integrate the router.
* [Security](security.md): invariants, tests, known limitations, and the answer to "isn't this a honeypot?".
* [Research & data](research-and-data.md): the simulations and data behind the numbers above.
* [FAQ](faq.md), [Roadmap](roadmap.md) and [Links](links.md).
