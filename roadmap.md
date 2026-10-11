# Roadmap

Everything on this page except the [Shipped](#shipped) section is **not shipped**. These are features in progress, ideas we have researched, and ideas we cut from the hackathon build. For what Trucee does today, see [How it works](how-it-works.md) and [Security](security.md).

{% hint style="info" %}
Apart from the Shipped section, nothing below is live on any network. A roadmap item has no guarantee of shipping, and its design can change.
{% endhint %}

## Shipped

### Native Referral

Shipped in router v5, live on devnet since the router v5 upgrade (2026-10-11). Without a referrer, the router passes an empty placeholder as the referral account when it calls Meteora DBC's `swap2_with_transfer_hook`. With Native Referral, a buy can pass a referrer's quote token account instead, so the referrer earns a cut of the trading fee on the trades they refer.

DBC pays the referral cut out of the **protocol** fee (20% of the protocol share). The buyer's cost and the exit-at-cost refund do not change. Details: [Programs reference](developers/programs.md).

## In progress

This feature is in the hackathon scope but not merged yet. If it is not merged by the scope freeze (2026-10-12 12:00 UTC), it stays on this roadmap.

### Retention Fee

A smaller variant of the original design. Creators are paid for buyers who hold, not for buyers who flip:

* The market's share of DBC trading fees (80%; the protocol keeps 20%) goes to a Trucee-controlled account instead of the creator.
* After the curve completes, anyone can settle the fees. The creator receives `fees × retention`, where retention is the share of all bought cost basis that is still held at graduation.
* The rest of the fees, and all of DBC's partner surplus, go to holders.
* It is opt-in per market. Markets created before it lands keep their current fee setup.

Known caveat: round-trip flipping lowers the creator's pay, and a creator who buys and holds their own token raises it at the cost of locking up their own capital.

## Planned features

### Zero-Loss Exit

Today an exit before graduation refunds your cost basis minus the trading fee and a small rounding haircut. Zero-Loss Exit would use the partner's share of trading fees to pay back the exit fee, so the most you lose on an exit is roughly the protocol's share of the fee.

It draws on the same fee pot as Retention Fee, so the two cannot both ship.

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

* **Real-pool replay.** Our sniper numbers come from simulated order flow, not from real pools (see [Research & data](research-and-data.md)). Replaying real mainnet DBC pools needs mass mainnet RPC reads and is planned for later.
