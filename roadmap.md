# Roadmap

Everything on this page except the [Shipped](#shipped) section is **not shipped**. These are features in progress, ideas we have researched, and ideas we cut from the hackathon build. For what Trucee does today, see [How it works](how-it-works.md) and [Security](security.md).

{% hint style="info" %}
Apart from the Shipped section, nothing below is live on any network. A roadmap item has no guarantee of shipping, and its design can change.
{% endhint %}

## Shipped

Devnet runs the default build of [trucee-programs main](https://github.com/trucee-fun/trucee-programs), upgraded in slot 510258390: router v5 plus the 1% launch fee cap (`FeeTooHigh`, 6024). The router is 439,912 bytes, sha256 `38b88ec9db9bdec6d3810247d8c54220651fcbf1372585dbd20838594b63f041`; the hook is unchanged, sha256 `1525c836…`. Mainnet is not deployed. The planned release uses these two default builds (see [Security → Upgrade authority](security.md#upgrade-authority) for full hashes and the deployment signature). Its on-chain features:

* **Core:** cost basis per position, exit at cost before graduation from a per-market buffer (minus the fee at cost and a 2-lamport haircut), the surplus split at graduation, and the transfer hook that keeps every pre-graduation trade inside the router.
* **Auto-Exit:** set a deadline, and if the curve has not graduated by then, anyone can exit your whole position at cost before graduation for you.
* **Anti-Whale cap:** no buy may leave one position above 20% of the curve's sale supply.
* **Native Referral:** a buy may name a referrer (see below).
* **Preset checks:** `init_market` opens a market only for a config with no creator allocation, dynamic supply, permanently locked liquidity, DAMM v2 migration with no migration fee, and an immutable token authority.
* **Launch fee cap:** `init_market` rejects static fees above 1% with `FeeTooHigh` (6024). Auto-Exit, the 20% Anti-Whale cap, Native Referral and preset checks are unchanged from v5.

[How it works](how-it-works.md) describes each of them.

### Native Referral

Without a referrer, the router passes an empty placeholder as the referral account when it calls Meteora DBC's `swap2_with_transfer_hook`. With Native Referral, a buy can pass a referrer's quote token account instead, so the referrer earns a cut of the trading fee on the trades they refer. In the web app, a token page link with `?ref=<wallet>` names that wallet as the referrer (see [For traders → Referral links](traders.md#referral-links)).

DBC pays the referral cut out of the **protocol** fee (20% of the protocol share). The buyer's cost and the exit-at-cost refund do not change. Details: [Programs reference](developers/programs.md).

## In progress

The hackathon's on-chain scope is router v5 plus the fee cap above. Retention Fee, the last router feature in that scope, was cut before the scope freeze (2026-10-12 12:00 UTC); see [Research](#research). What is still in progress:

* **Devnet hosting.** The web app and the crank are being set up on AWS for a public devnet demo. Nothing is publicly hosted yet; today they run locally against devnet.
* **A verifiable mainnet build.** The reproducible `solana-verify` builds of both programs exist (router sha256 `370c0756…`, hook `1dbde487…`, see [Security](security.md#upgrade-authority)). What remains is the mainnet deploy and `solana-verify verify-from-repo` against the public repository.
* **Mainnet deploy.** The planned release uses the current default router with the 1% fee cap and the unchanged hook, with the same program IDs as devnet. Neither program is on mainnet yet.

## Planned features

### Zero-Loss Exit

Today an exit before graduation refunds your cost basis minus the fee at cost and a 2-lamport haircut. Zero-Loss Exit would use the partner's share of trading fees to pay back the exit fee, so the most you lose on an exit is roughly the protocol's share of the fee.

It would draw on the same fee pot as Retention Fee (see [Research](#research)), so the two cannot both ship.

### Wallet-Native Basis

Today Trucee tokens cannot be sent between wallets before graduation: the transfer hook only allows transfers that go through the Trucee router. Wallet-Native Basis would let the hook move your cost basis along with your tokens on a plain wallet transfer.

Our research (2026-10-06) found it technically feasible, with open problems:

* **Basis stripping.** Rounding when basis moves with a transfer could leave the refund buffer insolvent. The fix is to round against both sides and burn the remainder.
* **Trustless OTC.** A seller and buyer could settle an off-curve sale atomically (a Jito bundle with an assertion program). This cannot be blocked on-chain, and it applies to **any** pre-graduation transfer design, including a transfer-with-basis instruction in the router.
* **Auto-Exit griefing.** Sending extra tokens to someone could break their Auto-Exit approval. The fix is an unlimited (`u64::MAX`) delegate approval.
* **Wallet compatibility.** Phantom adds Lighthouse instructions to transactions, which fail an instruction whitelist.

Because any pre-graduation transfer path reopens PvP, Trucee tokens are non-transferable until graduation by design.

### Blinks

Solana Actions that let people buy, or exit at cost, straight from a post on X. Cut on 2026-10-11 so that the web app is the one surface we finish for the hackathon.

### Leftover to Holders

Unsold tokens left on the curve at migration would be claimed by a Trucee account and shared among holders pro rata by cost basis, the same way the buffer surplus is shared today.

Cut on 2026-10-11. Trucee's preset uses a dynamic token supply, and with that preset DBC burns all unsold tokens at migration, so there is nothing left to share. Making it work would need a fixed-supply preset, two new instructions and a DAMM v2 pool in the test environment.

### Ideas without a design yet

These ideas are listed in our plan by name only. They have no specification, code or tests yet:

* **Borrow Your Floor**
* **Fair Start**, built on DBC's activation point and batching
* **Protected Fractionalization**
* **Graduation Raise**, framed for real-world assets (RWA)

## Research

### Retention Fee

Retention Fee: researched and built to a security review; the review found the push-based settle could let a creator block holders' surplus, so it was cut; the known fix is a pull model (creator claims, finalize snapshots buffer minus owed).

The idea is to pay creators for buyers who hold, not for buyers who flip:

* The market's share of DBC trading fees (80%; the protocol keeps 20%) would go to a Trucee-controlled account instead of the creator.
* After the curve completes, the creator would be owed `fees × retention`, where retention is the share of all bought cost basis that is still held at graduation.
* The rest of the fees, and all of DBC's partner surplus, would go to holders.

In the reviewed design, a settle step pushed the creator's pay straight to the creator's token account. A creator can make that transfer fail forever, so settling never succeeds, and the surplus could never be finalized for holders. The pull model fixes this: settling only records what the creator is owed, the creator claims it with a separate instruction, and `finalize` snapshots the buffer minus what is still owed. None of this code is in the router source or on any network.

Known caveat of the idea itself: round-trip flipping lowers the creator's pay, and a creator who buys and holds their own token raises it at the cost of locking up their own capital.

### Real-pool replay

Our sniper numbers come from simulated order flow, not from real pools (see [Research & data](research-and-data.md)). Replaying real mainnet DBC pools needs mass mainnet RPC reads and is planned for later.
