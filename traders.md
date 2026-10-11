---
description: >-
  Trade a Zero-PvP token: buy on the curve, read "Your floor", exit at cost,
  set an Auto-Exit deadline and claim your surplus share after graduation.
---

# For traders

On a Trucee token, the trade panel offers two actions before graduation: **Buy** and **Exit at cost**. Every buy records your cost basis. An exit pays that basis back, minus the fee at cost and a 2-lamport haircut, wherever the price is. The amount you would get back right now is shown as **Your floor**. When the curve graduates, exits at cost end, the token becomes freely transferable, and holders split the market's surplus by basis. [How it works](how-it-works.md) explains the mechanism. This page follows the screens of the Trucee web app.

{% hint style="warning" %}
**Status on 2026-10-11.** Trucee runs on Solana devnet only, with router v5. SOL is the only quote token on devnet. The programs are unaudited, and the web app is not public yet (see [Links](links.md)). Trucee's crank has jobs for Auto-Exit, `finalize` and surplus claims. The jobs are merged, and they ran against a devnet market in the end-to-end run below. Registering them in the running crank is in progress (CRK-07), so an unattended run has not been shown yet.
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

## Your floor

**Your floor is what you get back if you exit now:** your cost basis minus the fee you would pay selling at cost, minus a 2-lamport haircut, and never below zero.

```
floor = basis − ceil(basis × fee rate) − 2 lamports
```

This is the router's refund formula (`refund_for`) applied to your whole basis. For example, a basis of 1 SOL at a 1% fee gives a floor of 0.989999998 SOL. The floor does not depend on the price. If the price falls, an exit still pays the floor. If the price rises, an exit still pays only the floor, and the difference stays in the market's buffer for the holders at graduation.

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

Setting a deadline sends one transaction with two instructions:

1. It approves the market's program address (PDA) as the delegate of your token account for that token, for an unlimited amount (`u64::MAX`).
2. It calls the router's `set_auto_exit` with your deadline.

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

### When the deadline passes

Once the on-chain clock reaches your deadline, anyone can send `auto_exit` for your position. It sells your whole position at cost, on the same terms as **Exit at cost**, and clears the deadline. Two differences from a manual exit:

* **The refund stays wrapped.** On a SOL market it lands as wSOL in your wallet's wSOL account. Your next exit in the app unwraps it (see [SOL markets](#exit-at-cost)).
* **It exits everything.** `auto_exit` always exits the whole position.

If the curve graduates before your deadline, nothing is exited (error 6021 `AutoExitCurveComplete`). You keep your tokens, which are now freely transferable, and your share of the surplus. The app hides the Auto-Exit box once the curve has graduated, and after `finalize` the router refuses to set or clear a deadline (error 6010). The approval stays on your token account until you revoke it yourself. The router uses it only in `auto_exit`, which fails once the curve is complete.

{% hint style="info" %}
**The crank needs your quote token account.** `auto_exit` pays the refund into your wallet's quote token account, which must exist. On a SOL market, an exit in the app closes that account, and your next buy creates it again. If the account is missing when your deadline passes, the crank creates it only when the refund is at least 0.25 SOL (its default `MIN_ATA_VALUE_LAMPORTS`) and otherwise skips your position. A skipped position keeps its deadline, and you can still exit it yourself at cost.
{% endhint %}

## Graduation

The curve graduates when its quote reserve reaches the launch's graduation threshold. On the swap that completes the curve, DBC revokes the transfer hook. Then:

* **Exits at cost end.** Nobody can sell into a completed curve. The trade panel's tabs are disabled, and it shows "TOKEN has graduated" and "The curve has closed, so buying and exiting at cost are no longer available here."
* **Your tokens are free.** They are a plain Token-2022 token now, and you can send them or trade them anywhere.
* **The banner** at the top of the token page shows "Hook revoked" and one of two titles:

