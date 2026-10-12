---
description: >-
  Reference for integrators: program IDs per cluster, every router and hook
  instruction with its accounts and arguments, events, the Market and Position
  byte layouts, and the error codes.
---

# Programs reference

This page is for anyone who builds transactions for the two Trucee programs or reads their accounts:

* `zpvp_router`, the cost-basis router. It records the cost basis of every buy, refunds exits at cost before graduation from a per-market buffer and splits the buffer surplus after graduation.
* `zpvp_hook`, the Token-2022 transfer hook. Before graduation it lets the base token move only inside a router instruction.

It documents the current router on mainnet and devnet: v5 plus the 1% launch fee cap. v5 adds Auto-Exit, the Anti-Whale cap, Native Referral and the Zero-PvP preset checks; those features are unchanged. For the reasoning behind the mechanism, read [How it works](../how-it-works.md). For the invariants, tests and known limits, read [Security](../security.md).

Every number on this page names the file, test or command it comes from (see [Sources](#sources)). Source links point to the published repositories. Commands use sibling workspace folders (see the [Introduction](../README.md#source-repositories)). If this page and the code disagree, trust the code.

{% hint style="warning" %}
**Status as of 2026-10-12:** the programs are not independently reviewed. They are deployed on mainnet (since 2026-10-12) and devnet, with the same program IDs. Both run the default build of [trucee-programs main](https://github.com/trucee-fun/trucee-programs) (devnet upgraded in slot 510258390), so everything marked **v5** on this page and the 1% fee cap are live on both clusters.
{% endhint %}

{% hint style="info" %}
**Current deployments.** The default router build extends v5 with the 1% static-fee cap (`FeeTooHigh`, 6024). Market remains 274 bytes. On mainnet, the router is the reproducible `solana-verify` build: 439,904 bytes, sha256 `370c0756f948f95ade4c15170897791c9e52c3c2a6d82d8986c9e51dfc233030`, deployed in slot 456095594 with signature `5tFoym3ER1A6EMA2Z93oHX1XM9o68EeR62Pzkm96znoXEuA7u4nkfPRxhgAmEUKUP6qvpkw8ZBRMpHXnNFWqJX5`. The mainnet hook is a `solana-verify` build too: sha256 `1dbde487…`, deployed in slot 456095540. On devnet, the router is 439,912 bytes, sha256 `38b88ec9db9bdec6d3810247d8c54220651fcbf1372585dbd20838594b63f041`, upgraded in slot 510258390 with signature `2x4JHAYtDbvijNiHzv5rDvXjQVPc7hkbW2YbbnUxMGmuUSBTMbUFdtmey9YCWsUqCBGDPsbNMm3qE5N71V9bhQ2y`. The devnet hook is unchanged. Devnet bytes differ from mainnet bytes because they are different builds of the same source.
{% endhint %}

{% hint style="info" %}
`@trucee/sdk` builds every instruction on this page and decodes every account, event and error. The [Quickstart](quickstart.md) shows how to use it. The SDK name of each item is listed next to it.
{% endhint %}

## Program IDs

| Program | Program ID | Devnet | Mainnet-beta |
|---|---|---|---|
| `zpvp_router` | `D4sk6wwELD6cmd7tv6hE4hkxQP8SF8tjdegYym8iWNNb` | Deployed: default build, v5 plus the 1% fee cap (sha256 `38b88ec9…`, 439,912 bytes), last deployed in slot 510258390 | Deployed on 2026-10-12: the `solana-verify` build (sha256 `370c0756…`, 439,904 bytes), slot 456095594 |
| `zpvp_hook` | `CUNNV1MqVB53N4jWn91uVFXm1dBSyaynR6iBCbufJWMS` | Deployed, unchanged since [db71df2](https://github.com/trucee-fun/trucee-programs/commit/db71df2) (sha256 `1525c836…`) | Deployed on 2026-10-12: the `solana-verify` build (sha256 `1dbde487…`, 210,536 bytes), slot 456095540 |
| Meteora DBC | `dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN` | Meteora's program | Meteora's program |

* **One ID per program on every cluster.** The IDs come from `declare_id!` in each program's [programs/zpvp_router/src/lib.rs](https://github.com/trucee-fun/trucee-programs/blob/main/programs/zpvp_router/src/lib.rs). The SDK exports them as `ROUTER_PROGRAM_ID`, `HOOK_PROGRAM_ID` and `DBC_PROGRAM_ID`, and `getClusterConfig()` returns the same three IDs for `devnet`, `mainnet-beta` and `localnet` ([src/constants.ts](https://github.com/trucee-fun/trucee-sdk/blob/main/src/constants.ts)).
* **The two programs pin each other.** The hook accepts only `D4sk6w…` as the router (`ROUTER_ID` in [programs/zpvp_hook/src/lib.rs](https://github.com/trucee-fun/trucee-programs/blob/main/programs/zpvp_hook/src/lib.rs)). The router opens markets only for DBC configs whose transfer hook is `CUNNV1…` (`ZPVP_HOOK_ID` in [programs/zpvp_router/src/lib.rs](https://github.com/trucee-fun/trucee-programs/blob/main/programs/zpvp_router/src/lib.rs)).
* **Mainnet uses the devnet program IDs.** Both programs were deployed to mainnet on 2026-10-12 under the same IDs as on devnet.
* The upgrade authority and the deploy transactions of both clusters are listed under [Security → Upgrade authority](../security.md#upgrade-authority).

### Quote mints per cluster

The default (capped) router build accepts only these quote mints. Each has a cap on the config's graduation threshold, `migration_quote_threshold` (`QUOTE_CAPS` and `check_launch_caps` in [programs/zpvp_router/src/lib.rs](https://github.com/trucee-fun/trucee-programs/blob/main/programs/zpvp_router/src/lib.rs)). The `unrestricted` Cargo feature turns the check off for test builds.

| Quote | Mint | Decimals | Token program | Max graduation threshold (raw) | SDK clusters |
|---|---|---|---|---|---|
| wSOL | `So11111111111111111111111111111111111111112` | 9 | SPL Token | 10,000,000,000 (10 SOL) | `devnet`, `mainnet-beta`, `localnet` |
| TSLAx | `XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB` | 8 | Token-2022 | 500,000,000 (5 shares) | `mainnet-beta`, `localnet` |
| NVDAx | `Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh` | 8 | Token-2022 | 1,000,000,000 (10 shares) | `mainnet-beta`, `localnet` |

Decimals, token programs and the cluster lists are from [src/constants.ts](https://github.com/trucee-fun/trucee-sdk/blob/main/src/constants.ts). Devnet has no xStock mints, so the SDK's devnet config lists SOL only.

## Program-derived addresses

| Account | Program | Seeds | SDK |
|---|---|---|---|
| Market | router | `["market", pool]` | `findMarketPda(pool)` |
| Buffer vault: the market's quote token account, owned by the market PDA | router | `["buffer", market]` | `findBufferPda(market)` |
| Position | router | `["position", market, owner]` | `findPositionPda(market, owner)` |
| Extra-account-metas | hook | `["extra-account-metas", base_mint]` | `findExtraAccountMetasPda(baseMint)` |

There is one market per DBC pool and one position per (market, wallet). Seeds: `MARKET_SEED`, `BUFFER_SEED`, `POSITION_SEED` and the `seeds` constraints in [programs/zpvp_router/src/lib.rs](https://github.com/trucee-fun/trucee-programs/blob/main/programs/zpvp_router/src/lib.rs), `EXTRA_ACCOUNT_METAS_SEED` in [programs/zpvp_hook/src/lib.rs](https://github.com/trucee-fun/trucee-programs/blob/main/programs/zpvp_hook/src/lib.rs), and [src/pda.ts](https://github.com/trucee-fun/trucee-sdk/blob/main/src/pda.ts).

## Lifecycle at a glance

1. The creator creates a DBC pool from a transfer-hook config whose hook is `zpvp_hook` (DBC instructions, not Trucee's).
2. Anyone writes the hook's extra-account list for the base mint: [`initialize_extra_account_meta_list`](#hook-instructions).
3. Anyone opens the router market: [`init_market`](#init_market).
4. Before graduation, traders [`buy`](#buy) and [`sell`](#sell) through the router. Owners may set an Auto-Exit deadline with [`set_auto_exit`](#set_auto_exit-v5), and anyone may run [`auto_exit`](#auto_exit-v5) once it is due.
5. DBC revokes the hook on the swap that completes the curve.
6. Anyone calls [`finalize`](#finalize) once, then [`claim_surplus`](#claim_surplus) for each position.
7. DBC's own migration instruction moves the liquidity to DAMM v2. It does not depend on step 6.

## Router instructions

Instruction data is the 8-byte Anchor discriminator, `sha256("global:<name>")[..8]`, followed by the arguments in Borsh encoding (little-endian). The discriminators below match `DISCRIMINATORS` in [src/instructions.ts](https://github.com/trucee-fun/trucee-sdk/blob/main/src/instructions.ts).

| Instruction | Discriminator | Arguments | Signer | Who may call | SDK builder |
|---|---|---|---|---|---|
| `init_market` | `[33, 253, 15, 116, 89, 25, 127, 236]` | none | `payer` | Anyone | `initMarketInstruction` |
| `buy` | `[102, 6, 61, 18, 1, 218, 235, 234]` | `amount_in: u64`, `min_out: u64` | `user` | The buyer | `buyInstructions` |
| `sell` | `[51, 230, 133, 164, 1, 127, 131, 173]` | `tokens: u64` | `user` | The position owner | `sellInstructions` |
| `finalize` | `[171, 61, 218, 56, 127, 115, 12, 217]` | none | none (any fee payer) | Anyone, after the curve completes | `finalizeInstruction` |
| `claim_surplus` | `[195, 35, 205, 205, 177, 146, 141, 62]` | none | `cranker` | Anyone, for any position | `claimSurplusInstruction` |
| `set_auto_exit` (v5) | `[60, 166, 18, 156, 35, 166, 156, 226]` | `deadline: i64` | `owner` | The position owner | `setAutoExitInstructions` |
| `auto_exit` (v5) | `[69, 201, 207, 131, 57, 141, 243, 167]` | none | `cranker` | Anyone, once the deadline is due | `autoExitInstruction` |

In the account tables below, accounts are in instruction order, W means writable and S means signer. A wrong account fails an Anchor constraint before the instruction runs and returns an Anchor framework error (2000–3999), for example 2006 `ConstraintSeeds` for another wallet's position. See [Error codes](#error-codes).

### init_market

Opens the router market for a DBC transfer-hook pool and creates its buffer vault. It is permissionless: every Market field is read from the pool and the config, so any caller opens the same market. Emits no event.

| # | Account | W | S | Notes |
|---|---|---|---|---|
| 0 | `payer` | W | S | Pays the rent of the market and the buffer vault |
| 1 | `pool` | | | DBC `TransferHookPool` |
| 2 | `config` | | | The DBC `ConfigWithTransferHook` the pool was created from |
| 3 | `quote_mint` | | | Must be the config's quote mint |
| 4 | `market` | W | | Created: PDA `["market", pool]`, 274 bytes |
| 5 | `buffer_vault` | W | | Created: PDA `["buffer", market]`, a token account of `quote_mint` whose authority is `market` |
| 6 | `token_quote_program` | | | The quote mint's token program |
| 7 | `system_program` | | | |

Config and account checks (`init_market`, `dbc::read_pool`, `dbc::read_config`, `check_launch_caps`):

1. The pool is owned by DBC (6000), is at least 416 bytes long and has the `TransferHookPool` discriminator (6001).
2. The pool's config is `config` (6004).
3. The config is owned by DBC (6000), is exactly 1,128 bytes long with the `ConfigWithTransferHook` discriminator (6002), and its transfer-hook program is `zpvp_hook` (6013).
4. The fee is one the refund math is built and tested for: a static base fee (linear scheduler with zero periods), no dynamic fee, and fees collected in the quote token (6014). The current source also rejects a static fee above 1% (100 bps, fee numerator 10,000,000) with `FeeTooHigh` (6024).
5. **v5:** the config follows the [Zero-PvP preset](#zero-pvp-preset-v5) (6023).
6. `quote_mint` is the config's quote mint (6005).
7. Default build only: the quote mint is in `QUOTE_CAPS` (6017), and the config's `migration_quote_threshold` is at most that mint's cap (6018).

The preset check (step 5) runs before the caps (step 7), so a config that breaks both returns 6023 ([Router v5 review](../security/router-v5-review.md), A4). Treat 6013, 6014, 6017, 6018, 6023 and 6024 alike as "config not allowed".

### Swap accounts (buy and sell)

`buy` and `sell` share one account list, the `Swap` struct in [programs/zpvp_router/src/lib.rs](https://github.com/trucee-fun/trucee-programs/blob/main/programs/zpvp_router/src/lib.rs). The SDK builds it in `routerSwapInstruction` ([src/instructions.ts](https://github.com/trucee-fun/trucee-sdk/blob/main/src/instructions.ts)).

| # | Account | W | S | Notes |
|---|---|---|---|---|
| 0 | `user` | W | S | Buyer or seller. Pays the position's rent on the first buy |
| 1 | `market` | W | | PDA `["market", pool]`, bound to the pool, config, mints, vaults and buffer below |
| 2 | `position` | W | | PDA `["position", market, user]`, created on first use (`init_if_needed`) |
| 3 | `user_quote` | W | | A token account of the quote mint owned by `user`. A buy pays from it and a sell's refund lands in it. The SDK uses the user's ATA |
| 4 | `user_base` | W | | The user's canonical associated token account for the base mint (Token-2022). Any other account is rejected |
| 5 | `buffer_vault` | W | | The market's buffer vault |
| 6 | `pool_authority` | | | DBC pool authority (SDK: `deriveDbcPoolAuthority()` from `@meteora-ag/dynamic-bonding-curve-sdk`) |
| 7 | `config` | | | DBC config |
| 8 | `pool` | W | | DBC pool |
| 9 | `base_vault` | W | | DBC base vault |
| 10 | `quote_vault` | W | | DBC quote vault |
| 11 | `base_mint` | W | | Base mint (Token-2022 with the `zpvp_hook` transfer hook) |
| 12 | `quote_mint` | | | Quote mint |
| 13 | `token_base_program` | | | Token-2022 |
| 14 | `token_quote_program` | | | SPL Token for wSOL, Token-2022 for xStocks |
| 15 | `event_authority` | | | DBC event authority (SDK: `deriveDbcEventAuthority()`) |
| 16 | `dbc_program` | | | Must be `dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN` |
| 17 | `system_program` | | | |

Remaining accounts follow, in this order:

| # | Account | W | Notes |
|---|---|---|---|
| 18 | Extra-account-metas PDA of the base mint (hook program) | | Required |
| 19 | Instructions sysvar `Sysvar1nstructions1111111111111111111111111` | | Required |
| 20 | `zpvp_hook` program | | Required |
| 21 | Referrer's quote token account | W | **v5, `buy` only, optional** |

`sell` takes exactly the three hook accounts. Any other count returns 6003 `BadHookAccounts` (`dbc::split_buy_remaining`, `dbc::swap2_instruction`).

### buy

Buys on the DBC curve through the router and records the cost basis.

| Argument | Type | Meaning |
|---|---|---|
| `amount_in` | `u64` | Quote to spend, in raw units. The SDK requires at least 1 |
| `min_out` | `u64` | Minimum base tokens out, passed to DBC as the slippage limit |

Accounts: [Swap accounts](#swap-accounts-buy-and-sell), plus the optional referral account.

What it does (`buy` in [programs/zpvp_router/src/lib.rs](https://github.com/trucee-fun/trucee-programs/blob/main/programs/zpvp_router/src/lib.rs)):

1. Splits the remaining accounts into the three hook accounts and the optional referral (6003 on a wrong count or an invalid referral, see [Native Referral](#native-referral-v5)).
2. Calls DBC `swap2_with_transfer_hook` in partial-fill mode with `amount_in` and `min_out`. Quote moves from `user_quote` and base tokens land in `user_base`.
3. Measures `tokens_out`, the growth of `user_base`, and `net_into_curve`, the growth of the pool's quote reserve. `tokens_out` must be above zero (6006).
4. Adds `net_into_curve − 16` to the basis, floored at 0 (`math::basis_for_buy`). It adds the same amount to `market.total_basis`, and `tokens_out` to `position.tokens`.
5. **v5:** checks that `position.tokens` is at most ⌊`swap_base_amount` × 2,000 ÷ 10,000⌋, the [Anti-Whale cap](#constants-and-formulas) (6022).
6. Emits `BuyEvent`.

The SDK's `buyInstructions` also creates the user's quote and base ATAs (idempotent), wraps exactly `amount_in` lamports when the quote is wSOL, and, with a referrer, creates the referrer's quote ATA.

### Native Referral (v5)

A buy may pass a referrer's quote token account as the 4th remaining account. The router hands it to DBC as `referral_token_account`, and DBC pays the referral cut out of its **protocol** fee. The buyer's spend, basis and later refund are the same with or without a referrer ( [src/zpvp_referral.ts](https://github.com/trucee-fun/trucee-litesvm-diff/blob/main/src/zpvp_referral.ts), summarized in [Router v5 review](../security/router-v5-review.md) A1).

The router returns 6003 `BadHookAccounts` unless the referral account (`dbc::check_referral`):

* is writable;
* is owned by the quote token program;
* is an initialized token account of the quote mint;
* is neither the pool's quote vault nor the market's buffer vault.

The router allows a self-referral ([Router v5 review](../security/router-v5-review.md), A1). The SDK ignores a `referrer` equal to the buyer (`optionalReferrer` in [src/instructions.ts](https://github.com/trucee-fun/trucee-sdk/blob/main/src/instructions.ts)).

### sell

Exits `tokens` of the caller's own position at cost.

| Argument | Type | Meaning |
|---|---|---|
| `tokens` | `u64` | Base tokens to exit, raw units. Must be above zero and at most `position.tokens` |

Accounts: [Swap accounts](#swap-accounts-buy-and-sell) with exactly three remaining accounts.

What it does (`sell` and `exit_at_cost`):

1. `basis_part` = the position's whole basis for a full exit, else ⌊`basis` × `tokens` ÷ `position.tokens`⌋ (`math::basis_for_exit`). A zero or too-large amount returns 6007.
2. Sells `tokens` into the curve with DBC `swap2_with_transfer_hook` in exact-in mode with a minimum output of 0. The proceeds go to the **buffer vault**, not to the user.
3. Refund = `basis_part − ⌈basis_part × fee_numerator ÷ 1,000,000,000⌉ − 2`, floored at 0 (`math::refund_for`). The buffer must hold at least the refund (6015). The market PDA then transfers the refund from the buffer to `user_quote`.
4. Subtracts `basis_part` from `market.total_basis` and `position.basis`, and `tokens` from `position.tokens`. An exit that empties the position also clears its Auto-Exit deadline.
5. Emits `SellEvent`.

The refund depends only on the basis and the fee, not on the swap output, so `sell` takes no minimum-output argument. A position emptied by `sell` stays open. After the curve completes, DBC rejects the swap, so `sell` fails: "after graduation: selling into the curve is rejected (PoolIsCompleted)" in [src/zpvp_e2e.ts](https://github.com/trucee-fun/trucee-litesvm-diff/blob/main/src/zpvp_e2e.ts).

The SDK's `sellInstructions` creates the user's quote ATA first (idempotent) and, with `unwrapSol`, closes it after the sell to unwrap wSOL.

### finalize

Freezes the surplus after the curve completes. Permissionless, once per market.

| # | Account | W | S | Notes |
|---|---|---|---|---|
| 0 | `market` | W | | |
| 1 | `pool` | | | The market's DBC pool |
| 2 | `buffer_vault` | | | The market's buffer vault |

Checks: the curve is complete, meaning the pool's `migration_progress` byte (pool offset 308) is not 0 (6009), and the market is not finalized yet (6010). It then sets `finalized`, stores `surplus_snapshot` = the buffer balance and `basis_snapshot` = `total_basis`, and emits `FinalizeEvent`.

### claim_surplus

Pays one position its share of the surplus and closes the position. Anyone may call it for any position: the share always goes to the owner's canonical quote ATA and the position's rent goes back to the owner.

| # | Account | W | S | Notes |
|---|---|---|---|---|
| 0 | `cranker` | | S | Anyone. Pays only the transaction fee |
| 1 | `owner` | W | | The position owner. Receives the position's rent |
| 2 | `market` | W | | |
| 3 | `position` | W | | PDA `["position", market, owner]`. Closed to `owner` |
| 4 | `owner_quote` | W | | The owner's canonical quote ATA. It must already exist |
| 5 | `buffer_vault` | W | | The market's buffer vault |
| 6 | `quote_mint` | | | |
| 7 | `token_quote_program` | | | |

The account constraints bind `position` to `owner` (6012 `NotPositionOwner`, or an Anchor seeds error). The instruction then checks that the market is finalized (6011). Share = ⌊`surplus_snapshot` × `position.basis` ÷ `basis_snapshot`⌋, or 0 when `basis_snapshot` is 0 (`math::surplus_share`). The share is transferred when above zero. `surplus_claimed` grows by the share and may never exceed `surplus_snapshot` (6016). Emits `ClaimEvent`. Closing the position makes a second claim impossible.

### set_auto_exit (v5)

Stores or clears the position's Auto-Exit deadline. Owner only.

| Argument | Type | Meaning |
|---|---|---|
| `deadline` | `i64` | Unix time in seconds from which anyone may run `auto_exit`. `0` disables Auto-Exit |

| # | Account | W | S | Notes |
|---|---|---|---|---|
| 0 | `owner` | | S | Position owner |
| 1 | `market` | | | PDA `["market", pool]` |
| 2 | `position` | W | | PDA `["position", market, owner]` |

Checks, in order: the market is not finalized (6010), and the deadline is 0 or strictly after the current clock (6019). Writes `position.auto_exit_deadline` and emits `AutoExitSetEvent`.

`auto_exit` also needs the market PDA to be the delegate of the owner's base ATA for at least `position.tokens`. The SDK's `setAutoExitInstructions` bundles that approval: with a non-zero deadline it approves the market PDA for `u64::MAX` and then calls `set_auto_exit`. With deadline `0n` it calls `set_auto_exit(0)` and then revokes the delegate. The router itself never approves or revokes.

### auto_exit (v5)

Exits a whole position at cost once its deadline has passed, while the curve is still live. Anyone may call it. The market PDA sells the owner's tokens as their token delegate, and the refund always lands in the owner's canonical quote ATA, so the caller gains nothing.

| # | Account | W | S | Notes |
|---|---|---|---|---|
| 0 | `cranker` | | S | Anyone. Pays only the transaction fee |
| 1 | `owner` | | | Position owner, bound by the position seeds |
| 2 | `market` | W | | PDA `["market", pool]` |
| 3 | `position` | W | | PDA `["position", market, owner]` |
| 4 | `owner_quote` | W | | The owner's canonical quote ATA, where the refund lands. It must already exist |
| 5 | `owner_base` | W | | The owner's canonical base ATA. The market PDA must be its delegate for at least `position.tokens` |
| 6 | `buffer_vault` | W | | |
| 7–18 | `pool_authority` … `system_program` | | | Same twelve accounts, in the same order, as Swap accounts 6–17 |

Remaining accounts: exactly the three hook accounts, in the order shown for [Swap accounts](#swap-accounts-buy-and-sell).

Checks, in order: the position holds tokens (6007), the deadline is set and has passed (`deadline ≠ 0` and `now ≥ deadline`, else 6020), and the curve is not complete (6021). It then runs the same exit at cost as `sell` for all of `position.tokens`, with the market PDA as DBC's payer. That clears the deadline. Emits `SellEvent`, then `AutoExitEvent`.

A delegate approval below `position.tokens`, or a revoked one, makes Token-2022 reject the swap and nothing moves ([Router v5 review](../security/router-v5-review.md), A3).

## Hook instructions

`zpvp_hook` has one instruction for clients and one that only Token-2022 calls.

| Instruction | Discriminator | Arguments | Called by | SDK builder |
|---|---|---|---|---|
| `initialize_extra_account_meta_list` | `[92, 197, 174, 197, 41, 124, 19, 3]` | none | Anyone (permissionless) | `initExtraAccountMetasInstruction` |
| `transfer_hook` | `[105, 37, 101, 197, 75, 251, 102, 26]`, the transfer-hook interface's `Execute`: `sha256("spl-transfer-hook-interface:execute")[..8]` | `amount: u64` (not read) | Token-2022, on every transfer of the base mint | none |

`initialize_extra_account_meta_list` accounts:

| # | Account | W | S | Notes |
|---|---|---|---|---|
| 0 | `payer` | W | S | Pays the rent |
| 1 | `extra_account_meta_list` | W | | Created: PDA `["extra-account-metas", mint]` under the hook, 51 bytes |
| 2 | `mint` | | | The base mint. Used only as a seed |
| 3 | `system_program` | | | |

`transfer_hook` accounts, in the order fixed by the transfer-hook interface: source token account, mint, destination token account, source owner or delegate, extra-account-metas PDA, instructions sysvar.

### Hook behaviour

* **The rule.** `transfer_hook` loads the currently executing top-level instruction from the instructions sysvar (`get_instruction_relative(0, …)`). It requires that instruction's program to be the router; otherwise it fails with `TransferNotViaRouter` (hook error 6000). It does not read the amount, source, destination or owner.
* **What passes.** A transfer inside a router instruction (router → DBC → Token-2022 → hook) passes, including the `auto_exit` sale that the market PDA signs as delegate.
* **What fails.** A direct DBC swap, a wallet-to-wallet transfer, an aggregator route, and a transfer placed as a separate top-level instruction next to a router buy all fail ([src/zpvp_e2e.ts](https://github.com/trucee-fun/trucee-litesvm-diff/blob/main/src/zpvp_e2e.ts), [src/zpvp_negative.ts](https://github.com/trucee-fun/trucee-litesvm-diff/blob/main/src/zpvp_negative.ts); see [Security → Invariants](../security.md#invariants)).
* **Graduation.** DBC revokes the hook in the swap that completes the curve, after which the token is a plain Token-2022 token ([programs/zpvp_hook/src/lib.rs](https://github.com/trucee-fun/trucee-programs/blob/main/programs/zpvp_hook/src/lib.rs) module doc; [src/zpvp_e2e.ts](https://github.com/trucee-fun/trucee-litesvm-diff/blob/main/src/zpvp_e2e.ts) checks "DBC revoked the transfer hook at graduation" and "after graduation: plain wallet transfer works (token is free)").
* **Extra accounts.** The extra-account list holds one static account, the instructions sysvar. So every transfer of the base mint needs three extra accounts: the extra-account-metas PDA, the instructions sysvar and the hook program. The router passes these three to DBC as remaining accounts.

Extra-account-metas layout (51 bytes, `EXTRA_ACCOUNT_METAS_LEN` and `initialize_extra_account_meta_list` in [programs/zpvp_hook/src/lib.rs](https://github.com/trucee-fun/trucee-programs/blob/main/programs/zpvp_hook/src/lib.rs)):

| Offset | Size | Content |
|---|---|---|
| 0 | 8 | `Execute` discriminator `[105, 37, 101, 197, 75, 251, 102, 26]` |
| 8 | 4 | `u32` length of the rest: 39 |
| 12 | 4 | `u32` number of extra accounts: 1 |
| 16 | 1 | `0`: a literal address |
| 17 | 32 | Instructions sysvar address |
| 49 | 1 | `is_signer` = 0 |
| 50 | 1 | `is_writable` = 0 |

## How the router calls DBC

`buy`, `sell` and `auto_exit` call DBC's `swap2_with_transfer_hook`, discriminator `[183, 93, 153, 40, 24, 230, 194, 151]` (`dbc::swap2_instruction`). The instruction data is `amount_0: u64 | amount_1: u64 | swap_mode: u8`, followed by one `TransferHookBase` slice that holds the three hook accounts.

| Caller | `amount_0` | `amount_1` | `swap_mode` | Input → output | DBC payer |
|---|---|---|---|---|---|
| `buy` | `amount_in` | `min_out` | 1, partial fill | `user_quote` → `user_base` | `user` |
| `sell` | `tokens` | 0 | 0, exact in | `user_base` → `buffer_vault` | `user` |
| `auto_exit` | `position.tokens` | 0 | 0, exact in | `owner_base` → `buffer_vault` | market PDA, signed with the market seeds |

DBC's referral account is at index 12 of the swap accounts. Without a referral, the router passes the DBC program ID there, which DBC's Anchor code reads as "no referral". With one, it passes the referral account as writable (test `swap2_passes_the_referral_writable_in_place_of_the_none_placeholder` in [programs/zpvp_router/src/dbc.rs](https://github.com/trucee-fun/trucee-programs/blob/main/programs/zpvp_router/src/dbc.rs)).

### DBC fields the router reads

All offsets are byte offsets from the start of the account data, discriminator included ([programs/zpvp_router/src/dbc.rs](https://github.com/trucee-fun/trucee-programs/blob/main/programs/zpvp_router/src/dbc.rs), [programs/zpvp_router/src/preset.rs](https://github.com/trucee-fun/trucee-programs/blob/main/programs/zpvp_router/src/preset.rs)).

| Account | Offset | Field | Used for |
|---|---|---|---|
| Pool | 0 | Discriminator `[237, 219, 184, 23, 42, 189, 169, 35]`, at least 416 bytes | `TransferHookPool` check (6001) |
| Pool | 72 / 136 / 168 / 200 | `config` / `base_mint` / `base_vault` / `quote_vault` | Copied into the Market |
| Pool | 240 | `quote_reserve` (`u64`) | `net_into_curve` on a buy |
| Pool | 308 | `migration_progress` (`u8`): 0 while the curve is live | Curve complete (`finalize`, `auto_exit`) |
| Config | 0 | Discriminator `[40, 220, 194, 251, 41, 199, 123, 253]`, exactly 1,128 bytes | `ConfigWithTransferHook` check (6002) |
| Config | 8 | `quote_mint` | Market quote mint (6005) |
| Config | 104 | Cliff fee numerator (`u64`) | `Market.fee_numerator` |
| Config | 128 / 130 | Base fee first factor (`u16`, number of periods) / base fee mode | Must be 0 / 0: static fee (6014) |
| Config | 136 | Dynamic fee initialized | Must be 0 (6014) |
| Config | 232 | `collect_fee_mode` | Must be 0, fees in the quote token (6014) |
| Config | 256 | `swap_base_amount` (`u64`) | Anti-Whale cap |
| Config | 264 | `migration_quote_threshold` (`u64`) | Launch cap (6018) |
| Config | 1048 | Transfer hook program | Must be `zpvp_hook` (6013) |

### Zero-PvP preset (v5)

`init_market` rejects a config with 6023 `PresetNotAllowed` unless every rule below holds (`preset::is_zero_pvp_preset`). Each field is `u8` unless noted. Offsets are checked against real DBC-written config bytes in the [programs/zpvp_router/src/preset.rs](https://github.com/trucee-fun/trucee-programs/blob/main/programs/zpvp_router/src/preset.rs) unit tests and against the DBC SDK 1.5.13 IDL ([Router v5 review](../security/router-v5-review.md), "Verified DBC fields").

| Offset | DBC field | Rule | What it rules out |
|---|---|---|---|
| 244 | `fixed_token_supply_flag` | `== 0` (dynamic supply) | Unsold supply sent to a `leftover_receiver` |
| 296 | `locked_vesting.amount_per_period` (`u64`) | `== 0` | A creator token allocation |
| 328 | `locked_vesting.cliff_unlock_amount` (`u64`) | `== 0` | A creator token allocation |
| 240 | `partner_liquidity_percentage` | `== 0` | Unlocked partner LP |
| 242 | `creator_liquidity_percentage` | `== 0` | Unlocked creator LP |
| 239 + 241 | `partner_permanent_locked_liquidity_percentage` + `creator_permanent_locked_liquidity_percentage` | Sum `== 100`, computed as `u16` | LP vesting that unlocks LP after migration |
| 247 | `migration_fee_percentage` | `== 0` | A cut of the graduation quote withheld from the DAMM v2 pool |
| 248 | `creator_migration_fee_percentage` | `== 0` | The creator's share of that cut |
| 233 | `migration_option` | `== 1` (DAMM v2) | Any other migration target |
| 246 | `token_update_authority` | `== 1` (Immutable) | A creator or partner who keeps the mint authority (options 3, 4) or the metadata authority (options 0, 2) |

The 6023 message still reads "(creator allocation, fixed supply or unlocked LP)", but it covers every rule above ([Router v5 review](../security/router-v5-review.md), A6). DBC never rewrites a config after it is created, so the router checks the preset only once, in `init_market`. Markets opened by the pre-v5 router were not checked against it ([Router v5 review](../security/router-v5-review.md), "Config immutability" and devnet configuration follow-up).

## Events

The router emits Anchor events with `emit!`. Each one is logged as a `Program data: <base64>` line. The payload is the 8-byte discriminator `sha256("event:<Name>")[..8]`, followed by the fields in Borsh encoding (little-endian, no padding). Every event starts with `market` ([Router v5 review](../security/router-v5-review.md), item 9).

`parseRouterEvents(logs)` in [src/events.ts](https://github.com/trucee-fun/trucee-sdk/blob/main/src/events.ts) decodes them in log order. It reads only `Program data:` lines logged while the router is the innermost program, so data logged by DBC, Token-2022 or the hook is never mistaken for a router event. It skips unknown discriminators and payloads of the wrong length.

| Event | Emitted by | Discriminator | Size (bytes) |
|---|---|---|---|
| `BuyEvent` | `buy` | `[103, 244, 82, 31, 44, 245, 119, 119]` | 96 |
| `SellEvent` | `sell`, `auto_exit` | `[62, 47, 55, 10, 165, 3, 220, 42]` | 104 |
| `FinalizeEvent` | `finalize` | `[115, 140, 131, 4, 181, 52, 170, 148]` | 56 |
| `ClaimEvent` | `claim_surplus` | `[93, 15, 70, 170, 48, 140, 212, 219]` | 88 |
| `AutoExitSetEvent` (v5) | `set_auto_exit` | `[57, 162, 173, 84, 134, 215, 83, 159]` | 80 |
| `AutoExitEvent` (v5) | `auto_exit`, right after its `SellEvent` | `[53, 28, 54, 192, 105, 98, 182, 95]` | 104 |

`init_market` emits no event. Field offsets below are from the start of the decoded payload, discriminator included.

**`BuyEvent`**

| Offset | Field | Type | Value |
|---|---|---|---|
| 8 | `market` | Pubkey | Market PDA |
| 40 | `user` | Pubkey | Buyer, the position owner |
| 72 | `tokens_out` | u64 | Base tokens received in this buy |
| 80 | `net_into_curve` | u64 | Growth of the pool's quote reserve in this buy |
| 88 | `basis` | u64 | The position's **total** basis after the buy, not the basis added |

**`SellEvent`**

| Offset | Field | Type | Value |
|---|---|---|---|
| 8 | `market` | Pubkey | Market PDA |
| 40 | `user` | Pubkey | Position owner (also on `auto_exit`) |
| 72 | `tokens` | u64 | Base tokens exited |
| 80 | `basis_part` | u64 | Basis removed from the position |
| 88 | `proceeds` | u64 | Quote that the curve sale added to the buffer |
| 96 | `refund` | u64 | Quote paid to the owner from the buffer |

**`FinalizeEvent`**

| Offset | Field | Type | Value |
|---|---|---|---|
| 8 | `market` | Pubkey | Market PDA |
| 40 | `surplus` | u64 | `surplus_snapshot`: the buffer balance at finalize |
| 48 | `total_basis` | u64 | `basis_snapshot`: the open basis at finalize |

**`ClaimEvent`**

| Offset | Field | Type | Value |
|---|---|---|---|
| 8 | `market` | Pubkey | Market PDA |
| 40 | `user` | Pubkey | Position owner |
| 72 | `basis` | u64 | The position's basis at the claim |
| 80 | `share` | u64 | Quote paid to the owner |

**`AutoExitSetEvent` (v5)**

| Offset | Field | Type | Value |
|---|---|---|---|
| 8 | `market` | Pubkey | Market PDA |
| 40 | `user` | Pubkey | Position owner |
| 72 | `deadline` | i64 | New deadline, 0 = cleared |

**`AutoExitEvent` (v5)**

| Offset | Field | Type | Value |
|---|---|---|---|
| 8 | `market` | Pubkey | Market PDA |
| 40 | `user` | Pubkey | Position owner |
| 72 | `cranker` | Pubkey | Signer who ran `auto_exit` |

Sources: the `#[event]` structs and `emit!` calls in [programs/zpvp_router/src/lib.rs](https://github.com/trucee-fun/trucee-programs/blob/main/programs/zpvp_router/src/lib.rs), and `EVENT_DISCRIMINATORS` and `EVENT_LAYOUTS` in [src/events.ts](https://github.com/trucee-fun/trucee-sdk/blob/main/src/events.ts).

## Account layouts

Both accounts are Anchor accounts: an 8-byte discriminator, `sha256("account:<Name>")[..8]`, then the fields in Borsh encoding (little-endian, no padding). Fields are not aligned, so read them byte by byte, for example with `DataView.getBigUint64(offset, true)`.

### Market (274 bytes)

| Offset | Size | Field | Type | Meaning |
|---|---|---|---|---|
| 0 | 8 | discriminator | | `[219, 190, 213, 55, 0, 227, 198, 154]` |
| 8 | 32 | `pool` | Pubkey | DBC pool |
| 40 | 32 | `config` | Pubkey | DBC config |
| 72 | 32 | `base_mint` | Pubkey | Base mint |
| 104 | 32 | `quote_mint` | Pubkey | Quote mint |
| 136 | 32 | `base_vault` | Pubkey | DBC base vault |
| 168 | 32 | `quote_vault` | Pubkey | DBC quote vault |
| 200 | 32 | `buffer_vault` | Pubkey | PDA `["buffer", market]` |
| 232 | 8 | `fee_numerator` | u64 | The config's cliff fee numerator, out of 1,000,000,000 |
| 240 | 1 | `bump` | u8 | Market PDA bump |
| 241 | 8 | `total_basis` | u64 | Sum of the basis of all open positions |
| 249 | 1 | `finalized` | bool | Set by `finalize` |
| 250 | 8 | `surplus_snapshot` | u64 | Buffer balance at `finalize` |
| 258 | 8 | `basis_snapshot` | u64 | `total_basis` at `finalize` |
| 266 | 8 | `surplus_claimed` | u64 | Sum of the surplus claimed so far |

### Position (97 bytes)

| Offset | Size | Field | Type | Meaning |
|---|---|---|---|---|
| 0 | 8 | discriminator | | `[170, 188, 143, 228, 122, 64, 247, 208]` |
| 8 | 32 | `owner` | Pubkey | Wallet that owns the position |
| 40 | 32 | `market` | Pubkey | Market PDA |
| 72 | 8 | `tokens` | u64 | Base tokens held through the router (raw) |
| 80 | 8 | `basis` | u64 | Cost basis in raw quote units |
| 88 | 1 | `bump` | u8 | Position PDA bump |
| 89 | 8 | `auto_exit_deadline` | i64 | **v5.** Unix time from which `auto_exit` may run, 0 = disabled. Cleared when an exit empties the position |

* **Pinned by tests.** The Market offsets are asserted on serialized bytes by `invariant_tests::market_raw_bytes_keep_the_offsets_tests_and_clients_read`. The Position offsets are asserted by `tests::position_layout_appends_auto_exit_deadline` in [programs/zpvp_router/src/lib.rs](https://github.com/trucee-fun/trucee-programs/blob/main/programs/zpvp_router/src/lib.rs). The SDK reads the same offsets (`MARKET_OFFSETS` and `POSITION_OFFSETS` in [src/accounts.ts](https://github.com/trucee-fun/trucee-sdk/blob/main/src/accounts.ts)).
* **Older accounts.** Positions written by the pre-v5 router (the devnet build before the v5 upgrade) are 89 bytes, without `auto_exit_deadline`, and the devnet router also still owns 241-byte Markets from an earlier build. The SDK's `decodePosition` accepts both Position sizes and returns `autoExitDeadline: null` for the shorter one.
* **Growth.** New fields go at the end. The SDK decoders accept longer data.
* **Queries.** `fetchAllMarkets` filters program accounts on the Market discriminator at offset 0 and on the supported Market sizes, one scan per size, so the 241-byte legacy Markets are skipped. `fetchPositionsByOwner` filters on the Position discriminator, on `owner` at offset 8 and on the 97-byte size, so it skips 89-byte pre-v5 positions. To list one market's positions, filter on the discriminator and on `market` at offset 40 ([src/accounts.ts](https://github.com/trucee-fun/trucee-sdk/blob/main/src/accounts.ts)).

## Error codes

### Router errors (`RouterError`, 6000–6024)

Messages are verbatim from `#[msg]` in [programs/zpvp_router/src/lib.rs](https://github.com/trucee-fun/trucee-programs/blob/main/programs/zpvp_router/src/lib.rs) and match `ROUTER_ERRORS` in [src/errors.ts](https://github.com/trucee-fun/trucee-sdk/blob/main/src/errors.ts). New variants are only ever appended. The reviewed 6000–6023 order is pinned by `invariant_tests::error_codes_6000_to_6023_keep_their_order`; the fee-cap error is appended as 6024.

| Code | Hex | Name | Message | Raised by |
|---|---|---|---|---|
| 6000 | `0x1770` | `NotDbcAccount` | `Account is not owned by the DBC program` | `init_market` (pool, config), `buy` (config) |
| 6001 | `0x1771` | `NotTransferHookPool` | `Pool is not a DBC transfer-hook pool` | `init_market`, `buy`, `finalize`, `auto_exit` |
| 6002 | `0x1772` | `NotTransferHookConfig` | `Config is not a DBC transfer-hook config` | `init_market`, `buy` |
| 6003 | `0x1773` | `BadHookAccounts` | `Expected [extra-account-metas, instructions sysvar, hook program] as remaining accounts` | `buy` (wrong count or invalid referral), `sell`, `auto_exit` |
| 6004 | `0x1774` | `PoolConfigMismatch` | `Pool does not belong to this config` | `init_market` |
| 6005 | `0x1775` | `MintMismatch` | `Mint does not match the pool` | `init_market` |
| 6006 | `0x1776` | `ZeroOutput` | `Swap produced no tokens` | `buy` |
| 6007 | `0x1777` | `InvalidExitAmount` | `Exit amount must be > 0 and <= position` | `sell`, `auto_exit` (empty position) |
| 6008 | `0x1778` | `MathOverflow` | `Arithmetic overflow` | `buy`, `sell`, `auto_exit`, `claim_surplus` |
| 6009 | `0x1779` | `CurveNotComplete` | `Curve is not complete yet` | `finalize` |
| 6010 | `0x177a` | `AlreadyFinalized` | `Market already finalized` | `finalize`, `set_auto_exit` |
| 6011 | `0x177b` | `NotFinalized` | `Market not finalized yet` | `claim_surplus` |
| 6012 | `0x177c` | `NotPositionOwner` | `Account is not the position owner` | `claim_surplus`, `auto_exit` (account constraint) |
| 6013 | `0x177d` | `WrongTransferHook` | `Config's transfer hook is not zpvp_hook` | `init_market` |
| 6014 | `0x177e` | `UnsupportedFeeConfig` | `Only static quote-collected fees are supported (no scheduler, rate limiter or dynamic fee)` | `init_market` |
| 6015 | `0x177f` | `BufferInsufficient` | `Buffer cannot cover the refund` | `sell`, `auto_exit` |
| 6016 | `0x1780` | `SurplusOverclaimed` | `Claims would exceed the surplus snapshot` | `claim_surplus` |
| 6017 | `0x1781` | `QuoteMintNotAllowed` | `Mainnet beta: quote mint is not on the allowlist` | `init_market` (default build) |
| 6018 | `0x1782` | `ThresholdTooHigh` | `Mainnet beta: migration quote threshold above the cap` | `init_market` (default build) |
| 6019 | `0x1783` | `AutoExitDeadlineInPast` | `Auto-exit deadline must be in the future (or 0 to clear)` | `set_auto_exit` (v5) |
| 6020 | `0x1784` | `AutoExitNotDue` | `Auto-exit deadline not reached (or auto-exit not set)` | `auto_exit` (v5) |
| 6021 | `0x1785` | `AutoExitCurveComplete` | `Curve is complete: auto-exit is no longer possible` | `auto_exit` (v5) |
| 6022 | `0x1786` | `PositionCapExceeded` | `Buy would exceed the anti-whale cap (20% of curve supply)` | `buy` (v5) |
| 6023 | `0x1787` | `PresetNotAllowed` | `Config breaks the Zero-PvP preset (creator allocation, fixed supply or unlocked LP)` | `init_market` (v5) |
| 6024 | `0x1788` | `FeeTooHigh` | `Config fee is above the 1% cap` | `init_market` (current source) |

### Hook errors (`HookError`)

| Code | Hex | Name | Message | Raised by |
|---|---|---|---|---|
| 6000 | `0x1770` | `TransferNotViaRouter` | `Pre-graduation transfers must go through the Zero-PvP router` | `transfer_hook`, on any base-token transfer whose top-level instruction is not the router |

### Telling errors apart

* The router and the hook both number their errors from 6000, so the failing program decides what a code means. Solana logs the innermost failing program first: `Program <id> failed: custom program error: 0x…`. A hook rejection inside a DBC swap therefore shows up under the hook's ID first.
* Codes 2000–3999 are Anchor framework errors from account constraints. For example, the v5 tests see 2006 `ConstraintSeeds` for a position of another wallet, 2009 `ConstraintAssociated` for a non-ATA quote account, 2015 `ConstraintTokenOwner` for another wallet's token account, 3010 `AccountNotSigner` and 3012 `AccountNotInitialized` ([Router v5 review](../security/router-v5-review.md), checklist evidence).
* `decodeTxError(err)` in [src/errors.ts](https://github.com/trucee-fun/trucee-sdk/blob/main/src/errors.ts) maps a failed transaction or its logs to `{ program, code, name, message }`. It knows the router, hook, DBC and Anchor tables and detects wallet rejections.

## Constants and formulas

| Item | Value or formula | Source |
|---|---|---|
| Anti-Whale cap (v5) | ⌊`swap_base_amount` × 2,000 ÷ 10,000⌋, computed in `u128` (`ANTI_WHALE_BPS` = 2000). On devnet config `HbcvzZMWkg3rFHNwsDujFJXazXoWhcWt4dthbJGAaGhs`, `swap_base_amount` 185,067,869,081,122 gives a cap of 37,013,573,816,224 | [programs/zpvp_router/src/lib.rs](https://github.com/trucee-fun/trucee-programs/blob/main/programs/zpvp_router/src/lib.rs) `anti_whale_cap` and test `anti_whale_cap_is_20_percent_of_swap_base_amount_floored`; [programs/zpvp_router/src/dbc.rs](https://github.com/trucee-fun/trucee-programs/blob/main/programs/zpvp_router/src/dbc.rs) test constant `DEVNET_SWAP_BASE_AMOUNT` |
| Maximum static fee (current source) | 1% = 100 bps = fee numerator 10,000,000; higher configs fail with 6024 at `init_market` | [programs/zpvp_router/src/lib.rs](https://github.com/trucee-fun/trucee-programs/blob/main/programs/zpvp_router/src/lib.rs) (`init_market`, `RouterError`) |
| Fee denominator | 1,000,000,000 | [programs/zpvp_router/src/math.rs](https://github.com/trucee-fun/trucee-programs/blob/main/programs/zpvp_router/src/math.rs) `FEE_DENOMINATOR` |
| Basis withheld per buy | 16 raw quote units | [programs/zpvp_router/src/math.rs](https://github.com/trucee-fun/trucee-programs/blob/main/programs/zpvp_router/src/math.rs) `DUST_PER_BUY` |
| Haircut per exit | 2 raw quote units | [programs/zpvp_router/src/math.rs](https://github.com/trucee-fun/trucee-programs/blob/main/programs/zpvp_router/src/math.rs) `HAIRCUT_PER_EXIT` |
| Basis of a buy | max(`net_into_curve` − 16, 0) | [programs/zpvp_router/src/math.rs](https://github.com/trucee-fun/trucee-programs/blob/main/programs/zpvp_router/src/math.rs) `basis_for_buy` |
| Basis of an exit | Full exit: the whole basis. Partial exit: ⌊`basis` × `tokens` ÷ `position.tokens`⌋ | [programs/zpvp_router/src/math.rs](https://github.com/trucee-fun/trucee-programs/blob/main/programs/zpvp_router/src/math.rs) `basis_for_exit`; SDK `basisForExit` |
| Refund | max(`basis_part` − ⌈`basis_part` × `fee_numerator` ÷ 1,000,000,000⌉ − 2, 0) | [programs/zpvp_router/src/math.rs](https://github.com/trucee-fun/trucee-programs/blob/main/programs/zpvp_router/src/math.rs) `refund_for`; SDK `refundFor` |
| Example refund | `basis_part` 1,000,000,000 at `fee_numerator` 10,000,000 (1%) refunds 989,999,998 | [programs/zpvp_router/src/math.rs](https://github.com/trucee-fun/trucee-programs/blob/main/programs/zpvp_router/src/math.rs) test `refund_matches_python_reference` |
| Surplus share | ⌊`surplus_snapshot` × `basis` ÷ `basis_snapshot`⌋, 0 when `basis_snapshot` is 0 | [programs/zpvp_router/src/math.rs](https://github.com/trucee-fun/trucee-programs/blob/main/programs/zpvp_router/src/math.rs) `surplus_share` |
| Hook accounts per DBC swap | 3 | [programs/zpvp_router/src/dbc.rs](https://github.com/trucee-fun/trucee-programs/blob/main/programs/zpvp_router/src/dbc.rs) `HOOK_ACCOUNT_COUNT` |

## Sources

Program links point into the published programs repository. The router's unit tests, which pin the layouts, the error order, the preset, the referral rules and the math, were re-run for this page: `cd zpvp && CARGO_BUILD_JOBS=4 cargo test -p zpvp_router` gave **48 passed, 0 failed** (re-run on 2026-10-11).

| Claim | Source |
|---|---|
| Program IDs | `declare_id!` in [programs/zpvp_router/src/lib.rs](https://github.com/trucee-fun/trucee-programs/blob/main/programs/zpvp_router/src/lib.rs) and [programs/zpvp_hook/src/lib.rs](https://github.com/trucee-fun/trucee-programs/blob/main/programs/zpvp_hook/src/lib.rs); `DBC_PROGRAM_ID` in [programs/zpvp_router/src/dbc.rs](https://github.com/trucee-fun/trucee-programs/blob/main/programs/zpvp_router/src/dbc.rs); [src/constants.ts](https://github.com/trucee-fun/trucee-sdk/blob/main/src/constants.ts) |
| Current devnet router: default build of trucee-programs main, v5 plus the 1% fee cap, sha256 `38b88ec9db9bdec6d3810247d8c54220651fcbf1372585dbd20838594b63f041`, 439,912 bytes, last deployed in slot 510258390 | `solana program show D4sk6wwELD6cmd7tv6hE4hkxQP8SF8tjdegYym8iWNNb --url devnet`; deploy transaction `2x4JHAYtDbvijNiHzv5rDvXjQVPc7hkbW2YbbnUxMGmuUSBTMbUFdtmey9YCWsUqCBGDPsbNMm3qE5N71V9bhQ2y`; [Security → Upgrade authority](../security.md#upgrade-authority) |
| Previous devnet build: router v5 (before the fee cap), source [13662fd](https://github.com/trucee-fun/trucee-programs/commit/13662fd), sha256 `32d63bde1e8cc925aad7ce59e1e7b9c50ed5d918dea039b2db060f811905bff5`, 439,104 bytes, upgraded in slot 509900704 | Deploy transaction `4PzU4YFJ2JY26ciZjfCXKVcRUKM8fnYwBGGPrBJrexLTLU86UxnRsPRuHSL4B9FqiUCe8KvooahvKZvxQeVjbS6r` (recorded run, commit [0bb9bee](https://github.com/trucee-fun/trucee-litesvm-diff/commit/0bb9bee)); [Security → Upgrade authority](../security.md#upgrade-authority) |
| Current default router and unchanged hook hashes; previous v5 build recorded separately | [Security → Upgrade authority](../security.md#upgrade-authority) and [programs/zpvp_router/src/lib.rs](https://github.com/trucee-fun/trucee-programs/blob/main/programs/zpvp_router/src/lib.rs) (`init_market`, `RouterError`) |
| SDK scans: Market sizes, the 97-byte Position size, legacy accounts skipped | `fetchAllMarkets`, `fetchPositionsByOwner` and the file header in [src/accounts.ts](https://github.com/trucee-fun/trucee-sdk/blob/main/src/accounts.ts) |
| Mainnet since 2026-10-12 with the devnet program IDs: router sha256 `370c0756f948f95ade4c15170897791c9e52c3c2a6d82d8986c9e51dfc233030` (slot 456095594), hook sha256 `1dbde487a10902638795d25a4cefb7ad6e4a175358d0011894c7fd0f10f55127` (slot 456095540) | `solana program show <PROGRAM_ID> --url mainnet-beta`; [Program IDs](#program-ids); [Security → Upgrade authority](../security.md#upgrade-authority) |
| Quote mints and caps | `QUOTE_CAPS` in [programs/zpvp_router/src/lib.rs](https://github.com/trucee-fun/trucee-programs/blob/main/programs/zpvp_router/src/lib.rs); decimals, token programs and clusters in [src/constants.ts](https://github.com/trucee-fun/trucee-sdk/blob/main/src/constants.ts) |
| Instructions, arguments, account order and checks | `#[program]` and the `#[derive(Accounts)]` structs in [programs/zpvp_router/src/lib.rs](https://github.com/trucee-fun/trucee-programs/blob/main/programs/zpvp_router/src/lib.rs); [programs/zpvp_router/src/dbc.rs](https://github.com/trucee-fun/trucee-programs/blob/main/programs/zpvp_router/src/dbc.rs); [programs/zpvp_hook/src/lib.rs](https://github.com/trucee-fun/trucee-programs/blob/main/programs/zpvp_hook/src/lib.rs); builders in [src/instructions.ts](https://github.com/trucee-fun/trucee-sdk/blob/main/src/instructions.ts) |
| Instruction, account and event discriminators | `sha256("global:<name>")`, `sha256("account:<Name>")` and `sha256("event:<Name>")`, truncated to 8 bytes; recomputed for this page and equal to the constants in [src/instructions.ts](https://github.com/trucee-fun/trucee-sdk/blob/main/src/instructions.ts), [src/accounts.ts](https://github.com/trucee-fun/trucee-sdk/blob/main/src/accounts.ts) and [src/events.ts](https://github.com/trucee-fun/trucee-sdk/blob/main/src/events.ts) |
| Native Referral rules | `split_buy_remaining`, `check_referral` and their tests in [programs/zpvp_router/src/dbc.rs](https://github.com/trucee-fun/trucee-programs/blob/main/programs/zpvp_router/src/dbc.rs); [Router v5 review](../security/router-v5-review.md) A1 |
| Preset rules and offsets | [programs/zpvp_router/src/preset.rs](https://github.com/trucee-fun/trucee-programs/blob/main/programs/zpvp_router/src/preset.rs) and its tests; [Router v5 review](../security/router-v5-review.md) (F1–F3, "Verified DBC fields") |
| Market layout, 274 bytes | `Market` in [programs/zpvp_router/src/lib.rs](https://github.com/trucee-fun/trucee-programs/blob/main/programs/zpvp_router/src/lib.rs); `invariant_tests::market_raw_bytes_keep_the_offsets_tests_and_clients_read` |
| Position layout, 97 bytes | `Position` in [programs/zpvp_router/src/lib.rs](https://github.com/trucee-fun/trucee-programs/blob/main/programs/zpvp_router/src/lib.rs); `tests::position_layout_appends_auto_exit_deadline`; 89-byte pre-v5 size in [src/constants.ts](https://github.com/trucee-fun/trucee-sdk/blob/main/src/constants.ts) (`POSITION_ACCOUNT_SIZE_V1`) |
| Events | `#[event]` structs in [programs/zpvp_router/src/lib.rs](https://github.com/trucee-fun/trucee-programs/blob/main/programs/zpvp_router/src/lib.rs); [src/events.ts](https://github.com/trucee-fun/trucee-sdk/blob/main/src/events.ts) |
| Error codes and messages | `RouterError` and `HookError` in the two [programs/zpvp_router/src/lib.rs](https://github.com/trucee-fun/trucee-programs/blob/main/programs/zpvp_router/src/lib.rs) files; `invariant_tests::error_codes_6000_to_6023_keep_their_order`; [src/errors.ts](https://github.com/trucee-fun/trucee-sdk/blob/main/src/errors.ts) |
| Hook rule and graduation | `transfer_hook` and the module doc in [programs/zpvp_hook/src/lib.rs](https://github.com/trucee-fun/trucee-programs/blob/main/programs/zpvp_hook/src/lib.rs); [src/zpvp_e2e.ts](https://github.com/trucee-fun/trucee-litesvm-diff/blob/main/src/zpvp_e2e.ts) |
| Constants and formulas | [programs/zpvp_router/src/math.rs](https://github.com/trucee-fun/trucee-programs/blob/main/programs/zpvp_router/src/math.rs) and [programs/zpvp_router/src/lib.rs](https://github.com/trucee-fun/trucee-programs/blob/main/programs/zpvp_router/src/lib.rs), with their unit tests |
