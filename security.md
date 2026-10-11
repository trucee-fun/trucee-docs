# Security

This page covers the rules the two Trucee programs enforce, the tests behind them, how far the code has been reviewed, and the known limits. Every number names the file, command or transaction it comes from. Paths are relative to the Trucee source repository.

{% hint style="warning" %}
**Status as of 2026-10-11:** the programs are **unaudited** and deployed on **devnet only**. Both are upgradeable, and the upgrade authority is a single key held by the team (see [Upgrade authority](#upgrade-authority)). Mainnet is not deployed yet.
{% endhint %}

| Item | Status | Source |
|---|---|---|
| Programs | `zpvp_hook` (Token-2022 transfer hook) and `zpvp_router` (cost-basis router), Anchor 0.32.1 | `zpvp/Anchor.toml`, `zpvp/programs/` |
| Deployed | Devnet only. The devnet router runs router v5, the capped build of commit `3985d1f`, with Auto-Exit, the Anti-Whale cap, Native Referral and the preset checks. The router source on `main` is the same build: its `zpvp/` tree equals the one at `3985d1f` | `solana program show`; `git rev-parse HEAD:zpvp` and `docs/mainnet-deploy.md` (Pinned build) |
| Mainnet release | Not deployed. Source pinned at `3985d1f`, sha256 published: router `32d63bde…`, hook `1525c836…` (full hashes under [Upgrade authority](#upgrade-authority)) | `docs/mainnet-deploy.md` (Pinned build) |
| External audit | None | — |
| Internal review of router v5 | Done: three preset findings fixed, none open. Not an external audit | [Review status](#review-status) |

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

- Source: `solana program show <PROGRAM_ID> --url devnet`, read on 2026-10-11. The router was last deployed in slot 509900704 and the hook in slot 506686788. You can run the same command to check the current values.
- The latest devnet router upgrade is router v5: the capped build of commit `3985d1f`, 439,104 bytes, sha256 `32d63bde1e8cc925aad7ce59e1e7b9c50ed5d918dea039b2db060f811905bff5` (`docs/mainnet-deploy.md`, Pinned build). Its deploy signature is `4PzU4YFJ2JY26ciZjfCXKVcRUKM8fnYwBGGPrBJrexLTLU86UxnRsPRuHSL4B9FqiUCe8KvooahvKZvxQeVjbS6r`. The upgrade before it (the capped build of commit `dd7cc10`) has the deploy signature `3MujRv1kxL92cPVWXAbXrqeaVF4BbuTdFZJnwvzbjrCGeTuXRQ1tPCxVRnkXiFx3Y3Ayep2N25HX9ztgYNDZeiZ4`.
- The hook is unchanged since commit `ec652cc` (`docs/security-review-v5.md`, Scope).
- **Mainnet release:** source pinned at `3985d1f`, sha256 published. The pinned artifacts are `zpvp_router.so`, 439,104 bytes, sha256 `32d63bde1e8cc925aad7ce59e1e7b9c50ed5d918dea039b2db060f811905bff5`, and `zpvp_hook.so`, 210,552 bytes, sha256 `1525c836b1d201457abd6f1291b4f64d896338cf205901e946e009be97ea81e3` (`docs/mainnet-deploy.md`, Pinned build). They are macOS `cargo build-sbf` builds; a `cd zpvp && cargo build-sbf` of `main` at `ba6dcb1` gave the same two hashes on 2026-10-11. The copies in `litesvm-diff/programs/` that the capped LiteSVM suites load (`router_capped.so`, `zpvp_hook.so`) have the same hashes. A reproducible `solana-verify` build is still in progress (see [Roadmap](roadmap.md#in-progress)).
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
| 11 | Zero-PvP preset: the mint authority is immutable on every Trucee market. `init_market` opens a market only for a config with DBC `token_update_authority` = 1 (Immutable), so nobody holds the base mint's mint authority and nobody can mint more tokens or change the metadata. The config must also give the creator no allocation (no locked vesting), use dynamic supply, lock 100% of the LP permanently with no LP vesting, migrate to DAMM v2 and charge no migration fee (6023). DBC never rewrites a config after it is created, so the check holds for the market's life | `preset.rs` `is_zero_pvp_preset`, called by `dbc.rs` `read_config` in `init_market` (router v5; markets opened on devnet before the v5 upgrade were not checked) | `zpvp_preset.ts` (token authority options 0, 2, 3 and 4 rejected; every config that still opens has no mint authority), `cargo test` (`preset.rs` tests) |
| 12 | Native Referral cannot redirect funds or change a buyer's numbers. The referral account must be a writable, initialized token account of the quote mint and neither the pool's quote vault nor the market's buffer vault (6003). DBC pays the referral out of its protocol fee, so the buyer's spend, basis and later refund are the same with or without a referrer | `dbc.rs` `split_buy_remaining`, `check_referral` | `zpvp_referral.ts`, `cargo test` (`dbc.rs` referral tests) |

Engineering rules for every change (`docs/trucee-plan.md`, "Invariants for any refactor"): keep instruction names, account order, discriminators and the `unrestricted` feature. Keep the Market and Position byte layouts, with new fields added at the end. Every new money path needs a negative test and must keep the solvency fuzz green.

## Test and fuzz evidence

Every command below was re-run on commit `ba6dcb1` (2026-10-11), except the two devnet runs, which send devnet transactions and are recorded runs. Commands run from `zpvp/` (Rust), `litesvm-diff/` (LiteSVM), `sdk/`, `app/` and `worker/` (TypeScript) or `sim/` (Python).

{% hint style="warning" %}
**Required first step for the LiteSVM suites and the SDK tests: `cd litesvm-diff && bash scripts/fetch-dbc.sh`.** The LiteSVM suites and the SDK's LiteSVM tests load Meteora's real DBC program from `litesvm-diff/programs/dbc.so`, which is not in the repository: the DBC program is under Meteora's own licence, so we do not redistribute it. The script dumps the mainnet and devnet DBC programs with `solana program dump` (read-only, public RPC, no keypair) and prints their sha256. The SDK's LiteSVM tests also load the routers built by `cd zpvp && cargo build-sbf`.
{% endhint %}

The LiteSVM commands run in `litesvm-diff/` with the router and hook binaries committed in `litesvm-diff/programs/`, as `scripts/ci.sh` does:

```bash
cd litesvm-diff
bash scripts/fetch-dbc.sh                 # required: dumps the DBC binaries
npm ci
export HOOK_SO=programs/zpvp_hook.so      # then run the commands in the table
```

`ROUTER_SO` picks the router: `programs/router_unrestricted.so` is built with the test-only `unrestricted` feature, so tests can use fresh quote mints, and `programs/router_capped.so` is the capped build whose sha256 equals the pinned mainnet release.

| Suite | What it checks | Command | Result |
|---|---|---|---|
| Router unit tests | Refund math, cap math, deadlines, layouts, error codes, preset offsets, referral rules | `cd zpvp && CARGO_BUILD_JOBS=4 cargo test -p zpvp_router` | 48 passed, 0 failed |
| Negative tests | Account substitution, hook bypass, unsupported configs, lifecycle abuse, crank redirection | `ROUTER_SO=programs/router_unrestricted.so npx tsx src/zpvp_negative.ts out/scenarios.json 0` | 36 PASS, 0 FAIL |
| Auto-Exit | Setter edge cases, a third-party crank exits at cost, every rejection with its exact code and no state change | `ROUTER_SO=programs/router_unrestricted.so npx tsx src/zpvp_auto_exit.ts out/scenarios.json 0` | 65 PASS, 0 FAIL |
| Anti-Whale | Buying exactly up to the cap, 6022 rejections with no state change, buying back after a partial exit, the graduating buy, a 6-trader graduation | `ROUTER_SO=programs/router_unrestricted.so npx tsx src/zpvp_anti_whale.ts out/scenarios.json 0` | 11 PASS, 0 FAIL |
| Native Referral | Same spend, basis and refund with and without a referrer; every invalid referral rejected with 6003 and no state change | `ROUTER_SO=programs/router_unrestricted.so npx tsx src/zpvp_referral.ts out/scenarios.json 0` | 21 PASS, 0 FAIL |
| Zero-PvP preset | Configs created by the real DBC program: each preset field read at the router's offset and compared with the DBC decode; every config that breaks a rule rejected with 6023, with no funds moved | `ROUTER_SO=programs/router_unrestricted.so npx tsx src/zpvp_preset.ts out/scenarios.json 0` | 60 PASS, 0 FAIL |
| End to end (LiteSVM) | Hook blocks, buys, random buy/exit sequence, graduation, hook revoked, finalize, crank claims, free transfers after graduation | `ROUTER_SO=programs/router_unrestricted.so npx tsx src/zpvp_e2e.ts out/scenarios.json 0 <out.json> --ops 60` | 15 PASS, 0 FAIL |
| xStock quote | TSLAx-quoted market end to end on the capped build, using mainnet mint and token-badge snapshots | `ROUTER_SO=programs/router_capped.so npx tsx src/zpvp_xstocks.ts out/scenario_tiny.json 0` | 25 PASS, 0 FAIL |
| Launch caps | Allowlist and threshold caps at the cap and one unit above it | `ROUTER_SO=programs/router_capped.so npx tsx src/zpvp_caps.ts out/scenarios.json out/scenario_small.json` | 10 PASS, 0 FAIL |
| SDK | Instruction builders, account and event decoders, error decoding, quotes, the launch preset and launch resume, including LiteSVM tests against the real DBC program | `cd zpvp && cargo build-sbf`, then `cd sdk && npm ci && npx vitest run` | 15 files, 383 tests passed. Without the `cargo build-sbf` step, `scripts/ci.sh` leaves out the LiteSVM tests and prints a SKIPPED line |
| Web app | Trade panel, Auto-Exit and revoke, claims, launch flow, API routes (RPC proxy, metadata, rate limits) | `cd app && npm ci && npx vitest run` | 41 files, 1,522 tests passed |
| Crank (worker) | Every job (finalize, migrate, claims, Auto-Exit), job registration, config guards | `cd worker && npm ci && npx vitest run` | 7 files, 250 tests passed |
| End to end (devnet), smoke | The LiteSVM end-to-end checks against live devnet, wSOL quote, on the deployed router v5 | `npx tsx src/zpvp_e2e.ts out/scenario_tiny.json 0 out/e2e_devnet_v6.json --rpc env --wsol --ops 40 --buy-scale 0.005` (recorded run, commit `125061c`; output `litesvm-diff/out/e2e_devnet_v6.json`) | 15 PASS, 0 FAIL. 14 of the 40 random trades were rejected live with 6022 |
| End to end (devnet), final journey | Launch through the SDK, buys, floor, exit at cost, hook rejections, the cap, Auto-Exit by the crank, graduation, finalize, DAMM v2 migration and claims by the crank's jobs, a free transfer after graduation | `cd worker && npx tsx scripts/e2e-devnet.ts` (recorded run QA-05, commit `99c8a42`. The script writes `worker/out/e2e-devnet.json`; the QA-05 output is kept as `worker/out/e2e-devnet-final.json`) | 13 passed, 0 failed |
| DBC port, differential | The Python port of the DBC curve against the real DBC program: amount in, amount out, resulting price and reserve, per swap | `cd sim && python3 replay_diff.py ../litesvm-diff/out/results.json` and the same with `results_b.json` | 9,000 + 12,000 = 21,000 swaps, 0 mismatches |
| Solvency fuzz | Router buffer at every step: 3 lot modes × (random, greedy adversary) × (stop at graduation, or a dead curve where everyone exits), with the on-chain constants (16 lamports per buy, 2 per exit) | `cd sim && python3 run_fuzz.py --random 300 --adversarial 60 --seed 777 --haircut 2 --dust-per-buy 16` | 2,160 runs in 12 sections, every section "runs with buffer < 0 at any step : 0" |
| Simulator unit tests | Round trips, early exits never profit, tiny-slice drain attack, random orderings stay solvent | `cd sim && python3 -m unittest test_sim` | 8 tests, OK |

The two devnet runs send transactions with a funded devnet keypair (`~/.config/solana/id.json` by default) and read the RPC URL from the environment: set `DEVNET_RPC` to your devnet RPC URL first. `--rpc env` reads `DEVNET_RPC`, and the worker script reads `RPC_URL` or, when that is unset, `DEVNET_RPC`, so the URL, which often carries a provider key, never sits in the command's arguments or the output.

Earlier runs of the same scripts are recorded in `docs/trucee-plan.md` ("Core mechanism"): 13,800 runs of `sim/run_fuzz.py` with no negative buffer, and the port bit-exact against DBC over 21,000 swaps (the two `replay_diff.py` runs above). The seeds and flags of the 13,800 runs were not recorded.

{% hint style="info" %}
The fuzz runs on the Python model of the router (`sim/zero_pvp.py`), not on the program itself. Two checks tie the model to the program: `math.rs` mirrors the model one to one (`refund_matches_python_reference`), and `sim/replay_router.py` replays recorded router runs through the model.
{% endhint %}

## Review status

- **External audit:** none.
- **Earlier internal review:** findings H1/H2 (configs the refund math is not proven for) and M1 (token account ownership) are fixed. Each has negative tests in `litesvm-diff/src/zpvp_negative.ts`, in the sections labelled "security review H1/H2" and "security review M1".
- **Per-change reviews:** the AI-assisted security reviews run as part of the build workflow covered `set_auto_exit`, `auto_exit` and the Anti-Whale cap. They found no CRITICAL or HIGH issues. These are not human audits.
- **Internal review of router v5** (`docs/security-review-v5.md`): covers Auto-Exit, the Anti-Whale cap, Native Referral and the preset hardening. It found three preset issues (two HIGH, one LOW) and fixed them before the v5 build was pinned and deployed to devnet. One HIGH (F3) allowed configs that leave the base mint's mint authority with the creator or partner; since the fix, the mint authority is immutable on every market router v5 opens. No findings are open. Of the accepted items, the lingering delegate approval (A2) now has its app follow-up: the trade panel offers **Revoke approval** (see [Known limitations](#known-limitations), item 7). It is not an external audit.

## Known limitations

1. **Tokens cannot be transferred before graduation, by design.** Wallet sends, aggregator routes, and use in other protocols (lending, LP) all fail until the curve completes. Scanners may flag the token for this. A variant where transfers carry the cost basis along was researched and not built. Trustless OTC through a Jito bundle with an assertion program cannot be blocked on-chain, and that holds for any design that allows transfers before graduation, including a router "transfer with basis" (`docs/trucee-plan.md`, Roadmap, "Wallet-Native Basis"). Wallet-Native Basis is a roadmap item, not a shipped feature.
2. **Unaudited, upgradeable, team-held key.** The upgrade authority listed above can replace either program. The mainnet-beta caps (item 5) limit how much a single curve can hold. They do not remove this trust.
3. **Sybil wallets and the Anti-Whale cap.** The cap applies to one position, which belongs to one wallet. One person can buy from many wallets, and the program cannot tell. Each of those wallets still buys up the same curve (`docs/trucee-plan.md`, "Anti-Whale Cap"). The cap limits how much one wallet can hold, not how much one person can hold.
4. **xStock issuers keep their powers.** xStock quote mints (TSLAx, NVDAx) have the permanent-delegate and pausable extensions, so the issuer can pause transfers or claw back balances (`docs/trucee-plan.md`, "xStocks"; `QUOTE_CAPS` comment in `lib.rs`). Claw-backs can reach a market's buffer vault. While a quote mint is paused, buys, exits and claims on that market cannot settle. xStock markets are tested in LiteSVM with mainnet snapshots only, because devnet has no xStock mints.
5. **Mainnet-beta caps.** The default build accepts only these quote mints and graduation thresholds: wSOL up to 10 SOL, TSLAx up to 5 shares, NVDAx up to 10 shares (`QUOTE_CAPS`). Changing them requires a program upgrade.
6. **Exit at cost is not zero-loss.** An exit gives back the basis minus the trading fee at cost, a 2-lamport haircut and the 16 lamports withheld per buy. Network fees and account rent are separate. A "Zero-Loss Exit" is a roadmap item.
7. **Auto-Exit uses a standing approval.** To use Auto-Exit, the SDK approves the market PDA as delegate for `u64::MAX` of your base tokens. The full amount stops someone from blocking your exit by sending extra tokens to your account. In the current code, the approval is used only in `auto_exit`, after your deadline and while the curve is live. It stays on your token account after an exit and after graduation until you revoke it (`docs/security-review-v5.md`, A2). The web app's trade panel offers **Revoke approval** once no deadline is active, or once the market is finalized; it sends one Token-2022 revoke (`app/src/lib/trade/build-auto-exit.ts`, `buildRevokeApprovalTx`).
8. **No PvP guarantee after graduation.** Exit at cost ends when the curve completes: DBC rejects swaps on a completed curve, and `auto_exit` returns 6021. The token then trades freely once the pool has migrated to DAMM v2, at market prices. Meteora's mainnet keepers migrate SOL pools only when the graduation threshold is 10 SOL or more (`docs/research/RSC-03.md`), so Trucee's crank runs the migration for smaller pools. If the crank is down, the pool waits until someone sends DBC's permissionless migration instruction.
9. **Market opening is permissionless:** anyone can open the market for a pool; the app handles an already-open market. `init_market` and the hook's extra-account list take no creator signature, so a third party can open the market between the creator's pool and market transactions. Every Market field comes from the pool and its config, so that market is the same one the creator would have opened, and no funds are at risk. The creator's own market transaction then fails with "account already in use". The SDK's `buildLaunchPlan`, given the first plan's config and mint keypairs, skips every account that already exists, and the web app rebuilds the launch once that way. If the creator's initial buy is still unsent, the app first shows a fresh quote and asks before sending it (`docs/trucee-plan.md`, decision log, "Market-init front-running"; `sdk/src/launch.ts`; `app/src/lib/launch/run-launch.ts`). See [For creators → If a launch is interrupted](creators.md#if-a-launch-is-interrupted).

See [How it works](how-it-works.md) for the mechanism, [Programs reference](developers/programs.md) for instructions and accounts, [Research & data](research-and-data.md) for the simulations, and [Roadmap](roadmap.md) for planned work.
