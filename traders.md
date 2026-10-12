---
description: >-
  Trade a Zero-PvP token: buy on the curve, read "Your floor", exit at cost,
  set an Auto-Exit deadline and claim your surplus share after graduation.
---

# For traders

On a Trucee token, the trade panel offers two actions before graduation: **Buy** and **Exit at cost**. Every buy records your cost basis. An exit pays that basis back, minus the fee at cost and a 2-lamport haircut, wherever the price is. Until graduation, the amount you would get back is shown as **Your floor**. When the curve graduates, exits at cost end, the token becomes freely transferable, and holders split the market's surplus by basis. [How it works](how-it-works.md) explains the mechanism. This page follows the screens of the Trucee web app.

{% hint style="warning" %}
**Status on 2026-10-12.** Trucee went live on Solana mainnet on 2026-10-12, and also runs on devnet, with the same program IDs and the default router build: v5 plus the 1% launch fee cap (`FeeTooHigh`, 6024), upgraded on devnet in slot 510258390. Mainnet markets can be quoted in SOL, TSLAx or NVDAx; SOL is the only quote token on devnet. The programs are not independently reviewed. The web app is [trucee.fun](https://trucee.fun) on mainnet and [devnet.trucee.fun](https://devnet.trucee.fun) on devnet (see [Links](links.md)). Trucee's crank runs its Auto-Exit, `finalize`, surplus-claim and migration jobs on its own, on mainnet and devnet: the final end-to-end run below used every one of them, and on devnet the crank also ran unattended against a graduated market.
{% endhint %}

## Where things are

| Page | What you do there |
| --- | --- |
| **Discover** (`/discover`) | Browse launches and open a token's page |
| **Token page** (`/t/<mint>`) | Buy, exit at cost and set Auto-Exit in the trade panel. After graduation, the banner at the top shows your surplus share |
| **Portfolio** (`/portfolio`) | See every position with its floor, claimable surplus and Auto-Exit status, and claim your surplus |

Connect a wallet with **Connect wallet**. Phantom, Backpack and Solflare are detected automatically. [FAQ → Which wallets work?](faq.md#which-wallets-work) covers what has been tested, and why smart-contract wallets such as a Squads vault cannot trade before graduation.

While the curve is live, the token page shows this line under the trade panel:

> Before graduation this token moves only through Trucee; your wallet's own Send/Swap will fail.

This is by design. The token's transfer hook accepts a transfer only inside a Trucee router instruction, so the router sees every buy and exit. Your tokens stay in your own wallet the whole time. See [FAQ → Why does my wallet's Send or Swap fail?](faq.md#why-does-my-wallets-send-or-swap-fail-for-a-trucee-token-before-graduation).

## Buy

1. Open the token's page and stay on the **Buy** tab.
2. Enter the amount in **You pay**, in the quote token (SOL on devnet). The note under the field reads "One wallet can hold at most 20% of the curve supply."
3. When you stop typing, the app quotes the buy from the chain. The quote shows **You receive** (the tokens you get) and **Fee** (the trading fee, in the quote token).
4. Pick a **Slippage** of 0.5%, 1% or 3%. The default is 1%.
5. Check **Your floor after this buy**, the floor of your whole position once this buy lands.
6. Press the buy button, labelled **Buy** and the token's symbol, and sign in your wallet.

**Slippage.** The buy carries a minimum output of `tokensOut × (10,000 − slippage in bps) ÷ 10,000`, rounded down, where `tokensOut` is the quoted **You receive**. If the price moves further before your buy lands, DBC rejects it and nothing is bought. The app then shows "The price moved past your slippage limit, try again or raise slippage".

**Quotes expire.** A quote older than 30 seconds is dropped, and the app fetches a fresh one before you can buy.

**What the transaction does.** It creates your quote token account and your token account if they do not exist yet. On a SOL market it wraps exactly the amount you pay into wrapped SOL (wSOL). Then it calls the router's `buy`. The router buys on the DBC curve, the tokens land in your own wallet, and your position records:

* **Tokens:** the tokens you received.
* **Cost basis:** the quote that actually entered the curve, minus 16 lamports. DBC takes the trading fee from your input first, so the fee is not part of your basis.

Your first buy in a market also opens your position account, and your wallet pays its rent. The rent comes back when the position closes after graduation (see [Claim your surplus](#claim-your-surplus)).

### The 20% cap

No buy may leave your position above 20% of the curve's sale supply. A buy over the cap fails with error 6022 `PositionCapExceeded`, and the app shows "This buy would put you above 20% of the curve supply". After an exit, you can buy again up to the cap. Because one position can hold at most 20%, a curve needs at least five positions to graduate.

### Referral links

Once your wallet is connected, the token page shows **Your referral link**, a link to that token page with `?ref=` and your wallet address, and a **Copy link** button. When someone opens a token page through such a link, their buys in that browser tab name you as the referrer, also on other token pages they open in the same tab. DBC then pays you a share of its protocol fee: 20% of the protocol's 20% of the trading fee. The buyer pays the same, and their basis and floor do not change.

* The app passes a referrer only when the referrer's wallet already has a token account for the market's quote token (wSOL on devnet), so a buyer never pays rent for someone else's account. Without that account, the buy goes through without a referrer.
* A referral to your own wallet is ignored.
* A `ref` value that is not a wallet address is ignored.

## Your floor

**Until graduation, your floor is what you get back if you exit before graduation:** your cost basis minus the fee you would pay selling at cost, minus a 2-lamport haircut, and never below zero.

```
floor = basis − ceil(basis × fee rate) − 2 lamports
```

This is the router's refund formula (`refund_for`) applied to your whole basis. For example, until graduation a basis of 1 SOL at a 1% fee gives a floor of 0.989999998 SOL after the 2-lamport haircut. Until graduation, the floor does not depend on the price. If the price falls, an exit still pays the floor. If the price rises, an exit still pays only the floor, and the difference stays in the market's buffer for the holders at graduation.

Where the app shows it:

| Place | Label | Caption |
| --- | --- | --- |
| **Buy** tab, with a quote | Your floor after this buy | What you get back if you exit before graduation. |
| **Buy** tab, without a quote, once you hold a position | Your floor | What you get back if you exit before graduation. |
| **Exit at cost** tab | Your floor | What your whole position gets back if you exit before graduation. |
| **Portfolio** | **Floor** column, and a floor total per quote token | Shown while the curve is live. After graduation the column reads "Ended at graduation" |

The trade panel computes the floor from your position account on chain, not from the app's server, and reads it again every 10 seconds.

## Exit at cost

1. Open the **Exit at cost** tab. It shows how many tokens you hold.
2. Enter **Tokens to exit**, or press **Max** to fill in every token in your position.
3. Check **You get back** (your refund) and **Fee at cost**. The panel notes that the amount is "Set by your cost basis, so slippage does not apply."
4. Press **Exit at cost** and sign in your wallet.

**Partial exits.** An exit of part of your position releases a matching share of your basis at average cost: `basis × tokens exited ÷ tokens held`, rounded down. Its refund uses the same formula as the floor. A full exit releases all of your remaining basis.

**What the transaction does.** Right before building it, the app reads your position on chain again and exits at most the tokens it holds at that moment. The router sells your tokens into the curve, the sale proceeds go into the market's buffer, and the router pays your refund from the buffer. If the buffer cannot cover the refund, the exit fails with error 6015, and the app shows "The refund buffer can't cover this exit right now, try a smaller amount".

**SOL markets.** The refund arrives as SOL, not wSOL. The exit transaction closes your wallet's wSOL account after the sale, which unwraps the whole account. The panel says so:

> Exit returns SOL; any wSOL in your wallet's wSOL account is unwrapped too.

So any wSOL already in that account, for example a refund from an Auto-Exit, also comes back as SOL.

**Cost of a round trip.** A buy followed by a full exit costs the buy's trading fee, the fee at cost and 18 lamports (16 + 2), plus network fees, whatever the price did in between. See [FAQ → What fees do I pay?](faq.md#what-fees-do-i-pay) for every cost.

If you have not connected a wallet, the tab reads "Connect a wallet to see the TOKEN you can exit at cost." If you hold none of the token, it reads "You don't hold any TOKEN yet. Buy some and you can exit at cost any time before graduation." (TOKEN stands for the token's symbol.)

## Auto-Exit

Auto-Exit lets you pick a deadline and walk away. If the curve has not graduated by then, anyone, normally the Trucee crank, can exit your whole position at cost for you. The refund always goes to your own wallet, and whoever sends the exit gains nothing.

The **Auto-Exit** box appears at the bottom of the trade panel while the curve is live and you hold tokens. It shows **On** or **Off**.

### Set a deadline

* **Presets:** 1 h, 24 h or 3 d from now, under "Exit at cost after".
* **Custom deadline (UTC):** pick a date and time, then press **Set deadline**. The field is read as UTC, not your local time. The deadline must be at least a minute from now ("Pick a time at least a minute from now.") and at most a year from now ("Pick a time within a year from now.").

Setting a deadline sends one transaction with three instructions:

1. It creates your wallet's token account for the quote token if it does not exist, and your wallet pays its rent. The refund of an Auto-Exit lands in that account, so it has to exist when the deadline passes.
2. It approves the market's program address (PDA) as the delegate of your token account for that token, for an unlimited amount (`u64::MAX`).
3. It calls the router's `set_auto_exit` with your deadline.

The box discloses the approval before you sign:

> Setting a deadline approves this market as delegate on your TOKEN token account for an unlimited amount (u64::MAX), so tokens you buy later in this market are covered too.

> A token account has a single delegate, so this replaces any existing delegate approval on it.

The router uses this approval only in its `auto_exit` instruction. That instruction runs only after a deadline you set, only while the curve is live, and only sends the refund to your own quote token account.

### While Auto-Exit is on

The box shows **Exits at cost from** and the deadline in UTC. The Portfolio's **Auto-Exit** column shows "Exits if not graduated by" and the same time.

* **Buying more** keeps the deadline. The unlimited approval covers the new tokens, so the whole position exits.
* **A partial exit** keeps the deadline. **A full exit** clears it, but the approval stays on your token account. The router can use it only after a new deadline you set.
* **Approving another delegate** on the same token account replaces the market's approval and stops Auto-Exit. The box warns: "A token account has a single delegate: approving another one replaces this market and stops Auto-Exit."

### Cancel

Press **Cancel auto-exit**. This sends `set_auto_exit(0)`, which clears the deadline, and then revokes the delegate on your token account. The box confirms: "Cancelling clears the deadline and revokes the delegate on that token account."

### Revoke approval

The market's approval can outlive your deadline: a full exit or an Auto-Exit clears the deadline but leaves the approval on your token account, and after `finalize` the router refuses to clear a deadline (error 6010), so **Cancel auto-exit** no longer works there. For those cases the box offers **Revoke approval**. It appears when your token account for the token has a delegate and no deadline is active, or once the market is finalized. It sends one Token-2022 revoke and no router instruction. The box explains:

> Remove the token approval this market still holds: an unlimited (u64::MAX) delegate on your token account. Without an active Auto-Exit it cannot move your tokens, but wallets still list it as open.

If the delegate on that token account is another account, not this market, the button revokes that approval instead, and the box says so.

### When the deadline passes

Once the on-chain clock reaches your deadline, anyone can send `auto_exit` for your position. It sells your whole position at cost, on the same terms as **Exit at cost**, and clears the deadline. Two differences from a manual exit:

* **The refund stays wrapped.** On a SOL market it lands as wSOL in your wallet's wSOL account. Your next exit in the app unwraps it (see [SOL markets](#exit-at-cost)).
* **It exits everything.** `auto_exit` always exits the whole position.

If the curve graduates before your deadline, nothing is exited (error 6021 `AutoExitCurveComplete`). You keep your tokens, which are now freely transferable, and your share of the surplus. Once the curve has graduated, the app no longer offers a deadline, and after `finalize` the router refuses to set or clear one (error 6010). The approval stays on your token account until you revoke it, for example with [Revoke approval](#revoke-approval). The router uses it only in `auto_exit`, which fails once the curve is complete.

{% hint style="info" %}
**The crank needs your quote token account.** `auto_exit` pays the refund into your wallet's quote token account, which must exist. Setting a deadline in the app creates it if it is missing. On a SOL market, a later exit in the app closes it again, and your next buy or deadline creates it again. If the account is missing when your deadline passes, the crank creates it only when the refund is at least 0.25 SOL (its default `MIN_ATA_VALUE_LAMPORTS`) and otherwise skips your position. A skipped position keeps its deadline, and you can still exit it yourself at cost.
{% endhint %}

## Graduation

The curve graduates when its quote reserve reaches the launch's graduation threshold. On the swap that completes the curve, DBC revokes the transfer hook. Then:

* **Exits at cost end.** Nobody can sell into a completed curve. The trade panel's tabs are disabled, and it shows "TOKEN has graduated" and "The curve has closed, so buying and exiting at cost are no longer available here."
* **Your tokens are free.** They are a plain Token-2022 token now, and you can send them or trade them anywhere.
* **The banner** at the top of the token page shows "Hook revoked" and one of two titles:

| Banner title | Meaning |
| --- | --- |
| Graduated — awaiting DAMM v2 migration | The pool has not moved to Meteora DAMM v2 yet. The banner notes that anyone can migrate it at [migrator.meteora.ag](https://migrator.meteora.ag), and that your surplus share can be claimed already |
| Graduated — now trading on DAMM v2 | The token trades in a Meteora DAMM v2 pool. On devnet the banner shows the DAMM v2 pool address. On mainnet it links to **Trade on Meteora** and **Swap on Jupiter** |

## Claim your surplus

Exits that sold above their cost left the difference in the market's buffer. After graduation, whatever is in the buffer is the **surplus**, and the holders who still have a position split it by basis.

1. **Finalize.** Someone calls the router's `finalize`, once per market. It freezes the buffer balance as `surplusSnapshot` and the total basis of all open positions as `basisSnapshot`. Anyone can send it, and Trucee's crank has a job for it. The app has no button for it.
2. **Your share.** Once the market is finalized, your share is shown in the **Claimable** column on Portfolio and as **Your surplus share** in the token page's banner:

   ```
   share = floor(surplusSnapshot × your basis ÷ basisSnapshot)
   ```

3. **Claim.** Press **Claim** on Portfolio or **Claim surplus** in the banner, and sign.

**What the transaction does.** Right before building it, the app reads the market and your position on chain again. It creates your quote token account if it does not exist, paying its rent from your wallet, and then calls `claim_surplus`. The router pays your share into that account and closes your position account, so its rent returns to your wallet. You keep your tokens. On a SOL market the share arrives as wSOL.

**The crank claims for everyone.** `claim_surplus` is permissionless. Trucee's crank can send it for every position, paying the network fee itself, and the share always goes to the position's owner. If your position was already claimed, the app sends nothing and shows **Already claimed**: "Your surplus share was already sent to your wallet and the position is closed. Nothing was sent." The crank applies the same rule as for Auto-Exit: on a SOL market it creates a missing quote token account only for a share of at least 0.25 SOL by default, and leaves smaller claims to you.

If the market is not finalized yet when you press claim, the app shows **Not claimable yet**: "This market is still finalizing its surplus. Try again in a minute."

The surplus can be zero. Its size depends on how much exits sold above cost before graduation. Rounding leaves less than one lamport per position in the buffer.

## Portfolio

`/portfolio` lists the connected wallet's positions, read from chain state. A position with no tokens and nothing to claim is not listed.

| Column | Before graduation | After graduation |
| --- | --- | --- |
| Token | Name, symbol and a **Live** chip | **Graduated**, or **Migrated** once the pool is on DAMM v2 |
| Tokens | Tokens in the position | Tokens in the position |
| Cost basis | Your basis | Your basis |
| Floor | Your floor | "Ended at graduation" |
| Claimable | "At graduation" | Your share once the market is finalized, otherwise "None" |
| Auto-Exit | "Off", or "Exits if not graduated by" and the deadline in UTC | "Ended" |
| (action) | — | **Claim**, when your share is above zero |

Above the table, one total per quote token adds up the floors of your live positions and your claimable surplus.

## Messages you may see

| Message | Cause |
| --- | --- |
| The price moved past your slippage limit, try again or raise slippage | The buy would return less than its minimum output (DBC `ExceededSlippage`) |
| This buy would put you above 20% of the curve supply | The 20% cap (router 6022 `PositionCapExceeded`) |
| Enter an amount above zero and no more than your position | Exit amount out of range (router 6007 `InvalidExitAmount`) |
| The refund buffer can't cover this exit right now, try a smaller amount | Router 6015 `BufferInsufficient` |
| Pick a deadline in the future | The Auto-Exit deadline is not after the on-chain clock (router 6019 `AutoExitDeadlineInPast`) |
| This market has finalized; Auto-Exit is no longer available | Setting or clearing a deadline after `finalize` (router 6010 `AlreadyFinalized`) |
| The market has not finalized yet — try again after graduation | A claim before `finalize` (router 6011 `NotFinalized`) |
| Transfers are locked until graduation | A transfer outside the router before graduation (hook `TransferNotViaRouter`) |
| The price moved, try again | A wallet's own guard instruction (Lighthouse) failed because the price moved between preview and execution |
| Not enough balance | Your wallet cannot cover the amount, the network fee or the rent |
| Network is busy, try again | The RPC node rate-limited the request |
| You cancelled the transaction | You rejected it in your wallet |
| Couldn't price this buy. Try again in a moment. | The quote could not be read from the chain |

[Programs reference → Error codes](developers/programs.md#error-codes) lists every router and hook error.

## Proof on devnet

The final end-to-end run walked one fresh SOL market (graduation threshold 0.3 SOL, 1% fee) through the whole trader journey on router v5 (before the fee cap) on devnet, on 2026-10-11 from 14:16 to 14:20 UTC. It used the same SDK functions as the app and ran the crank's real jobs one tick at a time against that market. It finished with **13 passed, 0 failed**. An earlier run of the same script (13:27 to 13:31 UTC) also passed 13 of 13 checks, with the same amounts.

| Step | Check |
| --- | --- |
| 1 | Launch a wSOL market |
| 2 | 7 traders buy. Every quote matches the router's `BuyEvent` |
| 3 | Your floor equals the on-chain refund of a later full exit, after two other buys moved the price: 7,350,732 lamports both |
| 4 | A half exit at cost refunds exactly the quoted amount |
| 5 | The hook rejects a direct DBC buy and a wallet-to-wallet transfer |
| 6 | A buy above 20% of the curve supply is rejected (6022) |
| 7 | Auto-Exit 20 seconds ahead: the crank's auto-exit job sends nothing before the deadline, then exits the position. The refund equals the floor, 7,350,732 lamports |
| 8 | Graduation with no position above the cap. The hook is revoked |
| 9 | The crank's finalize job finalizes the market with a surplus of 15,045,373 lamports |
| 10 | The crank's migration job creates the DAMM v2 pool |
| 11 | The crank's claims job claims for all 7 positions and closes them. The shares total 15,045,370 lamports, and 3 lamports of rounding stay in the buffer |
| 12 | A plain wallet transfer works after graduation |
| 13 | The traders' SOL is swept back |

The run on Solana Explorer (devnet):

| Item | Address or signature |
| --- | --- |
| Market | [`Fk4yvubMy7dZ8h6UVnPLD3naVPc51Zs9RnHEX3ph6HAu`](https://explorer.solana.com/address/Fk4yvubMy7dZ8h6UVnPLD3naVPc51Zs9RnHEX3ph6HAu?cluster=devnet) |
| DAMM v2 pool after migration | [`6W3BGqQDWBJqfrEARB3jfbpWmZaAEjMESyCScnmo8TBP`](https://explorer.solana.com/address/6W3BGqQDWBJqfrEARB3jfbpWmZaAEjMESyCScnmo8TBP?cluster=devnet) |
| Launch: the transaction that opens the market (step 1) | [`2kCfgoyT1eyeWh7xAJPA1VWB1zsPuoRut41YVea8T1eEMSotzD3TNQjmcERPBRzdNAjbFrWAL1ApBt6RoKJTt1iA`](https://explorer.solana.com/tx/2kCfgoyT1eyeWh7xAJPA1VWB1zsPuoRut41YVea8T1eEMSotzD3TNQjmcERPBRzdNAjbFrWAL1ApBt6RoKJTt1iA?cluster=devnet) |
| Auto-Exit sent by the crank's job (step 7) | [`4rXRCf3WbSGwkv25vUNq8xVoi4uBnXcvA8N7pWYrFFEUAN6d73XP4Ng1ZPDN3gJwCifvuqDpz2HcgB8crXwKSGcx`](https://explorer.solana.com/tx/4rXRCf3WbSGwkv25vUNq8xVoi4uBnXcvA8N7pWYrFFEUAN6d73XP4Ng1ZPDN3gJwCifvuqDpz2HcgB8crXwKSGcx?cluster=devnet) |
| DAMM v2 migration sent by the crank's job (step 10) | [`2Pos6pHCTzpviqC2HHQ8THR27WGzMMqZGtdKFpN5KqaBDvioF6YE8d8mQyxCPVqdLsb6cmrJeuScxSn6RQXU6mJA`](https://explorer.solana.com/tx/2Pos6pHCTzpviqC2HHQ8THR27WGzMMqZGtdKFpN5KqaBDvioF6YE8d8mQyxCPVqdLsb6cmrJeuScxSn6RQXU6mJA?cluster=devnet) |
| A surplus claim sent by the crank's job (step 11) | [`4bDKeg824SZtBW27Fq1hba936nbRw5XXE2QwJDbfCzG9w54fJuAkNowWFxH9R8bAtqX18rTNDFF33TdJ6TekGAMF`](https://explorer.solana.com/tx/4bDKeg824SZtBW27Fq1hba936nbRw5XXE2QwJDbfCzG9w54fJuAkNowWFxH9R8bAtqX18rTNDFF33TdJ6TekGAMF?cluster=devnet) |

[out/e2e-devnet-final.json](https://github.com/trucee-fun/trucee-worker/blob/main/out/e2e-devnet-final.json) lists every account and signature of the run, step by step ([out/e2e-devnet.json](https://github.com/trucee-fun/trucee-worker/blob/main/out/e2e-devnet.json) for the earlier run).

**The crank on its own.** In a separate run on devnet, the crank ran unattended for 180 seconds with every job registered. It finalized the graduated market [`5t7tfUeP2msicPhFihz5vcasYqwk4tKTpgQRui96oyar`](https://explorer.solana.com/address/5t7tfUeP2msicPhFihz5vcasYqwk4tKTpgQRui96oyar?cluster=devnet), migrated its pool to DAMM v2 and claimed the surplus for all 6 of its positions, with no job errors ([out/crank-run-devnet.json](https://github.com/trucee-fun/trucee-worker/blob/main/out/crank-run-devnet.json)).

## Sources

Source links point to the published repositories.

| Claim | Source |
| --- | --- |
| Trade panel: tabs, labels, slippage presets 0.5%, 1% and 3%, the 20% note, the SOL unwrap line, the graduated notice | [src/components/trade/trade-panel.tsx](https://github.com/trucee-fun/trucee-app/blob/main/src/components/trade/trade-panel.tsx) (`SLIPPAGE_PRESETS_BPS`, `ANTI_WHALE_CAP_NOTE`, `SOL_UNWRAP_NOTE`, `GraduatedNotice`) |
| Default slippage 1%, quotes expire after 30 s, position re-read every 10 s and right before an exit, "Before graduation" line | [src/components/trade/trade-container.tsx](https://github.com/trucee-fun/trucee-app/blob/main/src/components/trade/trade-container.tsx) (`DEFAULT_SLIPPAGE_BPS`, `QUOTE_TTL_MS`, `POSITION_REFETCH_MS`, `exitBuild`, `BEFORE_GRADUATION_COPY`) |
| Referral links: `?ref=<wallet>` kept for the tab's session, passed only when the referrer's quote token account exists, self-referrals and invalid values ignored, "Your referral link" and "Copy link" | [src/lib/trade/referral.ts](https://github.com/trucee-fun/trucee-app/blob/main/src/lib/trade/referral.ts) (`parseReferrer`, `resolveReferrer`, `referralLink`); [src/components/trade/trade-container.tsx](https://github.com/trucee-fun/trucee-app/blob/main/src/components/trade/trade-container.tsx) (`ReferralLinkRow`, `REFERRAL_LINK_LABEL`, `REFERRAL_COPY`); DBC's referral share in [Programs reference → Native Referral](developers/programs.md#native-referral-v5) |
| Minimum output from slippage; buy creates the accounts and wraps SOL; exit closes the wSOL account | [src/lib/trade/build-trade.ts](https://github.com/trucee-fun/trucee-app/blob/main/src/lib/trade/build-trade.ts) (`minOutFor`, `buildBuyTx`, `buildExitTx`); [src/instructions.ts](https://github.com/trucee-fun/trucee-sdk/blob/main/src/instructions.ts) (`buyInstructions`, `sellInstructions`) |
| Floor labels and captions; floor = `refund_for(basis, fee)` | [src/components/trade/floor-callout.tsx](https://github.com/trucee-fun/trucee-app/blob/main/src/components/trade/floor-callout.tsx); [src/quote.ts](https://github.com/trucee-fun/trucee-sdk/blob/main/src/quote.ts) (`refundFor`, `floorValue`); [programs/zpvp_router/src/math.rs](https://github.com/trucee-fun/trucee-programs/blob/main/programs/zpvp_router/src/math.rs) (`refund_for`, `HAIRCUT_PER_EXIT`, `DUST_PER_BUY`, test `refund_matches_python_reference`) |
| Basis, partial exits, buffer, error codes, position rent | [Programs reference](developers/programs.md) (`buy`, `sell`, `claim_surplus`, error codes); [programs/zpvp_router/src/lib.rs](https://github.com/trucee-fun/trucee-programs/blob/main/programs/zpvp_router/src/lib.rs) |
| Auto-Exit presets, UTC custom deadline from 60 s to one year, consent and cancel copy | [src/components/trade/auto-exit-control.tsx](https://github.com/trucee-fun/trucee-app/blob/main/src/components/trade/auto-exit-control.tsx) (`PRESETS`, `MIN_LEAD_SECONDS`, `MAX_LEAD_SECONDS`, `approvalNote`, `CANCEL_NOTE`) |
| Set = create the owner's quote token account if missing + approve the market PDA for `u64::MAX` + `set_auto_exit`; clear = `set_auto_exit(0)` + revoke; Revoke approval = one Token-2022 revoke | [src/lib/trade/build-auto-exit.ts](https://github.com/trucee-fun/trucee-app/blob/main/src/lib/trade/build-auto-exit.ts) (`buildAutoExitTx`, `buildRevokeApprovalTx`); [src/instructions.ts](https://github.com/trucee-fun/trucee-sdk/blob/main/src/instructions.ts) (`setAutoExitInstructions`); [Programs reference → set_auto_exit](developers/programs.md#set_auto_exit-v5) |
| When Revoke approval appears, and its note | [src/components/trade/auto-exit-control.tsx](https://github.com/trucee-fun/trucee-app/blob/main/src/components/trade/auto-exit-control.tsx) (`REVOKE_LABEL`, `REVOKE_NOTE`, `revokeOfferOf`); [src/components/trade/trade-container.tsx](https://github.com/trucee-fun/trucee-app/blob/main/src/components/trade/trade-container.tsx) (delegate read) |
| `auto_exit` rules: whole position, refund to the owner's quote token account, errors 6010, 6020 and 6021; a partial exit keeps the deadline | [Programs reference → auto_exit](developers/programs.md#auto_exit-v5) and [sell](developers/programs.md#sell); [programs/zpvp_router/src/lib.rs](https://github.com/trucee-fun/trucee-programs/blob/main/programs/zpvp_router/src/lib.rs) (test `a_partial_exit_keeps_the_deadline`) |
| Crank creates a missing quote token account only above 0.25 SOL by default | [src/config.ts](https://github.com/trucee-fun/trucee-worker/blob/main/src/config.ts) (`DEFAULT_MIN_ATA_VALUE_LAMPORTS`); [src/crank/jobs/auto-exit.ts](https://github.com/trucee-fun/trucee-worker/blob/main/src/crank/jobs/auto-exit.ts) and [src/crank/jobs/claims.ts](https://github.com/trucee-fun/trucee-worker/blob/main/src/crank/jobs/claims.ts) (account-creation rules) |
| The crank registers every job; an unattended 180 s devnet run finalized, migrated and claimed 6 positions with no job errors | [src/index.ts](https://github.com/trucee-fun/trucee-worker/blob/main/src/index.ts) (`buildJobs`, header comment); [src/crank/jobs/](https://github.com/trucee-fun/trucee-worker/tree/main/src/crank/jobs/); [out/crank-run-devnet.json](https://github.com/trucee-fun/trucee-worker/blob/main/out/crank-run-devnet.json) (commit [452e204](https://github.com/trucee-fun/trucee-worker/commit/452e204)) |
| Graduated banner titles, migration note, claim slab | [src/components/token/graduated-banner.tsx](https://github.com/trucee-fun/trucee-app/blob/main/src/components/token/graduated-banner.tsx) |
| Claim flow: on-chain re-read, "Already claimed", "Not claimable yet", ATA created if missing | [src/components/portfolio/portfolio-container.tsx](https://github.com/trucee-fun/trucee-app/blob/main/src/components/portfolio/portfolio-container.tsx) (`runClaim`, `ALREADY_CLAIMED`, `NOT_FINALIZED`); [src/lib/claim/build-claim.ts](https://github.com/trucee-fun/trucee-app/blob/main/src/lib/claim/build-claim.ts) |
| Surplus share = `floor(surplusSnapshot × basis ÷ basisSnapshot)`; floor 0 and claimable set once finalized | [src/lib/server/positions.ts](https://github.com/trucee-fun/trucee-app/blob/main/src/lib/server/positions.ts) (`surplusShare`, `toPositionView`); [programs/zpvp_router/src/math.rs](https://github.com/trucee-fun/trucee-programs/blob/main/programs/zpvp_router/src/math.rs) (`surplus_share`) |
| Portfolio columns, states and totals | [src/components/portfolio/positions-table.tsx](https://github.com/trucee-fun/trucee-app/blob/main/src/components/portfolio/positions-table.tsx), [src/components/portfolio/portfolio-summary.tsx](https://github.com/trucee-fun/trucee-app/blob/main/src/components/portfolio/portfolio-summary.tsx); [src/app/portfolio/page.tsx](https://github.com/trucee-fun/trucee-app/blob/main/src/app/portfolio/page.tsx) |
| Error messages | [src/lib/tx/error-copy.ts](https://github.com/trucee-fun/trucee-app/blob/main/src/lib/tx/error-copy.ts) (`COPY`); [src/components/trade/trade-container.tsx](https://github.com/trucee-fun/trucee-app/blob/main/src/components/trade/trade-container.tsx) (`QUOTE_FAILED_COPY`) |
| Wallets detected automatically | [src/components/providers/app-providers.tsx](https://github.com/trucee-fun/trucee-app/blob/main/src/components/providers/app-providers.tsx) (`WALLETS`) |
| Final devnet run on router v5 (before the fee cap): 13 steps, 13 passed, 0 failed, 14:16 to 14:20 UTC; floor until graduation and refund before graduation 7,350,732; surplus 15,045,373 and claims 15,045,370; market, DAMM v2 pool and signatures | [scripts/e2e-devnet.ts](https://github.com/trucee-fun/trucee-worker/blob/main/scripts/e2e-devnet.ts); [out/e2e-devnet-final.json](https://github.com/trucee-fun/trucee-worker/blob/main/out/e2e-devnet-final.json) (commit [0c6f40e](https://github.com/trucee-fun/trucee-worker/commit/0c6f40e): `startedAt`, `finishedAt`, `summary`, `accounts`, steps 1, 3, 7, 9, 10 and 11) |
| Earlier devnet run: the same 13 steps and amounts, 13:27 to 13:31 UTC | [out/e2e-devnet.json](https://github.com/trucee-fun/trucee-worker/blob/main/out/e2e-devnet.json) |
