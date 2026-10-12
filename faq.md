# FAQ

Short answers to the questions people ask most. The [Introduction](README.md) has the overview, [How it works](how-it-works.md) walks through the mechanism, and [Security](security.md) covers invariants, tests and known limits.

{% hint style="info" %}
**Status on 2026-10-12.** Trucee went live on Solana mainnet on 2026-10-12, and also runs on devnet, with the same program IDs. Both run router v5 plus the 1% launch fee cap. Answers marked **v5** describe unchanged features that have run on devnet since the router v5 upgrade on 2026-10-11, and on mainnet since the deploy on 2026-10-12.
{% endhint %}

## General

### Is Trucee a token?

No. Trucee is a product, not a ticker; Trucee has no token and never had one.

## Before graduation

### Why can't I transfer my tokens before graduation?

Trucee records a cost basis for every position. That record only stays exact if every pre-graduation buy and exit goes through the Trucee router. A Token-2022 transfer hook enforces this. While the curve is live, the token can move only inside a transaction whose top-level instruction is the router. Wallet-to-wallet transfers, direct DBC swaps and aggregator routes all fail with the error "Pre-graduation transfers must go through the Zero-PvP router".

Any way of moving tokens outside the router would reopen PvP, because a holder could sell to another buyer above cost. The token is therefore non-transferable until graduation by design. Your tokens stay in your own wallet (your associated token account) the whole time, and DBC removes the hook when the curve completes. See [What happens at graduation?](#what-happens-at-graduation).

*Source: [programs/zpvp_hook/src/lib.rs](https://github.com/trucee-fun/trucee-programs/blob/main/programs/zpvp_hook/src/lib.rs) (`transfer_hook`, `TransferNotViaRouter`); [programs/zpvp_router/src/lib.rs](https://github.com/trucee-fun/trucee-programs/blob/main/programs/zpvp_router/src/lib.rs) (`Swap.user_base` is the buyer's canonical associated token account).*

### Is this a honeypot?

No. Risk scanners flag tokens whose transfer hook restricts selling, so a Trucee token may get flagged. Three facts answer the concern:

1. **Exits are never blocked.** Before graduation, every holder can sell back through the router at any time and receive their cost basis, minus the fee and haircut described under [What is my floor?](#what-is-my-floor). The router sells your tokens into the curve and pays your refund from the market's buffer. The router has no pause switch and no admin instruction. Its instructions are `init_market`, `buy`, `sell`, `finalize` and `claim_surplus`, plus `set_auto_exit` and `auto_exit` in v5.
2. **DBC removes the hook at graduation.** Meteora's DBC program revokes the transfer hook on the swap that completes the curve. That happens in DBC's own code and is not a Trucee setting. From then on the token is a plain Token-2022 token that you can send and trade anywhere.
3. **The upgrade authority is disclosed.** Both programs, the hook and the router, are upgradeable. On mainnet and on devnet, both have the same upgrade authority, `CamCkeR9iqBij1ZyrEYj9mp6emQtpMVdWWVCUX46tFLE`. You can check it with `solana program show <program id> --url mainnet-beta`, or `--url devnet`.

Here is what the design does restrict. Before graduation you cannot take a profit, and you cannot send the token to another wallet. Those limits are the point of the mechanism.

*Source: [programs/zpvp_router/src/lib.rs](https://github.com/trucee-fun/trucee-programs/blob/main/programs/zpvp_router/src/lib.rs) (`sell`, `exit_at_cost`, the `#[program]` module); [programs/zpvp_hook/src/lib.rs](https://github.com/trucee-fun/trucee-programs/blob/main/programs/zpvp_hook/src/lib.rs) (header: DBC `revoke_transfer_hook` in [process_swap.rs](https://github.com/MeteoraAg/dynamic-bonding-curve/blob/main/programs/dynamic-bonding-curve/src/instructions/swap/process_swap.rs)).*

### What is my floor?

Until graduation, your floor is your cost basis, minus the fee you would pay selling at cost, minus a 2-lamport haircut, and never below zero:

```
refund = basis − ceil(basis × fee rate) − 2 lamports
```

* **basis** is the quote that actually entered the curve on your buys, after DBC's trading fee, minus 16 lamports per buy. The 16 lamports absorb DBC's rounding, which favours the pool.
* **fee rate** is the launch's DBC trading fee, stored as a numerator over 1,000,000,000 (10,000,000 = 1%). The fee is rounded up.
* A partial exit uses a pro-rata share of your basis (average cost, rounded down). A full exit uses all the basis you have left.

Here is an example from the router's unit tests: a basis of 1 SOL at a 1% fee refunds 0.989999998 SOL.

The floor holds until graduation, however far the price falls, because the router computes the refund from your basis, not from the sale price. Before graduation the floor is also your ceiling. If the price is above your cost, an exit still pays cost. The difference stays in the market's buffer and goes to the holders who still hold a position at graduation.

*Source: [programs/zpvp_router/src/math.rs](https://github.com/trucee-fun/trucee-programs/blob/main/programs/zpvp_router/src/math.rs) (`DUST_PER_BUY = 16`, `HAIRCUT_PER_EXIT = 2`, `basis_for_buy`, `basis_for_exit`, `refund_for`, test `refund_matches_python_reference`); [programs/zpvp_router/src/lib.rs](https://github.com/trucee-fun/trucee-programs/blob/main/programs/zpvp_router/src/lib.rs) (`buy` records the quote-reserve increase as basis).*

### Is there a limit on how much I can buy?

{% hint style="info" %}
**v5:** live on devnet since the router v5 upgrade (2026-10-11), and on mainnet since the deploy (2026-10-12).
{% endhint %}

Yes. No buy may leave a position above 20% of the curve's base supply for sale, which is the DBC config's `swap_base_amount`. A buy that would cross the cap fails with error 6022 `PositionCapExceeded`. After a partial exit you can buy back up to the cap. As a result, a curve needs at least five holders to graduate.

The cap can be enforced because tokens cannot move between wallets before graduation. Someone can still split purchases across several wallets, but each extra buy pushes the price further up the curve.

*Source: [programs/zpvp_router/src/lib.rs](https://github.com/trucee-fun/trucee-programs/blob/main/programs/zpvp_router/src/lib.rs) (`ANTI_WHALE_BPS = 2000`, `anti_whale_cap`, `buy`, tests `anti_whale_cap_is_20_percent_of_swap_base_amount_floored` and `position_cap_error_is_appended_after_auto_exit_errors`).*

### Can I set an exit date and walk away?

{% hint style="info" %}
**v5:** live on devnet since the router v5 upgrade (2026-10-11), and on mainnet since the deploy (2026-10-12).
{% endhint %}

Yes, with Auto-Exit. Turning it on takes two steps:

1. Store a deadline as a Unix time in the future. Setting it to 0 clears it.
2. Approve the market's program address as the delegate of your tokens.

The router uses that approval only in its auto-exit instruction. Once the deadline has passed, and while the curve is still live, anyone can trigger the exit. The router sells your whole position at cost, on the same terms as a manual exit, and pays the refund into your own quote token account. Whoever triggers the exit gains nothing. If the curve graduates first, Auto-Exit no longer applies (error 6021 `AutoExitCurveComplete`), and you keep the token, which is now free to trade, plus your share of the surplus. The approval stays on your token account until you revoke it; the web app offers **Revoke approval** once no deadline is active or the market is finalized (see [For traders → Revoke approval](traders.md#revoke-approval)).

*Source: [programs/zpvp_router/src/lib.rs](https://github.com/trucee-fun/trucee-programs/blob/main/programs/zpvp_router/src/lib.rs) (`set_auto_exit`, `auto_exit`, `auto_exit_swap_accounts`, `is_valid_auto_exit_deadline`, `is_auto_exit_due`, errors 6019–6021).*

## Graduation

### What happens at graduation?

A curve graduates when its quote reserve reaches the launch's migration threshold. In the current build, a SOL-quoted launch can set that threshold at 10 SOL at most (see [What can I pay with?](#what-can-i-pay-with)). After that:

1. **The hook comes off.** On the swap that completes the curve, DBC revokes the transfer hook. Your tokens stayed in your wallet all along and now become a plain Token-2022 token that you can send and trade anywhere.
2. **Exits at cost end.** Nobody can sell into a completed curve, so the router stops paying refunds. Your position is now simply the tokens you hold.
3. **The pool migrates to DAMM v2.** DBC moves the liquidity into a Meteora DAMM v2 pool, where the token trades normally. A crank sends the migration transaction. Trucee's own crank has a migration job for this: on devnet it has migrated a graduated pool while running unattended, and it migrated the pool of the final end-to-end run.
4. **The surplus is paid out.** Anyone can call `finalize`, which freezes the market's buffer as the surplus and records the total basis still held. Each holder then receives `surplus × their basis ÷ total basis`, rounded down, into their own quote token account. Anyone can trigger that claim for you, and it always pays you. When it closes your position account, the account's rent deposit also goes back to you.

Steps 3 and 4 do not depend on each other. The surplus is whatever exits left in the buffer (sale proceeds minus refunds). Its size therefore depends on trading before graduation, and it can be zero.

*Source: [programs/zpvp_hook/src/lib.rs](https://github.com/trucee-fun/trucee-programs/blob/main/programs/zpvp_hook/src/lib.rs) (header); [programs/zpvp_router/src/lib.rs](https://github.com/trucee-fun/trucee-programs/blob/main/programs/zpvp_router/src/lib.rs) (`QUOTE_CAPS`, `finalize`, `claim_surplus`, `ClaimSurplus` closes the position to its owner); [programs/zpvp_router/src/math.rs](https://github.com/trucee-fun/trucee-programs/blob/main/programs/zpvp_router/src/math.rs) (`surplus_share`); [out/crank-run-devnet.json](https://github.com/trucee-fun/trucee-worker/blob/main/out/crank-run-devnet.json) and [out/e2e-devnet-final.json](https://github.com/trucee-fun/trucee-worker/blob/main/out/e2e-devnet-final.json) (the crank's migration job on devnet).*

### What if the curve never graduates?

Before graduation, you can still exit at cost whenever you want, minus the fee at cost and 2-lamport haircut. The router has no expiry date, and no instruction closes a market that has not graduated. Until you exit:

* the token stays non-transferable;
* no surplus is paid, because `finalize` requires a completed curve;
* the rent deposit for your 97-byte position account stays locked, because a position only closes when its surplus is claimed after graduation.

With Auto-Exit (v5) you can choose your exit date in advance.

*Source: [programs/zpvp_router/src/lib.rs](https://github.com/trucee-fun/trucee-programs/blob/main/programs/zpvp_router/src/lib.rs) (`Market` has no expiry field; `finalize` checks `CurveNotComplete`; test `position_layout_appends_auto_exit_deadline`).*

## Costs

### What fees do I pay?

| Cost | Amount | Where it goes |
| --- | --- | --- |
| DBC trading fee on a buy | The launch's fixed base fee, set in its DBC config and charged in the quote token on your input | DBC splits it between Meteora's protocol share and the launch's partner and creator |
| Fee at cost on an exit | `ceil(basis × fee rate)`, deducted from your refund | Stays in the market's buffer, which is paid to holders at graduation |
| Rounding reserve | 16 lamports per buy, left out of your basis | Absorbs DBC's rounding in the pool's favour |
| Exit haircut | 2 lamports per exit, deducted from your refund | Stays in the market's buffer |
| Solana | Network fees, plus the rent deposit for your position account | The rent comes back when the position closes after graduation |

When you exit, the router sells your tokens into the curve. DBC's sell fee comes out of that sale's proceeds, which go to the buffer. You pay the fee at cost instead.

Trucee itself takes no fee. The router has no fee account, and the only quote it pays out goes from the market's buffer to holders, as refunds and surplus shares. The current router source accepts only fixed fees of at most 1% (100 bps). A higher static fee is rejected at `init_market` with `FeeTooHigh` (6024). It rejects configs with a fee scheduler, a rate limiter or a dynamic (volatility) fee (`UnsupportedFeeConfig`), so the fee rate at launch is also the fee rate at exit.

*Source: [programs/zpvp_router/src/dbc.rs](https://github.com/trucee-fun/trucee-programs/blob/main/programs/zpvp_router/src/dbc.rs) (`read_config`: static base fee, no dynamic fee, fees collected in the quote token, buy fee on input and sell fee on output); [programs/zpvp_router/src/math.rs](https://github.com/trucee-fun/trucee-programs/blob/main/programs/zpvp_router/src/math.rs); [programs/zpvp_router/src/lib.rs](https://github.com/trucee-fun/trucee-programs/blob/main/programs/zpvp_router/src/lib.rs) (`exit_at_cost`, `claim_surplus`).*

### What can I pay with?

The current build accepts three quote tokens. Each one caps how much a curve can hold before it graduates:

| Quote token | Graduation threshold cap |
| --- | --- |
| SOL (as wrapped SOL) | 10 SOL |
| Tokenized Tesla shares (xStocks) | 5 shares |
| Tokenized Nvidia shares (xStocks) | 10 shares |

On mainnet, a launch can use any of the three. Devnet launches use SOL. Devnet has no xStock mints, so xStock markets are tested only in LiteSVM against mainnet snapshots. Note that the issuer of an xStock can pause or claw back balances of that token.

*Source: [programs/zpvp_router/src/lib.rs](https://github.com/trucee-fun/trucee-programs/blob/main/programs/zpvp_router/src/lib.rs) (`QUOTE_CAPS`, `check_launch_caps`).*

## Trust

### Has Trucee had an independent security review?

No. Both programs are not independently reviewed. They have had internal reviews, and they come with these test suites:

* A Python port of the DBC curve matches the on-chain program swap for swap over 21,000 swaps.
* 13,800 randomized fuzz runs of the refund accounting never produced a negative buffer.
* 36 negative tests cover account substitution, hook bypass and lifecycle abuse.
* LiteSVM suites run against the real DBC program and cover Auto-Exit, the per-position cap, Native Referral, the preset checks, the launch caps and xStock quotes.
* On devnet, router v5 (before the fee cap) passed a 15/15 smoke run, in which the Anti-Whale cap rejected 14 of 40 random trades live. The final end-to-end run on that previous build then walked the whole journey (launch, buys, exit at cost before graduation, Auto-Exit, graduation, DAMM v2 migration, surplus claims) and passed 13 of 13 checks.

An internal security review of router v5 ([Router v5 review](security/router-v5-review.md)) found three preset issues, two of them HIGH. All are fixed in the build on mainnet and devnet, and none is open. It is not an independent security review. Because the code is not independently reviewed, the default build limits the accepted quote tokens and caps graduation sizes (see [What can I pay with?](#what-can-i-pay-with)). The [Security](security.md) page lists every test suite with its command and latest result.

*Source: [test_sim.py](https://github.com/trucee-fun/trucee-sim/blob/main/test_sim.py), [replay_diff.py](https://github.com/trucee-fun/trucee-sim/blob/main/replay_diff.py), [run_fuzz.py](https://github.com/trucee-fun/trucee-sim/blob/main/run_fuzz.py), [src/zpvp_negative.ts](https://github.com/trucee-fun/trucee-litesvm-diff/blob/main/src/zpvp_negative.ts), [src/zpvp_auto_exit.ts](https://github.com/trucee-fun/trucee-litesvm-diff/blob/main/src/zpvp_auto_exit.ts), [src/zpvp_anti_whale.ts](https://github.com/trucee-fun/trucee-litesvm-diff/blob/main/src/zpvp_anti_whale.ts), [src/zpvp_referral.ts](https://github.com/trucee-fun/trucee-litesvm-diff/blob/main/src/zpvp_referral.ts), [src/zpvp_preset.ts](https://github.com/trucee-fun/trucee-litesvm-diff/blob/main/src/zpvp_preset.ts), [src/zpvp_caps.ts](https://github.com/trucee-fun/trucee-litesvm-diff/blob/main/src/zpvp_caps.ts), [src/zpvp_xstocks.ts](https://github.com/trucee-fun/trucee-litesvm-diff/blob/main/src/zpvp_xstocks.ts), [src/zpvp_e2e.ts](https://github.com/trucee-fun/trucee-litesvm-diff/blob/main/src/zpvp_e2e.ts); [out/e2e_devnet_v6.json](https://github.com/trucee-fun/trucee-litesvm-diff/blob/main/out/e2e_devnet_v6.json); [out/e2e-devnet-final.json](https://github.com/trucee-fun/trucee-worker/blob/main/out/e2e-devnet-final.json); [Router v5 review](security/router-v5-review.md).*

### Where is Trucee deployed?

| Program | Program ID (mainnet and devnet) |
| --- | --- |
| Hook (`zpvp_hook`) | `CUNNV1MqVB53N4jWn91uVFXm1dBSyaynR6iBCbufJWMS` |
| Router (`zpvp_router`) | `D4sk6wwELD6cmd7tv6hE4hkxQP8SF8tjdegYym8iWNNb` |

Trucee went live on Solana mainnet on 2026-10-12 and also runs on devnet, with the same program IDs. Both run the default build of [trucee-programs main](https://github.com/trucee-fun/trucee-programs): router v5 plus the 1% launch fee cap (`FeeTooHigh`, 6024). Auto-Exit, the 20% per-position cap, Native Referral and the preset checks are unchanged.

On mainnet, both programs are the reproducible `solana-verify` build of that source. The router is 439,904 bytes, sha256 `370c0756f948f95ade4c15170897791c9e52c3c2a6d82d8986c9e51dfc233030`, deployed in slot 456095594. The hook's sha256 begins `1dbde487…`. On devnet, the router is a macOS `cargo build-sbf` build of the same source: 439,912 bytes, sha256 `38b88ec9db9bdec6d3810247d8c54220651fcbf1372585dbd20838594b63f041`. Its upgrade transaction is `2x4JHAYtDbvijNiHzv5rDvXjQVPc7hkbW2YbbnUxMGmuUSBTMbUFdtmey9YCWsUqCBGDPsbNMm3qE5N71V9bhQ2y`, in slot 510258390. The devnet hook is unchanged, sha256 `1525c836…`. The bytes differ because they are different builds of the same source. Deploy signatures and full hashes are under [Security → Upgrade authority](security.md#upgrade-authority). For the upgrade authority, see [Is this a honeypot?](#is-this-a-honeypot).

*Source: [programs/zpvp_hook/src/lib.rs](https://github.com/trucee-fun/trucee-programs/blob/main/programs/zpvp_hook/src/lib.rs) and [programs/zpvp_router/src/lib.rs](https://github.com/trucee-fun/trucee-programs/blob/main/programs/zpvp_router/src/lib.rs) (`declare_id!`); `solana program show D4sk6wwELD6cmd7tv6hE4hkxQP8SF8tjdegYym8iWNNb --url mainnet-beta` (deployed in slot 456095594); `solana program show D4sk6wwELD6cmd7tv6hE4hkxQP8SF8tjdegYym8iWNNb --url devnet` (last deployed in slot 510258390).*

## Wallets

### Which wallets work?

Buys and exits are ordinary transactions that Phantom, Solflare and Backpack can sign; we verified them by simulation on devnet and in a test environment with the wallets' guard instructions, and a hands-on check with each wallet is pending.

* **Simulation on devnet.** A router buy against a live devnet market whose token has the transfer hook, with extra instructions before and after it, simulated with no error. The hook ran and passed. Wallet previews simulate the same kind of transaction before you sign.
* **Test environment (LiteSVM).** Router buys and exits passed with extra instructions placed before them, after them, or both, including the real Lighthouse program that Phantom and Solflare use for their guard instructions. Transfers that did not come through the router still failed with `TransferNotViaRouter`. The run passed 15 checks with 0 failures.

The wallet does not have to handle the hook itself. Every buy and exit already carries the hook's extra accounts, which the router's instructions include for you. The hook looks at the top-level instruction that is running, not at the other instructions in the transaction, so instructions that a wallet adds do not affect it.

**Guard instructions.** Phantom and Solflare may append their own safety checks ("guard instructions") after the Trucee instructions; Backpack adds none. A guard checks that the result on-chain matches the preview. If the curve moves between your preview and execution, for example because another buy lands in between, a guard can fail. The whole transaction then fails and the buy does not happen; just try again.

**Smart-contract wallets cannot trade before graduation.** Multisig and other smart-contract wallets, such as a Squads vault, call the router from their own program. The router is then not the top-level instruction, so the hook rejects the transfer. This follows from the hook's code; it was not tested with a real smart-contract wallet.

**Pending: the hands-on check.** The Trucee team will try a buy and an exit at cost by hand with each of Phantom, Solflare and Backpack on devnet. That check has to run from a hosted HTTPS site, because Phantom does not add its guard instructions on `localhost`. It will also show how each wallet's preview labels a new Token-2022 token, and whether Phantom shows its warning for a domain it has not reviewed yet. This answer will list the results once the check is done.

Buys and exits go through the Trucee router, which the Trucee app and SDK call for you. The app is at [trucee.fun](https://trucee.fun) on mainnet and [devnet.trucee.fun](https://devnet.trucee.fun) on devnet. The SDK is open source at [trucee-fun/trucee-sdk](https://github.com/trucee-fun/trucee-sdk) (see [Links](links.md)). After graduation, the token works like any other Token-2022 token.

*Source:; [src/rsc01_injected_ixs.ts](https://github.com/trucee-fun/trucee-litesvm-diff/blob/main/src/rsc01_injected_ixs.ts); [programs/zpvp_hook/src/lib.rs](https://github.com/trucee-fun/trucee-programs/blob/main/programs/zpvp_hook/src/lib.rs) (`transfer_hook` reads `get_instruction_relative(0)`); [src/instructions.ts](https://github.com/trucee-fun/trucee-sdk/blob/main/src/instructions.ts) (`routerSwapInstruction`).*

### Why does my wallet's Send or Swap fail for a Trucee token before graduation?

Before graduation, a Trucee token moves through the Trucee router and nowhere else: you can buy, or exit at cost. Your wallet's own Send or Swap is blocked on purpose, so you will see a failed simulation there. For example, Phantom's Send adds the hook's accounts to the transfer, so the transfer reaches the hook, and the hook rejects it with `TransferNotViaRouter` ("Pre-graduation transfers must go through the Zero-PvP router"). After graduation DBC removes the lock on-chain, and the token works like any other Token-2022 token. See [Why can't I transfer my tokens before graduation?](#why-cant-i-transfer-my-tokens-before-graduation).

*Source:; [programs/zpvp_hook/src/lib.rs](https://github.com/trucee-fun/trucee-programs/blob/main/programs/zpvp_hook/src/lib.rs) (`TransferNotViaRouter`).*
