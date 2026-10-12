# Router v5 security review

- **Scope:** changes to [programs/](https://github.com/trucee-fun/trucee-programs/blob/main/programs/) and [src/](https://github.com/trucee-fun/trucee-litesvm-diff/blob/main/src/) between `ec652cc` and `9aa81b9`, plus the fixes made in this review. This covers xStock tests, Auto-Exit, Anti-Whale, Native Referral and preset hardening. The hook (`zpvp_hook`) is unchanged since `ec652cc`.
- **Date:** 2026-10-11.
- **Method:**
  - Line-by-line review of [programs/zpvp_router/src/lib.rs](https://github.com/trucee-fun/trucee-programs/blob/main/programs/zpvp_router/src/lib.rs), [programs/zpvp_router/src/dbc.rs](https://github.com/trucee-fun/trucee-programs/blob/main/programs/zpvp_router/src/dbc.rs) and [programs/zpvp_router/src/math.rs](https://github.com/trucee-fun/trucee-programs/blob/main/programs/zpvp_router/src/math.rs).
  - DBC field offsets and enums checked against the DBC SDK 1.5.13 IDL (`@meteora-ag/dynamic-bonding-curve-sdk`, PoolConfig plus the 8-byte discriminator).
  - Behaviour probed on LiteSVM with the real DBC program (`programs/dbc.so` (downloaded with [scripts/fetch-dbc.sh](https://github.com/trucee-fun/trucee-litesvm-diff/blob/main/scripts/fetch-dbc.sh))).
  - Every local suite and the solvency fuzz run on the final source (see Verification).
- **Result:** three preset findings fixed (two HIGH, one LOW) and one test gap closed. Six items accepted with reasons, four of them informational. No open findings.

This records the reviewed v5 snapshot and its verification results. The current source also caps the static trading fee at 1%; that later change is documented in the [Programs reference](../developers/programs.md#init_market). The error-order tests and counts below describe the reviewed snapshot.

## Findings

| ID | Severity | Finding | Status |
|----|----------|---------|--------|
| F1 | HIGH | Preset allowed a DBC migration fee (`migration_fee_percentage` @247, `creator_migration_fee_percentage` @248) | Fixed in `afb3b3a` |
| F2 | LOW | Preset did not pin `migration_option` @233 to DAMM v2 | Fixed in `afb3b3a` |
| F3 | HIGH | Preset allowed `token_update_authority` @246 options that leave a mint authority (3, 4) or metadata authority (0, 2) | Fixed in `9c436c6` |
| F4 | INFO | Test gaps: the Market raw layout, the full 6000–6023 error order, and spending the market delegation through `sell` were not tested | Fixed in `a3e66f8` (tests only) |
| A1 | LOW | Self-referral is allowed | Accepted |
| A2 | LOW | The market PDA stays the token delegate after an exit and after graduation | Accepted, app follow-up |
| A3 | INFO | Partial or revoked approval stops auto-exit | Accepted (only the owner can cause it) |
| A4 | INFO | 6023 fires before 6017/6018 in the capped build | Noted |
| A5 | INFO | Retention-only fee ownership (`fee_claimer` @40 = Trucee PDA, `creator_trading_fee_percentage` @245 = 0) is not enforced | Not applicable to v5 (Retention preset) |
| A6 | INFO | The 6023 message does not name the new rules | Accepted, follow-up |

### F1 (HIGH): migration fee: fixed in `afb3b3a`

The earlier preset review rated this MEDIUM. It is raised to HIGH because DBC accepts the maximum.

- **What DBC does:**
  - The DBC SDK gives `migrationQuoteAmount = migrationQuoteThreshold × (100 − migration_fee_percentage) / 100` (`getMigrationQuoteAmountFromMigrationQuoteThreshold`).
  - The withheld share of the graduation quote does not go into the DAMM v2 pool. The fee claimer (partner) and the pool creator withdraw it with `withdraw_migration_fee`, split `creator_migration_fee_percentage` to the creator and the rest to the partner.
  - Limits: SDK `MAX_MIGRATION_FEE_PERCENTAGE = 99` and `MAX_CREATOR_MIGRATION_FEE_PERCENTAGE = 100`.
- **Proof on LiteSVM:**
  - The real DBC created configs with fee 10/0, 10/50 and 99/100, and the v5 router opened markets on all three.
  - Each has the same `migration_quote_threshold` of 106,407,675,245.
  - `migration_base_threshold` @272 fell from 27,393,136,279,241 at 0% to 24,653,822,651,446 at 10% and 273,931,362,934 at 99%.
  - At 99%, the creator or partner takes 99% of the quote the buyers paid in, and holders graduate into a pool with 1% of the depth.
- **Fix:** `preset::is_zero_pvp_preset` requires @247 == 0 and @248 == 0, rejected with PresetNotAllowed (6023), for all markets.
- **Tests:**
  - Rust, on real DBC config bytes:
    - `preset::tests::migration_offsets_match_the_real_dbc_config_bytes`
    - `the_real_migration_fee_config_is_preset_not_allowed`
    - `a_migration_fee_or_a_creator_share_alone_is_preset_not_allowed`
  - LiteSVM, [src/zpvp_preset.ts](https://github.com/trucee-fun/trucee-litesvm-diff/blob/main/src/zpvp_preset.ts):
    - "migration fee 10%", "migration fee 10% with a 50% creator share" and "migration fee 99% with a 100% creator share" all return 6023 and move no funds.
    - "creator migration fee 50% without a migration fee": DBC itself refuses to create this config (InvalidMigratorFeePercentage 6039), so the test patches a default config in LiteSVM. The router returns 6023 and no funds move.

### F2 (LOW): migration option: fixed in `afb3b3a`

- **What DBC does:** `MigrationOption` has two values: 0 = MetDamm (DAMM v1), 1 = MetDammV2.
  - DBC refuses DAMM v1 for new configs (DeprecatedMigrationOption 6082, shown on LiteSVM).
  - It refuses any other value (InvalidMigrationOption 6015).
  - The finding is therefore not exploitable with today's DBC.
- **Fix:** the router requires @233 == 1 as defense in depth, for example against a config DBC wrote before it deprecated DAMM v1.
- **Tests:**
  - Rust: `preset::tests::only_damm_v2_migration_follows_the_preset`, covering values 0, 2 and 255.
  - LiteSVM: "migration option DAMM v1" shows DBC's refusal, then a patched config returns 6023 and moves no funds.

### F3 (HIGH): token authority: fixed in `9c436c6`

- **What DBC does:** `TokenAuthorityOption` (SDK 1.5.13) is stored at @246 as `token_update_authority`:

  | Value | Option |
  |-------|--------|
  | 0 | CreatorUpdateAuthority |
  | 1 | Immutable |
  | 2 | PartnerUpdateAuthority |
  | 3 | CreatorUpdateAndMintAuthority |
  | 4 | PartnerUpdateAndMintAuthority |

- **Proof on LiteSVM:**
  - With option 3 or 4, DBC leaves the base mint's mint authority with the creator or partner from pool creation on.
  - The creator minted 1e12 base tokens before graduation, and init_market still opened the market.
  - The transfer-hook authority stays with DBC's pool authority under every option.
- **Impact:** before graduation, minted tokens cannot reach the curve. `sell` and `auto_exit` move at most `position.tokens`, and the hook blocks direct DBC swaps and transfers. After graduation DBC revokes the hook, so the minted supply can be dumped on DAMM v2 without limit. Options 0 and 2 leave only the metadata update authority (rename or re-point the URI).
- **Fix:** the router requires @246 == 1 (Immutable), else 6023. The fixture and the SDK launch preset already use 1.
- **Tests:**
  - Rust: `preset::tests::the_real_dbc_configs_hold_an_immutable_token_authority` and `only_an_immutable_token_authority_follows_the_preset`, covering values 0, 2, 3, 4, 5 and 255.
  - LiteSVM, [src/zpvp_preset.ts](https://github.com/trucee-fun/trucee-litesvm-diff/blob/main/src/zpvp_preset.ts): "token authority option 0/2/3/4" all return 6023 and move no funds. For 3 and 4 the test also asserts that DBC left the mint authority with the creator or partner. Every config that still opens is asserted to have no mint authority.

### F4 (INFO): test gaps: fixed in `a3e66f8`

The router logic is unchanged; only tests were added. The Rust layout and error-order tests are in [programs/zpvp_router/src/invariant_tests.rs](https://github.com/trucee-fun/trucee-programs/blob/main/programs/zpvp_router/src/invariant_tests.rs).

- `invariant_tests::market_raw_bytes_keep_the_offsets_tests_and_clients_read`:
  - Market is 274 bytes.
  - Offsets read from the serialized bytes: `total_basis`@241, `finalized`@249, `surplus_snapshot`@250, `basis_snapshot`@258, `surplus_claimed`@266.
- `invariant_tests::error_codes_6000_to_6023_keep_their_order`: all 24 variants, in order.
- [src/zpvp_auto_exit.ts](https://github.com/trucee-fun/trucee-litesvm-diff/blob/main/src/zpvp_auto_exit.ts) `delegateNotSpendableBySell`: with the victim's base ATA delegated u64::MAX to the market and the deadline passed, a cranker's `sell` is rejected and moves nothing:
  - naming the victim's ATA: 2015;
  - naming the victim's position: 2006.

### Accepted

- **A1, self-referral (LOW):**
  - DBC pays the referral cut out of its protocol fee: 20% of the protocol fee.
  - [src/zpvp_referral.ts](https://github.com/trucee-fun/trucee-litesvm-diff/blob/main/src/zpvp_referral.ts) shows that, with or without a referrer, the following are identical:
    - the buyer's spend, `net_into_curve`, basis and tokens;
    - the partner and creator fees;
    - the later exit refund and the amount left in the buffer.
  - A self-referring buyer only claws back part of Meteora's protocol revenue. DBC's own `swap2` accepts any referral account in the same way.
  - Other holders, the buffer and solvency are untouched, and the quote vault and buffer vault cannot be named as referrals.
- **A2, lingering delegate (LOW):**
  - After an auto-exit, a full sell or graduation, the market PDA is still the delegate of the owner's base ATA, with u64::MAX minus what was spent.
  - Only `auto_exit` can spend it: live curve, deadline due, exactly `position.tokens` from the owner's canonical ATA.
  - After graduation `auto_exit` returns 6021 and DBC rejects swaps.
  - Residual risk: a future router upgrade could add a path that spends it. This falls under the upgrade-authority trust that is already disclosed.
  - Follow-up for the app/SDK: revoke the delegate when the deadline is cleared, after an exit, and at claim.
- **A3, partial or revoked approval (INFO):**
  - Only the owner can approve or revoke.
  - Only the market PDA can spend, and only in `auto_exit`, for exactly `position.tokens`, so no third party can drain or grief the allowance.
  - An approval below `position.tokens` (InsufficientFunds) or a revoked delegate (OwnerMismatch) only stops the owner's own automation, and nothing moves (tested).
  - Griefing by sending extra tokens to the victim cannot occur here: transfers before graduation are hook-blocked, and `auto_exit` sells `position.tokens`, not the ATA balance.
- **A4, error order (INFO):**
  - The preset check runs inside `dbc::read_config`, before `check_launch_caps`. In the capped build, a config that breaks both the preset and a cap returns 6023, not 6017/6018.
  - [src/zpvp_caps.ts](https://github.com/trucee-fun/trucee-litesvm-diff/blob/main/src/zpvp_caps.ts) uses preset-compliant configs and still sees 6017/6018.
  - Clients should treat 6013/6014/6017/6018/6023 alike as "config not allowed".
- **A5, Retention-only fee ownership (INFO):**
  - `fee_claimer` @40 = Trucee PDA and `creator_trading_fee_percentage` @245 = 0 belong to the Retention preset, so they are not applicable to v5.
  - @245 only splits the trading fee that traders pay anyway between partner and creator; the refund math does not depend on it.
- **A6, 6023 message (INFO):**
  - The message still reads "(creator allocation, fixed supply or unlocked LP)", because [src/errors.ts](https://github.com/trucee-fun/trucee-sdk/blob/main/src/errors.ts) mirrors it verbatim.
  - The new rules report the same code.
  - Follow-up: widen the message in the router and the SDK together if wanted.

## Checklist verdicts

| # | Item | Verdict | Evidence |
|---|------|---------|----------|
| 1 | Signer/owner checks on `set_auto_exit` and `auto_exit` | **PASS** | See [1. Signer/owner checks](#1-signerowner-checks) |
| 2 | Delegate griefing: u64::MAX, partial, revoked | **PASS** (no third-party griefing; A2/A3 accepted) | See [2. Delegate griefing](#2-delegate-griefing) |
| 3 | `auto_exit` refund destination is canonical only | **PASS** | See [3. Refund destination](#3-refund-destination) |
| 4 | Market PDA as DBC payer cannot be abused by other instructions | **PASS** | See [4. Market PDA as DBC payer](#4-market-pda-as-dbc-payer) |
| 5 | Arithmetic overflow | **PASS** | See [5. Arithmetic overflow](#5-arithmetic-overflow) |
| 6 | Anti-whale cap cannot be bypassed and cannot block exits | **PASS** (sybil caveat accepted: one person can use multiple wallets) | See [6. Anti-whale cap](#6-anti-whale-cap) |
| 7 | Position/Market offsets unchanged, asserted on raw bytes | **PASS** | See [7. Offsets](#7-offsets) |
| 8 | Error code order 6000–6023 | **PASS** | See [8. Error code order](#8-error-code-order) |
| 9 | Events carry `market` | **PASS** | See [9. Events](#9-events) |
| 10 | Migration fee @247/@248 | **FIXED** | F1 |
| 11 | `migration_option` @233 | **FIXED** | F2 |
| 12 | Token authority @246 (found in this review) | **FIXED** | F3 |
| 13 | Retention-only fee ownership: `fee_claimer` @40, `creator_trading_fee_percentage` @245 | **N/A to v5** | A5 |
| 14 | Self-referral | **ACCEPTED** | A1 |
| 15 | 6023 before 6017/6018 in the capped build | **NOTED** | A4 |

### Evidence for items 1–9

#### 1. Signer/owner checks

- `set_auto_exit`:
  - Accounts: `owner: Signer`; `position` with seeds `[position, market, owner]` and `has_one = owner, market`; `market` from its seeds.
  - Rejects past deadlines (6019) and finalized markets (6010).
  - Tests in [src/zpvp_auto_exit.ts](https://github.com/trucee-fun/trucee-litesvm-diff/blob/main/src/zpvp_auto_exit.ts) (rejections block):
    - non-owner signer: 2006;
    - owner key without a signature: 3010;
    - another owner's position: 2006;
    - cross-market positions: 2006 in both directions;
    - a wallet with no position: 3012.
- `auto_exit`:
  - Anyone may crank it, by design.
  - `owner` is bound by the position seeds and `has_one`.
  - It checks that the deadline is due (6020) and the curve is live (6021).
  - Tests: owner key swapped to the cranker or another holder (2006); the not-due cases.

#### 2. Delegate griefing

- With u64::MAX approved, auto-exit works and spends exactly `position.tokens`.
- Approval of `position.tokens − 1`: Token-2022 InsufficientFunds, nothing moves.
- Revoked delegate: OwnerMismatch, nothing moves.
- Re-buy after a full sell: the old deadline was cleared, so auto-exit returns 6020.
- Tests: [src/zpvp_auto_exit.ts](https://github.com/trucee-fun/trucee-litesvm-diff/blob/main/src/zpvp_auto_exit.ts).

#### 3. Refund destination

- `owner_quote` is bound to the owner's canonical ATA by the `associated_token` constraint (mint, owner and token program).
- Tests:
  - the cranker's quote ATA: 2015;
  - an owner's non-ATA quote account: 2009;
  - the owner receives exactly `refund_for(basis, fee)`, and the cranker pays only the tx fee.

#### 4. Market PDA as DBC payer

- `invoke_signed` with the market seeds appears in exactly three places:
  - the `auto_exit` swap2: input is the owner's canonical base ATA, output is the buffer, amount is `position.tokens`, and the payer meta is read-only;
  - the refund `transfer_checked` and the claim `transfer_checked`: both are from the `has_one` buffer vault, with the quote mint bound to the market.
- `buy` and `sell` use plain `invoke`, with the signing user as payer.
- Tests:
  - cross-market victim (2006, 2009);
  - another market's buffer (2001) or pool (2006);
  - `delegateNotSpendableBySell` (2015, 2006);
  - the delegate's direct `transfer_checked` is blocked by the hook ([src/zpvp_negative.ts](https://github.com/trucee-fun/trucee-litesvm-diff/blob/main/src/zpvp_negative.ts)).

#### 5. Arithmetic overflow

- `overflow-checks = true` in the release profile.
- Every piece of v5 arithmetic is checked or done in u128:
  - `anti_whale_cap` uses u128 and is tested up to u64::MAX;
  - deadlines are only compared, never added;
  - the preset LP sum is u16, with a wrap test.
- The solvency fuzz is green.

#### 6. Anti-whale cap

- The cap applies to `position.tokens` after the buy.
- There is one position per (market, wallet), and `user_base` must be the canonical ATA.
  - Tests in [src/zpvp_negative.ts](https://github.com/trucee-fun/trucee-litesvm-diff/blob/main/src/zpvp_negative.ts): "buy: base account without ImmutableOwner (non-ATA)" and "buy: output into someone else's token account".
- The hook blocks consolidation transfers.
- `sell`, `auto_exit` and `claim_surplus` never check the cap.
  - Test in [src/zpvp_anti_whale.ts](https://github.com/trucee-fun/trucee-litesvm-diff/blob/main/src/zpvp_anti_whale.ts): a whale at the cap exits half and buys back to the cap.
  - Graduation with 6 traders keeps everyone at or below the cap: anti-whale, auto-exit and e2e.

#### 7. Offsets

- Market is byte-identical to `ec652cc` and is pinned by `invariant_tests::market_raw_bytes_keep_the_offsets_tests_and_clients_read`.
- Position is pinned by `position_layout_appends_auto_exit_deadline`: tokens@72, basis@80, deadline@89, 97 bytes.
- LiteSVM reads raw on-chain bytes:
  - e2e checks that total_basis@241 equals Σ basis@80;
  - auto-exit checks that `set_auto_exit` leaves bytes 0..89 unchanged.

#### 8. Error code order

- 6000–6018 are identical to `ec652cc`; 6019–6023 are appended.
- Pinned by `invariant_tests::error_codes_6000_to_6023_keep_their_order`.

#### 9. Events

- All six events have `market` as their first field.
- Tests:
  - [src/zpvp_xstocks.ts](https://github.com/trucee-fun/trucee-litesvm-diff/blob/main/src/zpvp_xstocks.ts): Buy/Sell/Claim `market` equals the market PDA (67/1/8 events).
  - [src/zpvp_auto_exit.ts](https://github.com/trucee-fun/trucee-litesvm-diff/blob/main/src/zpvp_auto_exit.ts): SellEvent, AutoExitEvent and AutoExitSetEvent `market` and `user`.
- FinalizeEvent is unchanged since v4.

## Invariants

- **Instruction names and discriminators:** `init_market`, `buy`, `sell`, `finalize` and `claim_surplus` are unchanged; `auto_exit` and `set_auto_exit` are added. Discriminators are `sha256("global:<name>")`, so they are unchanged.
- **Account order:** the order of InitMarket, Swap, Finalize and ClaimSurplus is unchanged; the diff only touches doc comments. A buy's optional referral is an extra, fourth remaining account, so the change is additive.
- **`unrestricted` feature:** `Cargo.toml` is unchanged.
- **Layouts:** see checklist item 7.
- **Every money path has a negative test:**

  | Money path | Suites with negative tests |
  |------------|----------------------------|
  | `buy` | negative, anti-whale, referral |
  | `sell` | negative, referral, auto-exit `delegateNotSpendableBySell` |
  | `auto_exit` | auto-exit, referral |
  | `claim_surplus` | negative (crank cases) |
  | `finalize` | [negative](https://github.com/trucee-fun/trucee-litesvm-diff/blob/main/src/zpvp_negative.ts) |
  | `init_market` | negative, preset, caps |

- **Solvency fuzz:** green (see Verification).
- **Config immutability:** DBC writes a config only in `create_config` and `create_config_with_transfer_hook` (IDL: no other instruction takes `config` as writable). Checking the preset once, at `init_market`, is therefore enough.

## Verified DBC fields (ConfigWithTransferHook, SDK 1.5.13 IDL)

| Offset | Field | Values | Router rule |
|--------|-------|--------|-------------|
| 233 | `migration_option` | 0 MetDamm (DAMM v1; DBC refuses it, 6082), 1 MetDammV2; any other value 6015 | == 1 (F2) |
| 239–242 | Partner/creator permanently locked and unlocked LP % | u8 percentages | unchanged (preset hardening) |
| 244 | `fixed_token_supply_flag` | 0 dynamic, 1 fixed | == 0 (preset hardening) |
| 245 | `creator_trading_fee_percentage` | 0–100: the creator's share of the partner trading fee | not checked (A5) |
| 246 | `token_update_authority` | 0 CreatorUpdate, 1 Immutable, 2 PartnerUpdate, 3 CreatorUpdateAndMint, 4 PartnerUpdateAndMint | == 1 (F3) |
| 247 | `migration_fee_percentage` | 0–99: share of the graduation quote withheld from the pool | == 0 (F1) |
| 248 | `creator_migration_fee_percentage` | 0–100: creator share of that fee (the partner takes the rest); DBC refuses > 0 when @247 == 0 (6039) | == 0 (F1) |
| 296 / 328 | `locked_vesting.amount_per_period` / `cliff_unlock_amount` | u64 | == 0 (preset hardening) |

## Verification (final source, `a3e66f8` plus this doc)

LiteSVM suites:

| Suite | Router build | Command | Result |
|-------|--------------|---------|--------|
| [negative](https://github.com/trucee-fun/trucee-litesvm-diff/blob/main/src/zpvp_negative.ts) | unrestricted | `zpvp_negative.ts out/scenarios.json 0` | 36 PASS / 0 FAIL |
| [auto-exit](https://github.com/trucee-fun/trucee-litesvm-diff/blob/main/src/zpvp_auto_exit.ts) | unrestricted | `zpvp_auto_exit.ts out/scenarios.json 0` | 65 PASS / 0 FAIL |
| [anti-whale](https://github.com/trucee-fun/trucee-litesvm-diff/blob/main/src/zpvp_anti_whale.ts) | unrestricted | `zpvp_anti_whale.ts out/scenarios.json 0` | 11 PASS / 0 FAIL |
| [referral](https://github.com/trucee-fun/trucee-litesvm-diff/blob/main/src/zpvp_referral.ts) | unrestricted | `zpvp_referral.ts out/scenarios.json 0` | 21 PASS / 0 FAIL |
| [preset](https://github.com/trucee-fun/trucee-litesvm-diff/blob/main/src/zpvp_preset.ts) | unrestricted | `zpvp_preset.ts out/scenarios.json 0` | 60 PASS / 0 FAIL |
| [e2e](https://github.com/trucee-fun/trucee-litesvm-diff/blob/main/src/zpvp_e2e.ts) | unrestricted | `zpvp_e2e.ts out/scenarios.json 0 OUT.json` | 15 PASS / 0 FAIL |
| [xStocks](https://github.com/trucee-fun/trucee-litesvm-diff/blob/main/src/zpvp_xstocks.ts) | capped | `zpvp_xstocks.ts out/scenario_tiny.json 0` | 25 PASS / 0 FAIL |
| [caps](https://github.com/trucee-fun/trucee-litesvm-diff/blob/main/src/zpvp_caps.ts) | capped | `zpvp_caps.ts out/scenarios.json out/scenario_small.json` | 10 PASS / 0 FAIL |

Commands use the [sibling workspace layout](../README.md#source-repositories). Run the LiteSVM suites from `litesvm-diff` with `npx tsx src/<suite>`, followed by the arguments in the table. Fetch the DBC program first with `bash scripts/fetch-dbc.sh`; it is not redistributed.

The unrestricted router was built with `cargo build-sbf --manifest-path programs/zpvp_router/Cargo.toml --features unrestricted --sbf-out-dir <scratch>` and loaded with `ROUTER_SO=<scratch>/zpvp_router.so`. The capped router is `target/deploy/zpvp_router.so` built in the `zpvp` workspace folder.

Other checks:

- `cd zpvp && cargo build-sbf && cargo test -p zpvp_router`: 48 passed, 0 failed.
- `cd sim && python3 -m unittest test_sim`: 8 tests OK.
- `cd sim && python3 run_fuzz.py --random 2000 --adversarial 300 --seed 90000 --dust-per-buy 16 --haircut 2`: "runs with buffer < 0 at any step : 0" in all 12 sections (avg/fifo/lifo × random/adversarial × to-graduation/full-unwind). The worst min buffer is 0 lamports and identity drift is 0.

## Follow-ups

- **Devnet configurations:** every v5 devnet config must be DAMM v2, with migration fee 0/0 and an Immutable token authority. The SDK launch preset and the LiteSVM fixture already comply. Markets opened before v5 are not re-checked, because the preset is only checked at `init_market`.
- **App/SDK (A2):** revoke the market delegate when the deadline is cleared, after a full exit, and at claim.
- **Router + [src/errors.ts](https://github.com/trucee-fun/trucee-sdk/blob/main/src/errors.ts) (A6):** optionally widen the 6023 message to name the migration-fee, DAMM v2 and token-authority rules.
- **Migration fee and migration option fixes:** done in `afb3b3a`.
