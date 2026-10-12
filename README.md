---
description: >-
  No PvP until graduation. Before a Trucee token graduates, every buyer can
  exit at their cost basis minus the fee at cost and a 2-lamport haircut, so nobody profits off the buyers who come after them.
---

# Introduction

**No PvP until graduation.**

Trucee is a Zero-PvP bonding curve built on [Meteora's Dynamic Bonding Curve](https://docs.meteora.ag/core-products/dbc/what-is-dbc) (DBC). Before a token graduates, every buyer can exit at their cost basis minus the fee at cost and a 2-lamport haircut, so nobody can profit off other buyers until the curve completes. Think of it as pump.fun without victims.

{% hint style="warning" %}
**Status:** Trucee went live on Solana mainnet on 2026-10-12, at [trucee.fun](https://trucee.fun). The programs also run on devnet, with the same program IDs. They are not independently reviewed. See the [Roadmap](roadmap.md).
{% endhint %}

## The problem

On a bonding curve every buy raises the price and every sell lowers it. Before graduation, whoever buys first can sell into the buyers who come after them. Snipers do exactly that, and later buyers become their exit liquidity.

* **Snipers win, later buyers pay.** On the same simulated order flow (300 random curves, 1% fee, a sniper buying first, 60 retail buys), a sniper extracts **+10.57 SOL** on average from a plain DBC curve. Through the Trucee router the same sniper averages **−0.06 SOL** and never profits in any of the 300 runs. This is a simulation, not a replay of real pools (see [Research & data](research-and-data.md#1-sniper-extraction-simulated-order-flow), seed 42).
* **Few curves see real competition.** Of 94,332 DBC graduations in the 30 days to 2026-09-29, [Litmus](https://github.com/omreor/litmus) counts 495 as *contested* (independent buyers competed to fill the curve) and 93,769 as *uncontested* (filled without real competition, for example by the creator, the launchpad's own wallet or one bundle).

## What Trucee changes

Trucee changes three things before graduation. Everything else is a normal DBC launch.

1. **Exit at cost.** Every holder can sell back through the Trucee router at any time before graduation. The router sells the tokens into the curve, parks the proceeds in a per-market buffer and refunds the holder's cost basis (what their buys put into the curve), minus the fee at cost and a 2-lamport haircut. Selling is never blocked; it just cannot turn a profit at another buyer's expense.
2. **Gains wait for graduation.** When an exit sells for more than its cost basis, the difference stays in the buffer. The buffer covers exits that sell below cost, and whatever is left when the curve completes is split among the open positions pro rata to their cost basis. Anyone can crank a claim; the share always lands in the holder's own quote token account.
3. **Transfers wait for graduation.** A Token-2022 transfer hook rejects every transfer of the token whose top-level instruction is not the Trucee router. Tokens stay in your wallet, but direct DBC swaps, wallet-to-wallet transfers and aggregator routes fail until graduation. The hook is the enforcement tool; the new part is the cost-basis exit.

**At graduation**, DBC itself revokes the transfer hook on the swap that completes the curve. That is DBC's on-chain behaviour, not a Trucee setting. The token becomes a plain Token-2022 token, its liquidity migrates to a Meteora DAMM v2 pool, and it trades freely.

As far as public sources show, no other launchpad on DBC or elsewhere offers a cost-basis exit before graduation. Transfer hooks themselves are common on DBC. Trucee runs on unmodified DBC transfer-hook pools (the router calls DBC's `swap2_with_transfer_hook`), so the same rules can be adopted by any DBC launchpad.

{% hint style="info" %}
**Live on mainnet and devnet with router v5 plus the 1% launch fee cap.** Both clusters run the default build of [trucee-programs main](https://github.com/trucee-fun/trucee-programs). It adds a 1% static-fee cap (`FeeTooHigh`, 6024) to v5. Besides the three changes above, router v5 has **Auto-Exit** (set a deadline; if the curve has not completed by then, anyone can trigger your exit at cost before graduation and the refund goes to your own account), an **Anti-Whale cap** (a buy may not leave one position above 20% of the curve's base supply, so a curve needs at least five positions to graduate), **Native Referral** (a buy can name a referrer, who gets part of the protocol fee) and **preset checks** (a market opens only for a launch with no creator allocation, permanently locked liquidity and an immutable mint authority). Those v5 features are unchanged.

Mainnet runs the reproducible `solana-verify` build of that source, deployed on 2026-10-12: the router is 439,904 bytes, sha256 `370c0756…`, and the hook's hash begins `1dbde487…`. Devnet runs a macOS `cargo build-sbf` build of the same source, upgraded in slot 510258390: the router is 439,912 bytes, sha256 `38b88ec9db9bdec6d3810247d8c54220651fcbf1372585dbd20838594b63f041`, and the unchanged hook's hash begins `1525c836…`. The bytes differ because they are different builds of the same source. The deployment signatures and full hashes are under [Security → Upgrade authority](security.md#upgrade-authority). Retention Fee was cut; Retention Fee is research on the [Roadmap](roadmap.md).
{% endhint %}

## Proof so far

* A Python port of the DBC curve matches the on-chain program swap for swap (21,000 swaps).
* 13,800 randomized fuzz runs never produced a negative buffer.
* 36 negative tests, plus LiteSVM suites for Auto-Exit, the cap, referrals, the preset and the launch caps, all against the real DBC program.
* The final devnet end-to-end run on router v5 (before the fee cap) walked the whole journey (launch, buys, exit at cost before graduation, Auto-Exit, graduation, DAMM v2 migration, surplus claims) and passed 13 of 13 checks. A separate 15/15 smoke run on the same previous build saw the Anti-Whale cap reject 14 of 40 random trades live.
* Trucee's crank ran unattended on devnet and finalized, migrated and claimed a graduated market on its own.

Commands, limits and known risks are on the [Security](security.md) and [Research & data](research-and-data.md) pages.

## Where to go next

* [How it works](how-it-works.md): the mechanism and the refund math.
* [For traders](traders.md): buy, exit at cost, claim the surplus.
* [For creators](creators.md): launch a token on a Zero-PvP curve.
* [Developers quickstart](developers/quickstart.md) and [Programs reference](developers/programs.md): integrate the router.
* [Security](security.md): invariants, tests, known limitations, and the answer to "isn't this a honeypot?".
* [Research & data](research-and-data.md): the simulations and data behind the numbers above.
* [FAQ](faq.md), [Roadmap](roadmap.md) and [Links](links.md).

## Source repositories

Each repository is published separately. Clone them side by side under these folder names so relative dependencies and reproduction commands work:

| Folder | Repository | Contents |
| --- | --- | --- |
| `zpvp` | [trucee-programs](https://github.com/trucee-fun/trucee-programs) | Router and transfer-hook programs |
| `sdk` | [trucee-sdk](https://github.com/trucee-fun/trucee-sdk) | TypeScript SDK |
| `app` | [trucee-app](https://github.com/trucee-fun/trucee-app) | Web app |
| `sim` | [trucee-sim](https://github.com/trucee-fun/trucee-sim) | Python model and fuzz runner |
| `worker` | [trucee-worker](https://github.com/trucee-fun/trucee-worker) | Permissionless crank |
| `litesvm-diff` | [trucee-litesvm-diff](https://github.com/trucee-fun/trucee-litesvm-diff) | LiteSVM tests and recorded results |
| `gitbook` | [trucee-docs](https://github.com/trucee-fun/trucee-docs) | These docs and typechecked examples |

```bash
git clone https://github.com/trucee-fun/trucee-programs zpvp
git clone https://github.com/trucee-fun/trucee-sdk sdk
git clone https://github.com/trucee-fun/trucee-app app
git clone https://github.com/trucee-fun/trucee-sim sim
git clone https://github.com/trucee-fun/trucee-worker worker
git clone https://github.com/trucee-fun/trucee-litesvm-diff litesvm-diff
git clone https://github.com/trucee-fun/trucee-docs gitbook
```

From the workspace folder, check the docs with `bash gitbook/scripts/check.sh`. For the TypeScript example, build the sibling SDK first as described in the [Quickstart](developers/quickstart.md#install), then run `cd gitbook/examples && npx tsc --noEmit`. Each repository uses the MIT license; see [LICENSE](LICENSE).
