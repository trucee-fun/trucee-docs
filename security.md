# Security

This page covers the rules the two Trucee programs enforce, the tests behind them, how far the code has been reviewed, and the known limits. Every number names the file, command or transaction it comes from. Paths are relative to the Trucee source repository.

{% hint style="warning" %}
**Status as of 2026-10-11:** the programs are **unaudited** and deployed on **devnet only**. Both are upgradeable, and the upgrade authority is a single key held by the team (see [Upgrade authority](#upgrade-authority)). Mainnet is not deployed yet.
{% endhint %}

| Item | Status | Source |
|---|---|---|
| Programs | `zpvp_hook` (Token-2022 transfer hook) and `zpvp_router` (cost-basis router), Anchor 0.32.1 | `zpvp/Anchor.toml`, `zpvp/programs/` |
| Deployed | Devnet only. The devnet router runs the capped build of commit `dd7cc10`. Auto-Exit and the Anti-Whale cap are merged and tested in LiteSVM but are not on devnet yet | `solana program show`, commit `96767fb` |
| External audit | None | — |
| Formal review of the next router release | Pending | [Review status](#review-status) |

## Is this a honeypot?

Risk scanners that inspect Token-2022 transfer hooks can flag a Trucee token as non-transferable or "restricted" before graduation. The flag is correct about the mechanics: before graduation, the token cannot be sent wallet to wallet or traded through DBC directly or through an aggregator. Such attempts fail in the hook with `Pre-graduation transfers must go through the Zero-PvP router`. This is by design. If tokens could move outside the router, they could be sold to other buyers at a profit, which is the PvP that Trucee removes before graduation.

A honeypot traps your money. Trucee does not:

1. **Trucee never blocks an exit.** Before graduation, any holder can call the router's `sell` on their own position (`zpvp/programs/zpvp_router/src/lib.rs`, `sell` → `exit_at_cost`). The router sells the tokens into the DBC curve, puts the proceeds in the market's buffer and refunds the holder's cost basis, minus the trading fee at cost and a 2-lamport haircut (`zpvp/programs/zpvp_router/src/math.rs`, `refund_for`). The router has no admin key, pause switch or blocklist. Beyond account validation, the router checks two things on a `sell`: the amount must be above zero and within the position (error 6007), and the buffer must cover the refund (error 6015). The solvency fuzz below never produced a buffer short of a refund. On xStock-quoted markets, an outside party can still pause exits: the xStock issuer (see [Known limitations](#known-limitations)).
2. **The hook goes away at graduation, and Trucee has no say in it.** DBC itself revokes the transfer hook in the swap that completes the curve (DBC `process_swap.rs`, cited in `zpvp/programs/zpvp_hook/src/lib.rs`). From then on the token is a plain Token-2022 token. The end-to-end suite checks this on every run: "DBC revoked the transfer hook at graduation" and "after graduation: plain wallet transfer works (token is free)" (`litesvm-diff/src/zpvp_e2e.ts`).
3. **Upgrade authority is disclosed.** Who can change the program code is listed in the next section.

What you still have to trust is the upgrade authority. An upgrade could change any of these rules, including the hook. That is why the key is disclosed below and listed again under [Known limitations](#known-limitations).

## Upgrade authority

| Program | Program ID | Devnet upgrade authority | Mainnet |
|---|---|---|---|
| `zpvp_router` | `D4sk6wwELD6cmd7tv6hE4hkxQP8SF8tjdegYym8iWNNb` | `CamCkeR9iqBij1ZyrEYj9mp6emQtpMVdWWVCUX46tFLE` | Not deployed yet |
| `zpvp_hook` | `CUNNV1MqVB53N4jWn91uVFXm1dBSyaynR6iBCbufJWMS` | `CamCkeR9iqBij1ZyrEYj9mp6emQtpMVdWWVCUX46tFLE` | Not deployed yet |

- Source: `solana program show <PROGRAM_ID> --url devnet`, read on 2026-10-11. The router was last deployed in slot 509820232 and the hook in slot 506686788. You can run the same command to check the current values.
- The latest devnet router upgrade (the capped build of commit `dd7cc10`) has the deploy signature `3MujRv1kxL92cPVWXAbXrqeaVF4BbuTdFZJnwvzbjrCGeTuXRQ1tPCxVRnkXiFx3Y3Ayep2N25HX9ztgYNDZeiZ4`.
- The authority is one team-held keypair, not a multisig.
- The program IDs are fixed in code: the hook accepts only `D4sk6w…` as the router (`ROUTER_ID`), and the router opens markets only for pools whose hook is `CUNNV1…` (`ZPVP_HOOK_ID`).

## Invariants

These are the rules the code enforces. Error codes are `RouterError` values in `zpvp/programs/zpvp_router/src/lib.rs`.

| # | Invariant | Enforced in | Tested by |
|---|---|---|---|
| 1 | Before graduation, the base token moves only while a router instruction is the top-level instruction being executed. A transfer placed as a separate top-level instruction next to a router buy still fails | `zpvp_hook` `transfer_hook` (instructions sysvar) | `zpvp_e2e.ts` (direct DBC buy, wallet-to-wallet transfer), `zpvp_negative.ts` (transfer next to a router buy, delegate transfer, transfer without hook accounts) |
| 2 | No exit before graduation returns more than its cost basis. Basis per buy = net quote that entered the curve − 16 lamports. Partial exits take pro-rata average-cost basis. Refund = basis − ⌈basis × fee⌉ − 2 lamports, floored at 0 | `math.rs`: `basis_for_buy`, `basis_for_exit`, `refund_for` | `cargo test -p zpvp_router` (`refund_matches_python_reference` and others), `sim/test_sim.py` (`test_early_exit_never_profits`) |
| 3 | The buffer never pays out more than it holds. A refund the buffer cannot cover is rejected (6015) | `exit_at_cost` | Solvency fuzz below: no negative buffer at any step |
| 4 | The surplus is split once, pro rata by basis held at graduation, and never over-allocated. `finalize` works only after the curve completes and only once. Each claim is ⌊surplus × basis / total basis⌋. Total claims ≤ snapshot (6016). A claim closes the position, so it cannot be repeated | `finalize`, `claim_surplus`, `math.rs` `surplus_share` | `zpvp_e2e.ts` (claims use up the surplus, leaving only rounding dust), `zpvp_negative.ts` (claim before finalize, finalize twice, claim twice) |
| 5 | Calls anyone can make cannot redirect funds. `claim_surplus` and `auto_exit` pay only the owner's canonical quote ATA, and position rent goes back to the owner | `ClaimSurplus`, `AutoExit` account constraints | `zpvp_negative.ts` (crank section), `zpvp_auto_exit.ts` |
| 6 | Accounts cannot be swapped. The market is a PDA of the pool and is bound to its config, mints, vaults and buffer. The position is a PDA of (market, user). The base account must be the user's canonical ATA (ImmutableOwner), so ownership cannot be handed over to get around the hook | `Swap`, `InitMarket`, `Finalize` constraints | `zpvp_negative.ts` (market B accounts in market A, fake DBC program, someone else's position or token account, non-ATA base account) |
| 7 | Markets open only on configs the refund math is proven for: a DBC transfer-hook pool and config whose hook is `zpvp_hook`, a static base fee, no dynamic fee, and fees collected in the quote token | `dbc.rs` `read_pool`, `read_config` | `zpvp_negative.ts` (wrong hook 6013; fee scheduler, dynamic fee or base-token fees 6014; non-hook pool) |
| 8 | Anti-Whale: after every buy, including the partial-fill buy that completes the curve, a position holds at most ⌊20% × the config's `swap_base_amount`⌋ (6022). So a curve needs at least 5 positions to graduate | `buy`, `anti_whale_cap` | `zpvp_anti_whale.ts`, `cargo test` (`anti_whale_cap_is_20_percent_of_swap_base_amount_floored`) |
| 9 | Auto-Exit: only the owner sets the deadline, which must be in the future (or 0 to clear it). Anyone can run `auto_exit` after the deadline, but only while the curve is live (6020, 6021). It exits the whole position at cost | `set_auto_exit`, `auto_exit` | `zpvp_auto_exit.ts` |
| 10 | Mainnet-beta caps in the default build: quote mint allowlist (6017) and a graduation-threshold cap per quote (6018). The `unrestricted` Cargo feature lifts the caps for test builds only | `QUOTE_CAPS`, `check_launch_caps` | `zpvp_caps.ts` |

Engineering rules for every change (`docs/trucee-plan.md`, "Invariants for any refactor"): keep instruction names, account order, discriminators and the `unrestricted` feature. Keep the Market and Position byte layouts, with new fields added at the end. Every new money path needs a negative test and must keep the solvency fuzz green.

## Test and fuzz evidence

Commands run from `zpvp/` (Rust), `litesvm-diff/` (LiteSVM, the real DBC program loaded from `programs/dbc.so`) or `sim/` (Python). `<unrestricted build>` is a router binary built with the test-only `unrestricted` feature, so tests can use fresh quote mints. The program and LiteSVM results were re-run on commit `73596c2`. The Python results were re-run on commit `c87b043` while this page was written.

| Suite | What it checks | Command | Result |
|---|---|---|---|
| Router unit tests | Refund math, cap math, deadlines, layouts, error codes | `cd zpvp && cargo test -p zpvp_router` | 17 passed |
| Negative tests | Account substitution, hook bypass, unsupported configs, lifecycle abuse, crank redirection | `ROUTER_SO=<unrestricted build> npx tsx src/zpvp_negative.ts out/scenarios.json 0` | 36 PASS, 0 FAIL |
| Auto-Exit | Setter edge cases, a third-party crank exits at cost, every rejection with its exact code and no state change | `ROUTER_SO=<unrestricted build> npx tsx src/zpvp_auto_exit.ts out/scenarios.json 0` | 52 PASS, 0 FAIL |
| Anti-Whale | Buying exactly up to the cap, 6022 rejections with no state change, buying back after a partial exit, the graduating buy, a 6-trader graduation | `ROUTER_SO=<unrestricted build> npx tsx src/zpvp_anti_whale.ts out/scenarios.json 0` | 11 PASS, 0 FAIL |
| End to end (LiteSVM) | Hook blocks, buys, random buy/exit sequence, graduation, hook revoked, finalize, crank claims, free transfers after graduation | `ROUTER_SO=<unrestricted build> npx tsx src/zpvp_e2e.ts out/scenarios.json 0 <out.json> --ops 60` | 15 PASS, 0 FAIL |
| xStock quote | TSLAx-quoted market end to end on the capped build, using mainnet mint and token-badge snapshots | `npx tsx src/zpvp_xstocks.ts out/scenario_tiny.json 0` | 13 PASS, 0 FAIL |
| Launch caps | Allowlist and threshold caps at the cap and one unit above it | `ROUTER_SO=programs/router_capped.so npx tsx src/zpvp_caps.ts out/scenarios.json out/scenario_small.json` | 8 PASS |
| End to end (devnet) | The same lifecycle checks against live devnet, wSOL quote, on the deployed capped router | `npx tsx src/zpvp_e2e.ts out/scenario_tiny.json 0 out/e2e_devnet_v5.json --rpc <devnet RPC> --wsol --ops 40` (script as of commit `96767fb`; output `litesvm-diff/out/e2e_devnet_v5.json`) | 15 PASS, 0 FAIL |
| DBC port, differential | The Python port of the DBC curve against the real DBC program: amount in, amount out, resulting price and reserve, per swap | `cd sim && python3 replay_diff.py ../litesvm-diff/out/results.json` and the same with `results_b.json` | 9,000 + 12,000 = 21,000 swaps, 0 mismatches |
| Solvency fuzz | Router buffer at every step: 3 lot modes × (random, greedy adversary) × (stop at graduation, or a dead curve where everyone exits), with the on-chain constants (16 lamports per buy, 2 per exit) | `cd sim && python3 run_fuzz.py --random 300 --adversarial 60 --seed 777 --dust-per-buy 16 --haircut 2` | 2,160 runs in 12 sections, every section "runs with buffer < 0 at any step : 0" |
| Simulator unit tests | Round trips, early exits never profit, tiny-slice drain attack, random orderings stay solvent | `cd sim && python3 -m unittest test_sim` | 8 tests, OK |

Earlier runs of the same scripts are recorded in `docs/trucee-plan.md` ("Core mechanism"): 13,800 runs of `sim/run_fuzz.py` with no negative buffer, and the port bit-exact against DBC over 21,000 swaps (the two `replay_diff.py` runs above). The seeds and flags of the 13,800 runs were not recorded.

{% hint style="info" %}
The fuzz runs on the Python model of the router (`sim/zero_pvp.py`), not on the program itself. Two checks tie the model to the program: `math.rs` mirrors the model one to one (`refund_matches_python_reference`), and `sim/replay_router.py` replays recorded router runs through the model.
{% endhint %}

## Review status

- **External audit:** none.
- **Earlier internal review:** findings H1/H2 (configs the refund math is not proven for) and M1 (token account ownership) are fixed. Each has negative tests in `litesvm-diff/src/zpvp_negative.ts`, in the sections labelled "security review H1/H2" and "security review M1".
- **Per-change reviews:** the AI-assisted security reviews run as part of the build workflow covered `set_auto_exit`, `auto_exit` and the Anti-Whale cap. They found no CRITICAL or HIGH issues. These are not human audits.
- **Formal review of the next router release** (Auto-Exit, Anti-Whale and the other changes merged since the devnet build): pending at the time of writing. No report has been published.

## Known limitations

1. **Tokens cannot be transferred before graduation, by design.** Wallet sends, aggregator routes, and use in other protocols (lending, LP) all fail until the curve completes. Scanners may flag the token for this. A variant where transfers carry the cost basis along was researched and not built. Trustless OTC through a Jito bundle with an assertion program cannot be blocked on-chain, and that holds for any design that allows transfers before graduation, including a router "transfer with basis" (`docs/trucee-plan.md`, Roadmap, "Wallet-Native Basis"). Wallet-Native Basis is a roadmap item, not a shipped feature.
2. **Unaudited, upgradeable, team-held key.** The upgrade authority listed above can replace either program. The mainnet-beta caps (item 5) limit how much a single curve can hold. They do not remove this trust.
3. **Sybil wallets and the Anti-Whale cap.** The cap applies to one position, which belongs to one wallet. One person can buy from many wallets, and the program cannot tell. Each of those wallets still buys up the same curve (`docs/trucee-plan.md`, "Anti-Whale Cap"). The cap limits how much one wallet can hold, not how much one person can hold.
4. **xStock issuers keep their powers.** xStock quote mints (TSLAx, NVDAx) have the permanent-delegate and pausable extensions, so the issuer can pause transfers or claw back balances (`docs/trucee-plan.md`, "xStocks"; `QUOTE_CAPS` comment in `lib.rs`). Claw-backs can reach a market's buffer vault. While a quote mint is paused, buys, exits and claims on that market cannot settle. xStock markets are tested in LiteSVM with mainnet snapshots only, because devnet has no xStock mints.
5. **Mainnet-beta caps.** The default build accepts only these quote mints and graduation thresholds: wSOL up to 10 SOL, TSLAx up to 5 shares, NVDAx up to 10 shares (`QUOTE_CAPS`). Changing them requires a program upgrade.
6. **Exit at cost is not zero-loss.** An exit gives back the basis minus the trading fee at cost, a 2-lamport haircut and the 16 lamports withheld per buy. Network fees and account rent are separate. A "Zero-Loss Exit" is a roadmap item.
7. **Auto-Exit uses a standing approval.** To use Auto-Exit, the SDK approves the market PDA as delegate for `u64::MAX` of your base tokens. The full amount stops someone from blocking your exit by sending extra tokens to your account. In the current code, the approval is used only in `auto_exit`, after your deadline and while the curve is live. It stays on your token account until you revoke it.
8. **No PvP guarantee after graduation.** Exit at cost ends when the curve completes: DBC rejects swaps on a completed curve, and `auto_exit` returns 6021. The token then trades freely once the pool has migrated to DAMM v2, at market prices. Trucee plans to run the migration from its own crank, because Meteora's keepers may auto-migrate only larger pools (unverified, `docs/trucee-plan.md`, "After the freeze").
9. **Devnet lags `main`.** The devnet router is the capped build of commit `dd7cc10`. Auto-Exit and the Anti-Whale cap are merged and tested in LiteSVM but not deployed yet.

See [How it works](how-it-works.md) for the mechanism, [Programs reference](developers/programs.md) for instructions and accounts, [Research & data](research-and-data.md) for the simulations, and [Roadmap](roadmap.md) for planned work.
