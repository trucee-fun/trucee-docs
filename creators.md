---
description: >-
  Launch a token on a Zero-PvP curve: what the launch form asks for, which
  rules the preset fixes for every launch, and where the trading fees go.
---

# For creators

A Trucee launch is a Meteora DBC launch with one fixed preset. You choose the token's details, the quote token, the graduation threshold and an optional first buy. The preset fixes everything else, so that nobody, you included, gets tokens or liquidity without buying on the curve. Until the curve graduates, every buyer can exit at their cost basis. [How it works](how-it-works.md) explains the mechanism.

{% hint style="warning" %}
**Status on 2026-10-11.** Trucee runs on Solana devnet only. Devnet runs router v5, the capped build, so every on-chain rule on this page is live there. SOL is the only quote token on devnet. Trucee is not deployed on mainnet yet. The programs are unaudited, and the web app is not public yet (see [Links](links.md)).
{% endhint %}

## Launch a token

The web app's **Launch** page (`/launch`) runs the whole launch from one form. To launch from your own code, see the [Quickstart](developers/quickstart.md) ("Build a launch plan"). The app calls the same SDK function, `buildLaunchPlan`.

### The form

| Field | Required | Rules |
| --- | --- | --- |
| Name | Yes | At most 32 characters and 32 bytes of UTF-8. Accented letters and emoji take more than one byte each. No invisible or control characters |
| Symbol | Yes | Capital letters A–Z and digits 0–9, 1 to 10 characters |
| Description | No | At most 500 characters. Line breaks are allowed, but other invisible or control characters are not |
| Image | Yes | PNG, JPEG, WebP or GIF, at most 1 MB. The server checks the file's contents again when it is uploaded |
| Website, X (Twitter), Telegram | No | Full `https://` links only, at most 200 characters each |
| Quote token | Yes | What buyers pay with. See [Quote tokens and thresholds](#quote-tokens-and-thresholds) |
| Graduation threshold | Yes | Above 0 and at most the quote token's cap. At most 9 decimal places for SOL and 8 for xStocks |
| Initial buy | No | From 0 up to the graduation threshold. Leave it empty to skip it. See [Your initial buy](#your-initial-buy) |

The pool writes the name, the symbol and a link to the metadata file on chain, and the preset makes them permanent (see [What the preset fixes](#what-the-preset-fixes)). The image, description and links are stored in the metadata file. On devnet, the app stores that file and the image on its own server.

### Quote tokens and thresholds

The curve graduates when its quote reserve reaches the graduation threshold. The router accepts only the quote tokens below and caps the threshold for each one (`QUOTE_CAPS`):

| Quote token | Decimals | Max graduation threshold | Clusters in the SDK |
| --- | --- | --- | --- |
| SOL (wrapped SOL) | 9 | 10 SOL | Devnet, mainnet-beta |
| TSLAx (tokenized Tesla shares) | 8 | 5 shares | Mainnet-beta |
| NVDAx (tokenized Nvidia shares) | 8 | 10 shares | Mainnet-beta |

Mainnet is not deployed yet, so for now every launch is a SOL launch on devnet.

* **Above the cap.** The form rejects the threshold and the SDK throws. If a config gets past both, the router refuses to open its market: error 6018 `ThresholdTooHigh`, or 6017 `QuoteMintNotAllowed` for an unlisted quote token.
* **xStocks.** The issuer of an xStock can pause transfers or claw back balances, including the market's buffer. See [Security → Known limitations](security.md#known-limitations). No xStock market is live yet. xStock quotes are tested in LiteSVM against mainnet snapshots only.
* **At least five holders.** The Anti-Whale cap limits one position to 20% of the curve's sale supply, so a curve needs at least five positions to graduate.

{% hint style="info" %}
**Choosing a threshold for mainnet.** Meteora's mainnet keepers migrate SOL pools to DAMM v2 automatically only when the threshold is 10 SOL or more. Whether they migrate pools quoted in xStocks is not verified. Below that threshold, someone else must send the migration. DBC's migration instruction is permissionless, and Trucee's crank has a migration job. By default that job skips mainnet SOL pools below 1 SOL. The curve graduates whether or not the pool has migrated: the hook comes off on the swap that completes the curve, and the surplus can be finalized and claimed before migration.
{% endhint %}

### Your initial buy

The initial buy is optional. It runs in the same transaction that opens the market, so it is the first trade on the curve. If someone else opened the market before you, the price may have moved (see [If a launch is interrupted](#if-a-launch-is-interrupted)). The initial buy is an ordinary router buy:

* It opens your position with a cost basis, like any buyer's. You can exit it at cost before graduation, and at graduation it gets its share of the surplus by basis.
* The Anti-Whale cap applies to it. The router rejects a buy that would leave your position above 20% of the curve's sale supply (error 6022 `PositionCapExceeded`).

Early tokens are the cheapest on a bonding curve. On the devnet test curve, a first buy of 0.015 SOL bought 18.6% of the curve's supply. So an initial buy that is only a small part of the threshold can still reach the cap. If it does, the whole market-opening transaction fails. Your config and pool stay on chain, but the market does not open.

### The four steps

| Step | What happens | Wallet signature |
| --- | --- | --- |
| 1. Upload metadata | The app saves the image and the details that wallets and explorers show | No |
| 2. Create config | Creates the DBC config with the preset | Yes |
| 3. Create pool | Creates the DBC pool and your Token-2022 mint, whose transfer hook is `zpvp_hook` | Yes |
| 4. Open market | Writes the hook's extra-account list, opens the router market (`init_market`) and places your initial buy, if you set one | Yes |

Your wallet signs the three transactions and pays their network fees and rent. Keep the page open until all four steps finish. The keys of the new config and mint exist only in the page's memory, and they are never logged, stored or sent anywhere. When the last step lands, the app opens your token's page.

### If a launch is interrupted

* **Before the pool exists.** No token has been created yet. Start again.
* **Someone opened your market first.** Anyone may write the hook's extra-account list and call `init_market`. If someone else does it between your pool and market transactions, your market transaction fails with "account already in use". The app then rebuilds the launch once with the same keys, skips every account that already exists, and sends only what is left. The other party's market is the same market you would have opened, because every field comes from your pool and config. If the market was already open and your initial buy has not been placed yet, the app first shows a fresh quote and asks whether to place it. If you decline, your token and market are live and the buy is not sent. If you confirm, the app rebuilds the buy with a minimum output of the confirmed quote less 1% (`RESUME_SLIPPAGE_BPS` = 100) and then sends it. If the price has moved further by then, DBC rejects the buy with `ExceededSlippage`, and no tokens are bought at the worse price.
* **Any other failure after the pool exists.** This includes a resumed buy that DBC rejects. The app does not retry, because a transaction that expired or "may still land" could still land. It reports the failure and links to your token's page, since the config and pool are already on chain.

## What the preset fixes

You choose only the fields in the form. The preset fixes the rest, and it is the same for every Trucee launch:

| Rule | Value | What it means for you | Router error |
| --- | --- | --- | --- |
| Creator allocation | None (no DBC locked vesting) | You get tokens only by buying on the curve, at the curve price, like everyone else | 6023 |
| Token supply | Dynamic | DBC mints only what the curve needs and burns unsold tokens at migration. The leftover receiver, your wallet in the app, receives nothing | 6023 |
| Liquidity after graduation | 100% permanently locked, with no LP vesting | Nobody, you included, can ever withdraw the DAMM v2 liquidity | 6023 |
| Migration | DAMM v2, migration fee 0% | Nobody takes a cut of the graduation quote | 6023 |
| Token authority | Immutable | Nobody holds the mint authority, so nobody can mint more tokens. The on-chain name, symbol and metadata link can never change | 6023 |
| Trading fee | Static, collected in the quote token, with no fee scheduler, rate limiter or dynamic fee. The app sets 1% | The fee rate at launch is also the rate at every exit | 6014 |
| Transfer hook | `zpvp_hook` | Until graduation, the token moves only through the router | 6013 |
| Quote token and threshold | A listed quote token, threshold at most its cap | See [Quote tokens and thresholds](#quote-tokens-and-thresholds) | 6017, 6018 |
| Base token | Token-2022, 6 decimals, 1,000,000,000 tokens, 20% of the supply goes to the DAMM v2 pool at migration | SDK defaults. The app does not change them | Not checked |

Two layers enforce these rules:

* **The SDK** refuses to build a config that breaks any rule and names each broken rule (`assertPreset` in `sdk/src/launch.ts`).
* **The router** checks the config once, in `init_market`, and refuses to open a market for a config that breaks any rule. 6023 `PresetNotAllowed` covers the first five rows. DBC never changes a config after it is created, so a market keeps these rules for life.

The byte-level checks are listed under [Programs reference → Zero-PvP preset](developers/programs.md#zero-pvp-preset-v5).

Launching gives you no control over the market. The router has no admin instruction, so neither you nor anyone else can use it to pause exits, change the fee or close a market. The programs themselves can be upgraded with a key the team holds. See [Security → Upgrade authority](security.md#upgrade-authority).

## Fees

### The trading fee

Every launch from the app has a static 1% trading fee (`LAUNCH_FEE_BPS = 100`). DBC charges it in the quote token. On a buy, the fee comes out of the buyer's input. On an exit, the router sells the tokens into the curve and the fee comes out of that sale's proceeds. If you launch with the SDK, you choose the fee yourself (`feeBps`). The router only requires a static fee.

The same rate sets your holders' exit cost: each refund is cut by the fee at cost (see [FAQ → What fees do I pay?](faq.md#what-fees-do-i-pay)). A higher fee earns the fee claimer more, but it also makes every exit at cost more expensive for your buyers.

### Where the trading fee goes

| Share of each trading fee | Recipient |
| --- | --- |
| 20% | Meteora's protocol fee. If a buy names a referrer (Native Referral), DBC pays the referrer 20% of this share |
| 80% | The DBC config's fee claimer. The app sets the fee claimer to your wallet, and the preset sets the separate pool-creator share to 0%, so you receive the full 80% |
| None | Trucee. The router has no fee account |

**Example:** a 1 SOL buy at 1% pays a 0.01 SOL fee. Meteora's share is 0.002 SOL, of which 0.0004 SOL goes to a referrer if there is one. The other 0.008 SOL goes to your wallet as the fee claimer. A referrer never reduces the buyer's basis or your share ([Programs reference → Native Referral](developers/programs.md#native-referral-v5)).

Your share accrues in the DBC pool, and the fee claimer withdraws it with DBC's own `claim_trading_fee` instruction. Trucee's app and SDK do not build that transaction.

### What you do not earn

* **The fee at cost on exits.** It is deducted from the refund, stays in the market's buffer and goes to the holders at graduation.
* **Migration and pool-creation fees.** The preset sets both to 0, and the router enforces the migration fee.
* **Tokens.** You have no allocation. Any tokens you hold, you bought on the curve.

{% hint style="info" %}
**There is no retention fee today.** Beyond the 80% fee-claimer share above, creators earn nothing from trading. A Retention Fee is listed on the [Roadmap](roadmap.md#retention-fee). Only its first part is merged in the router source: `init_market` recognizes a market that opts in by naming the router's fee PDA as fee claimer. Nothing pays a retention fee yet. The fee settlement is not merged, none of it is on devnet, and launches from the app do not opt in. Nothing on this page depends on it.
{% endhint %}

After migration, the token trades in a Meteora DAMM v2 pool under DAMM v2's own fee rules. Trucee plays no part in them.

## After the launch

* Anyone can buy your token and exit at cost through the router. Before graduation, the token cannot be sent between wallets or traded anywhere else. See [For traders](traders.md).
* The curve graduates when its quote reserve reaches your threshold. DBC then revokes the transfer hook, `finalize` freezes the surplus, and each holder can claim a share of it. See [How it works](how-it-works.md).
* After graduation, the pool migrates to DAMM v2 with its liquidity locked, as described in [Quote tokens and thresholds](#quote-tokens-and-thresholds).

## Sources

Paths are relative to the root of the Trucee monorepo.

| Claim | Source |
| --- | --- |
| Form fields, limits and messages | `app/src/components/launch/launch-schema.ts`, `launch-form.tsx`; server re-checks in `app/src/lib/server/metadata-store.ts` |
| Metadata stored by the app on devnet | `app/src/lib/server/metadata-store.ts`; `docs/trucee-plan.md` (decision log, tech stack) |
| Four steps, three signatures, keys kept in memory, the token page opens | `app/src/components/launch/launch-steps.tsx`, `launch-container.tsx`; `app/src/lib/launch/run-launch.ts` |
| Resume after "already in use", fresh-price confirmation, no retry of other failures, link to the token page once config and pool exist | `app/src/lib/launch/run-launch.ts` (header, `resumeAfterFailure`, `confirmFreshPrice`, `LaunchPartialError`); `sdk/src/launch.ts` (`buildLaunchPlan`); `docs/trucee-plan.md` (decision log, "Market-init front-running") |
| Resumed buy bounded at the confirmed quote less 1%, rejected by DBC with `ExceededSlippage` below that | `app/src/lib/launch/run-launch.ts` (`RESUME_SLIPPAGE_BPS`, `resumeMinOut`, `resumeLaunch`); `sdk/src/launch.ts` (`LaunchParams.initialBuyMinOut`, `buildLaunchPlan`) |
| 1% fee; fee claimer and leftover receiver are the creator's wallet | `app/src/lib/launch/run-launch.ts` (`LAUNCH_FEE_BPS`, `launchParams`) |
| Preset values, SDK defaults, pool-creator share 0, pool-creation fee 0 | `sdk/src/launch.ts` (`curveParams`, `presetRules`, `zeroPvpConfigParameters`) |
| Router checks and error codes | `zpvp/programs/zpvp_router/src/preset.rs`, `dbc.rs` (`read_config`), `lib.rs` (`init_market`, `check_launch_caps`); `docs/security-review-v5.md` |
| Quote tokens, decimals, caps and clusters | `QUOTE_CAPS` in `zpvp/programs/zpvp_router/src/lib.rs`; `sdk/src/constants.ts` |
| Anti-Whale cap, five positions, 0.015 SOL buying 18.6% on the devnet test curve | `ANTI_WHALE_BPS` in `zpvp/programs/zpvp_router/src/lib.rs`; `docs/trucee-plan.md` (section 3 and decision log) |
| Trading-fee split: 20% protocol, referral 20% of the protocol share, 80% to the fee claimer, claimed with DBC `claim_trading_fee` | `docs/trucee-plan.md` (sections 4 and 5, "Fee split facts"); `fee_claimer` doc comment in `zpvp/programs/zpvp_router/src/dbc.rs` |
| xStock issuer powers | `docs/trucee-plan.md` (section 1); comment on `QUOTE_CAPS` |
| Keepers migrate SOL pools only from 10 SOL; crank skips mainnet SOL pools below 1 SOL | `docs/trucee-plan.md` (After the freeze, decision log); `docs/research/RSC-03.md`; `worker/src/config.ts` |
| Router v5 (capped build) runs on devnet | `docs/submission.md` ("Router v5 on devnet (ONC-09)"); `litesvm-diff/out/e2e_devnet_v6.json` |
| No retention fee shipped: only the opt-in is merged, nothing settles or pays the fee, the app does not opt in | `check_retention_preset` and `fee_authority` in `zpvp/programs/zpvp_router/src/lib.rs` (commit `b3e5d99`); `docs/trucee-plan.md` (section 5 and decision log); `feeClaimer` in `app/src/lib/launch/run-launch.ts` |