| Banner title | Meaning |
| --- | --- |
| Graduated — awaiting DAMM v2 migration | The pool has not moved to Meteora DAMM v2 yet. The banner notes that anyone can migrate it at [migrator.meteora.ag](https://migrator.meteora.ag), and that your surplus share can be claimed already |
| Graduated — now trading on DAMM v2 | The token trades in a Meteora DAMM v2 pool. On devnet the banner shows the DAMM v2 pool address. On mainnet, once Trucee is deployed there, it links to **Trade on Meteora** and **Swap on Jupiter** |

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
| Transfers are locked until graduation | A transfer outside the router before graduation (hook `TransferNotViaRouter`) |
| The price moved, try again | A wallet's own guard instruction (Lighthouse) failed because the price moved between preview and execution |
| Not enough balance | Your wallet cannot cover the amount, the network fee or the rent |
| Network is busy, try again | The RPC node rate-limited the request |
| You cancelled the transaction | You rejected it in your wallet |
| Couldn't price this buy. Try again in a moment. | The quote could not be read from the chain |

[Programs reference → Error codes](developers/programs.md#error-codes) lists every router and hook error.

## Proof on devnet

The QA-02 end-to-end run walked one fresh SOL market (graduation threshold 0.3 SOL, 1% fee) through the whole trader journey on router v5 on devnet, on 2026-10-11 from 13:27 to 13:31 UTC. It used the same SDK functions as the app and ran the crank's real jobs one tick at a time against that market. It finished with **13 passed, 0 failed**.

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
| Market | [`DdDWi1hFKSk5D2ErQk9VPUbzRDHwbr2ms7ctUdJPT7tV`](https://explorer.solana.com/address/DdDWi1hFKSk5D2ErQk9VPUbzRDHwbr2ms7ctUdJPT7tV?cluster=devnet) |
| DAMM v2 pool after migration | [`2guf3Tfy5tEv5EDykpY6yyS2cW9TATVSZsfn13Y7Yuni`](https://explorer.solana.com/address/2guf3Tfy5tEv5EDykpY6yyS2cW9TATVSZsfn13Y7Yuni?cluster=devnet) |
| Launch: the transaction that opens the market (step 1) | [`2BK2k34UxVxiZEQsyCrQkjmgwk1k9UntKq4cD2QnDga7BvZt3MVFjfWEmL1ooo93XqsaTYtsiCYdeocDwNbsqiPd`](https://explorer.solana.com/tx/2BK2k34UxVxiZEQsyCrQkjmgwk1k9UntKq4cD2QnDga7BvZt3MVFjfWEmL1ooo93XqsaTYtsiCYdeocDwNbsqiPd?cluster=devnet) |
| Auto-Exit sent by the crank's job (step 7) | [`5VGEs3wYHhF5MC6WMYHHotMH6nGLJiCf9vzvyEEq1VphkK12PKSsMphebjgfgY3vG5DkELALePsuxvWrm5WrmSo3`](https://explorer.solana.com/tx/5VGEs3wYHhF5MC6WMYHHotMH6nGLJiCf9vzvyEEq1VphkK12PKSsMphebjgfgY3vG5DkELALePsuxvWrm5WrmSo3?cluster=devnet) |
| A surplus claim sent by the crank's job (step 11) | [`4jQmiR5ZTLWrWAAcvXpyb2sMebYFLRnyBaSVGSKbKqr8A4ArA2FnwZMhn6WeY7qzGbXqQsGb84CxdTtNygoZxgGL`](https://explorer.solana.com/tx/4jQmiR5ZTLWrWAAcvXpyb2sMebYFLRnyBaSVGSKbKqr8A4ArA2FnwZMhn6WeY7qzGbXqQsGb84CxdTtNygoZxgGL?cluster=devnet) |

`worker/out/e2e-devnet.json` lists every account and signature of the run, step by step.

## Sources

Paths are relative to the root of the Trucee monorepo.

| Claim | Source |
| --- | --- |
| Trade panel: tabs, labels, slippage presets 0.5%, 1% and 3%, the 20% note, the SOL unwrap line, the graduated notice | `app/src/components/trade/trade-panel.tsx` (`SLIPPAGE_PRESETS_BPS`, `ANTI_WHALE_CAP_NOTE`, `SOL_UNWRAP_NOTE`, `GraduatedNotice`) |
| Default slippage 1%, quotes expire after 30 s, position re-read every 10 s and right before an exit, "Before graduation" line | `app/src/components/trade/trade-container.tsx` (`DEFAULT_SLIPPAGE_BPS`, `QUOTE_TTL_MS`, `POSITION_REFETCH_MS`, `exitBuild`, `BEFORE_GRADUATION_COPY`) |
| Minimum output from slippage; buy creates the accounts and wraps SOL; exit closes the wSOL account | `app/src/lib/trade/build-trade.ts` (`minOutFor`, `buildBuyTx`, `buildExitTx`); `sdk/src/instructions.ts` (`buyInstructions`, `sellInstructions`) |
| Floor labels and captions; floor = `refund_for(basis, fee)` | `app/src/components/trade/floor-callout.tsx`; `sdk/src/quote.ts` (`refundFor`, `floorValue`); `zpvp/programs/zpvp_router/src/math.rs` (`refund_for`, `HAIRCUT_PER_EXIT`, `DUST_PER_BUY`, test `refund_matches_python_reference`) |
| Basis, partial exits, buffer, error codes, position rent | [Programs reference](developers/programs.md) (`buy`, `sell`, `claim_surplus`, error codes); `zpvp/programs/zpvp_router/src/lib.rs` |
| Auto-Exit presets, UTC custom deadline from 60 s to one year, consent and cancel copy | `app/src/components/trade/auto-exit-control.tsx` (`PRESETS`, `MIN_LEAD_SECONDS`, `MAX_LEAD_SECONDS`, `approvalNote`, `CANCEL_NOTE`) |
| Set = approve the market PDA for `u64::MAX` + `set_auto_exit`; clear = `set_auto_exit(0)` + revoke | `app/src/lib/trade/build-auto-exit.ts`; `sdk/src/instructions.ts` (`setAutoExitInstructions`); [Programs reference → set_auto_exit](developers/programs.md#set_auto_exit-v5) |
| `auto_exit` rules: whole position, refund to the owner's quote token account, errors 6010, 6020 and 6021; a partial exit keeps the deadline | [Programs reference → auto_exit](developers/programs.md#auto_exit-v5) and [sell](developers/programs.md#sell); `zpvp/programs/zpvp_router/src/lib.rs` (test `a_partial_exit_keeps_the_deadline`) |
| Crank creates a missing quote token account only above 0.25 SOL by default | `worker/src/config.ts` (`DEFAULT_MIN_ATA_VALUE_LAMPORTS`); `worker/src/crank/jobs/auto-exit.ts` and `claims.ts` (CRK-10 headers) |
| Crank jobs merged; registration in the running crank in progress (CRK-07) | `worker/src/crank/jobs/`; `worker/src/index.ts` (`JOBS`, header comment) |
| Graduated banner titles, migration note, claim slab | `app/src/components/token/graduated-banner.tsx` |
| Claim flow: on-chain re-read, "Already claimed", "Not claimable yet", ATA created if missing | `app/src/components/portfolio/portfolio-container.tsx` (`runClaim`, `ALREADY_CLAIMED`, `NOT_FINALIZED`); `app/src/lib/claim/build-claim.ts` |
| Surplus share = `floor(surplusSnapshot × basis ÷ basisSnapshot)`; floor 0 and claimable set once finalized | `app/src/lib/server/positions.ts` (`surplusShare`, `toPositionView`); `zpvp/programs/zpvp_router/src/math.rs` (`surplus_share`) |
| Portfolio columns, states and totals | `app/src/components/portfolio/positions-table.tsx`, `portfolio-summary.tsx`; `app/src/app/portfolio/page.tsx` |
| Error messages | `app/src/lib/tx/error-copy.ts` (`COPY`); `app/src/components/trade/trade-container.tsx` (`QUOTE_FAILED_COPY`) |
| Wallets detected automatically | `app/src/components/providers/app-providers.tsx` (`WALLETS`) |
| QA-02 devnet run: 13 steps, 13 passed, 0 failed; floor and refund 7,350,732; surplus 15,045,373 and claims 15,045,370; market, DAMM v2 pool and signatures | `worker/scripts/e2e-devnet.ts`; `worker/out/e2e-devnet.json` (`summary`, `accounts`, steps 1, 3, 7, 9, 10 and 11) |
