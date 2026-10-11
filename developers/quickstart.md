---
description: >-
  Install @trucee/sdk, then use one typechecked TypeScript file to read Trucee
  markets, quote a buy and your floor, and build buy, exit and launch
  transactions on devnet.
---

# Quickstart

This page walks through one TypeScript file that uses `@trucee/sdk` on Solana devnet. The file:

1. reads the Trucee markets;
2. quotes a buy and builds the buy transaction;
3. shows your floor (what an exit at cost refunds) and builds the exit transaction;
4. builds a launch plan for a new token.

It reads accounts and builds and signs transactions in memory. It never sends a transaction and reads no secret key: the signer is a keypair it generates on the spot.

The file is `gitbook/examples/quickstart.ts` in the Trucee source, and this page embeds it verbatim. It typechecks against the SDK's public API with `cd gitbook/examples && npm ci && npx tsc --noEmit`.

{% hint style="warning" %}
**Status:** the Trucee programs run on Solana devnet only. They are unaudited and not deployed to mainnet. `@trucee/sdk` is not published to the npm registry and the source repository is not public yet (see [Links](../links.md)), so for now you install the SDK from a checkout of the source.
{% endhint %}

{% hint style="info" %}
**What works today.** Every SDK call in the example is implemented, and the SDK's public API is pinned by its contract test (`sdk/test/contract.test.ts`).

The SDK also has Auto-Exit builders (`setAutoExitInstructions` and `autoExitInstruction`). Auto-Exit runs on devnet since the router v5 upgrade. This quickstart leaves it out to stay short; the [Programs reference](programs.md) documents both instructions.
{% endhint %}

## Install

You need a checkout of the Trucee source and Node.js 22.18 or later: the example runs the `.ts` file directly with Node's built-in type stripping, so it needs no TypeScript runner.

From the root of the checkout, build the SDK first. Your project imports its compiled `dist/` folder.

```bash
npm --prefix sdk ci
npm --prefix sdk run build
```

Then install, typecheck and run the example:

```bash
cd gitbook/examples
npm ci
npx tsc --noEmit                         # or: npm run typecheck
npm run quickstart                       # reads devnet, sends nothing
npm run quickstart -- <wallet address>   # also shows that wallet's floor and builds its exit
```

### In your own project

Depend on the SDK folder and install its peer dependencies yourself, on the ranges in `sdk/package.json`:

```json
{
  "type": "module",
  "dependencies": {
    "@trucee/sdk": "file:../path/to/sdk",
    "@meteora-ag/dynamic-bonding-curve-sdk": "^1.5.13",
    "@solana/spl-token": "^0.4.15",
    "@solana/web3.js": "^1.99.0",
    "bn.js": "^5.2.5",
    "buffer": "^6.0.3"
  }
}
```

* The SDK is an ES module (`"type": "module"` with import-only `exports`), so import it from ES module code or through a bundler.
* npm installs a `file:` dependency as a symlink. Node and TypeScript then resolve the SDK's own imports (`@solana/web3.js` and its other peers) from the SDK folder's `node_modules`, which exists once you have built the SDK, so your script can load two copies of `@solana/web3.js`. TypeScript treats two copies of the same version as one package, and the SDK's builders accept public keys from either copy, so the example works this way. An `instanceof` check between an SDK object and your own import fails, though.
* For a single copy, install the SDK as a packed copy instead of a symlink with `npm install --install-links`, and re-run it after every SDK rebuild.
* The example's `tsconfig.json` sets `preserveSymlinks` and its `quickstart` script runs Node with `--preserve-symlinks`: if the SDK folder has no `node_modules`, the SDK's imports then resolve from the example's own.
* Every token and quote amount in the SDK is a `bigint` in raw base units (lamports for SOL).

## The example

{% code title="gitbook/examples/quickstart.ts" lineNumbers="true" %}
```typescript
/**
 * Trucee developer quickstart: gitbook/developers/quickstart.md embeds this file verbatim.
 * Reads devnet markets, quotes a buy and the floor, builds buy and exit transactions and a launch plan.
 *
 * It only reads devnet accounts and builds and signs transactions in memory. It never sends a
 * transaction and reads no secret: the signer is a Keypair generated on the spot.
 *
 *   npm run quickstart                       # the generated keypair has no position yet
 *   npm run quickstart -- <wallet address>   # floor and exit transaction for any wallet
 */
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  type BlockhashWithExpiryBlockHeight,
  type TransactionInstruction,
} from '@solana/web3.js'
import {
  buildLaunchPlan,
  buyInstructions,
  decodeTxError,
  fetchAllMarkets,
  fetchPositionsByOwner,
  floorValue,
  getClusterConfig,
  marketAccountsFor,
  quoteBuy,
  quoteExit,
  sellInstructions,
  type LaunchPlan,
  type MarketAccount,
  type QuoteMintInfo,
} from '@trucee/sdk'

// Placeholder public endpoint: use your own RPC provider for anything beyond a quick test.
const RPC_URL = 'https://api.devnet.solana.com'
const BUY_AMOUNT = 10_000_000n // 0.01 SOL in lamports: SDK amounts are bigints in raw base units
const SLIPPAGE_BPS = 100n // accept up to 1% fewer tokens than quoted
const BPS = 10_000n
const QUOTE_TOLERANCE = 1n // quoteBuy's tokensOut can be 1 raw unit above what the buy receives on-chain
const LAUNCH_THRESHOLD = 1_000_000_000n // graduate at 1 SOL in the curve (the router caps SOL at 10)
const LAUNCH_FEE_BPS = 100 // 1% trading fee

const cluster = getClusterConfig('devnet') // program ids and allowed quote mints (devnet: SOL only)
const connection = new Connection(RPC_URL, 'confirmed')

/** Same shape as a wallet adapter's `signTransaction`, so either can sign. */
type SignTransaction = (tx: Transaction) => Promise<Transaction>

/** Local signer for scripts. In a browser app, pass `useWallet().signTransaction` instead. */
const keypairSigner =
  (keypair: Keypair): SignTransaction =>
  async (tx) => {
    tx.partialSign(keypair)
    return tx
  }

/** A fresh legacy transaction with the fee payer, a recent blockhash and the instructions. */
function toTransaction(
  feePayer: PublicKey,
  recent: BlockhashWithExpiryBlockHeight,
  instructions: readonly TransactionInstruction[],
): Transaction {
  return new Transaction({ feePayer, ...recent }).add(...instructions)
}

/** Symbol, decimals and token program of a market's quote mint, from the cluster allowlist. */
function quoteOf(market: MarketAccount): QuoteMintInfo {
  const quote = cluster.quoteMints.find((info) => info.mint.equals(market.quoteMint))
  if (quote === undefined) {
    throw new Error(`Quote mint ${market.quoteMint.toBase58()} is not allowed on ${cluster.cluster}`)
  }
  return quote
}

/** Raw quote units to a readable amount, e.g. 10_000_000n lamports -> "0.01 SOL". */
function formatAmount(raw: bigint, quote: QuoteMintInfo): string {
  const base = 10n ** BigInt(quote.decimals)
  const fraction = (raw % base).toString().padStart(quote.decimals, '0').replace(/0+$/, '')
  const whole = raw / base
  return `${fraction === '' ? whole : `${whole}.${fraction}`} ${quote.symbol}`
}

/** Optional CLI argument: a wallet address (public, not a secret) whose floor you want to see. */
function ownerFromArgs(fallback: PublicKey): PublicKey {
  const arg = process.argv[2]
  if (arg === undefined) return fallback
  try {
    return new PublicKey(arg)
  } catch {
    throw new Error(`Not a wallet address: ${arg}`)
  }
}

/** 1. Read markets: every router Market account. A finalized market has graduated. */
async function readMarkets(): Promise<MarketAccount[]> {
  const markets = await fetchAllMarkets(connection, cluster.routerProgramId)
  const open = markets.filter((market) => !market.finalized)
  console.log(`${markets.length} markets on ${cluster.cluster}, ${open.length} not finalized`)
  return markets
}

/** 2. Quote a buy, then build it: create the ATAs, wrap SOL, router buy with a minimum output. */
async function buildBuy(
  market: MarketAccount,
  user: PublicKey,
  recent: BlockhashWithExpiryBlockHeight,
): Promise<Transaction> {
  const quote = quoteOf(market)
  const buy = await quoteBuy(connection, market, BUY_AMOUNT) // throws once the curve is complete
  const expected = buy.tokensOut > QUOTE_TOLERANCE ? buy.tokensOut - QUOTE_TOLERANCE : 0n
  const minOut = (expected * (BPS - SLIPPAGE_BPS)) / BPS
  const amount = (raw: bigint): string => formatAmount(raw, quote)
  console.log(`buy ${amount(BUY_AMOUNT)}: ${buy.tokensOut} tokens (raw), fee ${amount(buy.fee)}`)
  console.log(`  into the curve ${amount(buy.netIntoCurve)}, cost basis +${amount(buy.basisAdded)}`)
  const instructions = buyInstructions({
    cluster,
    accounts: marketAccountsFor(market, quote.tokenProgram),
    user,
    amountIn: BUY_AMOUNT,
    minOut,
  })
  return toTransaction(user, recent, instructions)
}

/** 3. Floor and exit at cost: the refund for a whole position before graduation, and the sell. */
async function buildExit(
  markets: readonly MarketAccount[],
  owner: PublicKey,
  recent: BlockhashWithExpiryBlockHeight,
): Promise<Transaction | null> {
  const positions = await fetchPositionsByOwner(connection, owner, cluster.routerProgramId)
  const open = positions.flatMap((position) => {
    const market = markets.find((m) => m.address.equals(position.market) && !m.finalized)
    return market !== undefined && position.tokens > 0n ? [{ position, market }] : []
  })
  for (const { position, market } of open) {
    const floor = formatAmount(floorValue(position, market), quoteOf(market))
    console.log(`your floor in ${market.address.toBase58()}: ${floor}`)
  }
  const first = open[0]
  if (first === undefined) {
    console.log(`${owner.toBase58()} has no open position: nothing to exit`)
    return null
  }
  const { position, market } = first
  const quote = quoteOf(market)
  const exit = quoteExit(position, market, position.tokens)
  const amount = (raw: bigint): string => formatAmount(raw, quote)
  console.log(`exit ${position.tokens} tokens: basis ${amount(exit.basisPart)}`)
  console.log(`  - fee at cost ${amount(exit.feeAtCost)} - haircut = refund ${amount(exit.refund)}`)
  const instructions = sellInstructions({
    cluster,
    accounts: marketAccountsFor(market, quote.tokenProgram),
    user: owner,
    tokens: position.tokens,
    unwrapSol: true, // close the wSOL account afterwards, so the refund lands as plain SOL
  })
  return toTransaction(owner, recent, instructions)
}

/** 4. Launch plan: the transactions that create the DBC config, the pool and the router market. */
async function buildLaunch(creator: PublicKey): Promise<LaunchPlan> {
  const sol = cluster.quoteMints.find((info) => info.symbol === 'SOL')
  if (sol === undefined) throw new Error(`SOL is not a quote mint on ${cluster.cluster}`)
  const plan = await buildLaunchPlan({
    connection,
    cluster,
    creator,
    name: 'Quickstart Token',
    symbol: 'QUICK',
    uri: 'https://example.com/quickstart-token.json', // token metadata JSON
    preset: {
      quote: sol,
      migrationQuoteThreshold: LAUNCH_THRESHOLD,
      feeBps: LAUNCH_FEE_BPS,
      feeClaimer: creator,
      leftoverReceiver: creator,
    },
  })
  console.log(`launch plan: ${plan.transactions.length} transactions, mint ${plan.baseMint.toBase58()}`)
  console.log(`  pool ${plan.pool.toBase58()}, market ${plan.market.toBase58()}`)
  return plan
}

/** The plan sets the creator as fee payer and a recent blockhash; signers[i] co-sign transactions[i]. */
async function signLaunchPlan(plan: LaunchPlan, sign: SignTransaction): Promise<Transaction[]> {
  const signed: Transaction[] = []
  for (const [i, tx] of plan.transactions.entries()) {
    const extraSigners = plan.signers[i] ?? []
    if (extraSigners.length > 0) tx.partialSign(...extraSigners) // the new config and mint keypairs
    signed.push(await sign(tx)) // one at a time, in order: they must also be sent in this order
  }
  return signed
}

async function main(): Promise<void> {
  const user = Keypair.generate() // throwaway signer: never funded, nothing is sent
  const owner = ownerFromArgs(user.publicKey)
  const sign = keypairSigner(user)
  const recent = await connection.getLatestBlockhash()

  const markets = await readMarkets()
  const target = markets.find((market) => !market.finalized)
  if (target !== undefined) {
    const buyTx = await sign(await buildBuy(target, user.publicKey, recent))
    console.log(`buy transaction: ${buyTx.instructions.length} instructions, signed, not sent`)
  }

  const exitTx = await buildExit(markets, owner, recent)
  if (exitTx !== null) {
    console.log(`exit transaction: ${exitTx.instructions.length} instructions, for the owner to sign`)
  }

  const launchTxs = await signLaunchPlan(await buildLaunch(user.publicKey), sign)
  console.log(`launch: ${launchTxs.length} transactions signed, not sent`)
}

try {
  await main()
} catch (err: unknown) {
  // Readable router, hook, DBC, Anchor and wallet errors; null for anything else (e.g. network).
  const decoded = decodeTxError(err)
  const code = decoded?.code ?? '-'
  console.error(decoded === null ? err : `${decoded.program} ${code} ${decoded.name}: ${decoded.message}`)
  process.exitCode = 1
}
```
{% endcode %}

## Step by step

### Connect

`getClusterConfig('devnet')` returns the frozen addressing config of a cluster: the Trucee router (`D4sk6wwELD6cmd7tv6hE4hkxQP8SF8tjdegYym8iWNNb`), the Trucee transfer hook (`CUNNV1MqVB53N4jWn91uVFXm1dBSyaynR6iBCbufJWMS`), Meteora DBC (`dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN`) and the quote mints a market may use, each as a `QuoteMintInfo` (symbol, mint, decimals, token program, graduation cap). Devnet allows SOL only. The `mainnet-beta` config also lists the xStocks TSLAx and NVDAx, but the Trucee programs are not deployed to mainnet yet.

`https://api.devnet.solana.com` is a placeholder public endpoint. Use your own RPC provider for anything beyond a quick test.

### 1. Read markets

`fetchAllMarkets(connection, routerProgramId)` returns every router `Market` account (one per DBC pool) from a single `getProgramAccounts` call. A `MarketAccount` holds the pool, config, base and quote mints, the pool's vaults, the market's `bufferVault`, the DBC fee as `feeNumerator` (parts per 1,000,000,000), the open cost basis `totalBasis` and the graduation snapshot fields. To load one market by address, use `fetchMarket(connection, address)`; it resolves `null` when the account does not exist.

`finalized` tells you that a market has graduated: the router's `finalize` only succeeds once the curve is complete (otherwise it fails with error 6009 `CurveNotComplete`). The example buys into the first market that is not finalized.

### 2. Quote a buy and build it

`quoteBuy(connection, market, amountIn)` quotes a router buy of `amountIn` quote units. It reads the market's DBC pool and config, checks that they belong together and collect the fee in the quote token, and runs the DBC SDK's partial-fill swap quote, the same swap mode the router uses. It returns:

* `tokensOut`: the tokens you receive;
* `fee`: the trading fee, charged on the input;
* `netIntoCurve`: the quote that enters the curve (`amountIn − fee` when the buy fills completely);
* `basisAdded`: the cost basis the buy adds to your position. The router records the quote that entered the curve minus 16 base units (`DUST_PER_BUY`), which absorbs DBC's rounding (`zpvp/programs/zpvp_router/src/math.rs`).

On the buy that completes the curve, DBC takes only the input it needs, and `fee` and `netIntoCurve` cover just that part. Once the curve is complete `quoteBuy` throws, because buys are closed (`sdk/src/quote.ts`).

DBC rounds in the pool's favour, so `tokensOut` can be 1 raw unit above what the buy receives on-chain (the tolerance in `sdk/test/quote.test.ts`). The example takes that unit off before it applies its 1% slippage, so `minOut` always stays below the quote. It then calls `buyInstructions`, which returns, in order:

1. the idempotent creation of your quote token account and of your Token-2022 base token account;
2. for a SOL quote, a transfer of exactly `amountIn` lamports into your wSOL account and a `syncNative`;
3. the router's `buy(amountIn, minOut)`.

`marketAccountsFor(market, quoteTokenProgram)` turns a `MarketAccount` into the account set that the buy, sell and claim builders take. The quote token program comes from the cluster's quote-mint list (`QuoteMintInfo.tokenProgram`).

{% hint style="info" %}
**Always go through the router.** Before graduation the Trucee transfer hook rejects every transfer of the token whose top-level instruction is not the router (hook error 6000 `TransferNotViaRouter`). A direct DBC swap, an aggregator route or a wallet-to-wallet transfer fails. For the same reason a CPI into the router from your own program fails: put the router instruction at the top level of the transaction.
{% endhint %}

### 3. Your floor and exit at cost

`fetchPositionsByOwner(connection, owner)` returns a wallet's router `Position` accounts (one per market and owner) with `tokens` and `basis`.

`quoteExit(position, market, tokens)` returns what an exit of `tokens` refunds. It throws a `RangeError` when `tokens` is 0 or above the position, the case where the router fails with `InvalidExitAmount`. Each field follows the router's refund rule in `zpvp/programs/zpvp_router/src/math.rs`:

| Field | Router rule |
| --- | --- |
| `basisPart` | The cost basis of the tokens sold: pro rata to the position, rounded down. An exit of the whole position takes all of its remaining basis. |
| `feeAtCost` | `ceil(basisPart × feeNumerator / 1,000,000,000)`: the trading fee you would pay selling at cost. |
| `refund` | `basisPart − feeAtCost − 2` (`HAIRCUT_PER_EXIT`), never below zero. |

`floorValue(position, market)` is the `refund` for the whole position: what exiting everything at cost pays before graduation. For example, a cost basis of 1,000,000,000 lamports (1 SOL) at a 1% fee (`feeNumerator` 10,000,000) refunds 989,999,998 lamports (router unit test `refund_matches_python_reference` in `math.rs`).

`sellInstructions` builds the router's `sell(tokens)`. The router sells the tokens into the curve, parks the proceeds in the market's buffer and pays `refund` from the buffer to your quote token account. With `unwrapSol: true` and a SOL quote it then closes your wSOL account, so the refund arrives as SOL. The position's owner must sign, so when you pass another wallet's address the example leaves the exit transaction unsigned.

### 4. Build a launch plan

`buildLaunchPlan(params)` returns three transactions to send in this order, together with the new `config`, `pool`, `baseMint` and `market` addresses:

1. create the DBC config (extra signer: a new config keypair);
2. create the DBC pool with the token's `name`, `symbol` and `uri` metadata (extra signer: the new base mint keypair);
3. write the hook's extra-account list and open the router market, plus the creator's first buy when you pass `initialBuy` (it is then the pool's first possible trade).

Every transaction already has the creator as fee payer and a recent blockhash, and fits in one packet. `signers[i]` are the extra signers of `transactions[i]`: the example adds them, then lets the creator sign. Metadata limits are 32 bytes for `name`, 10 for `symbol` and 200 for `uri` (`sdk/src/launch.ts`).

The `preset` options describe the Zero-PvP DBC config:

| Option | Meaning |
| --- | --- |
| `quote` | A `QuoteMintInfo` from the cluster config (on devnet: SOL). |
| `migrationQuoteThreshold` | The quote raised at which the curve graduates, in raw units. The router caps it per quote mint (`QUOTE_CAPS`): 10 SOL, 5 TSLAx or 10 NVDAx. The SDK throws above the cap. |
| `feeBps` | The static trading fee in basis points: `feeNumerator = feeBps × 100,000`, so 100 bps is 10,000,000 (1%). |
| `feeClaimer`, `leftoverReceiver` | The DBC config's fee claimer and leftover receiver. Both must be wallet addresses; the SDK rejects a PDA. |
| `totalTokenSupply` | Optional, in raw units of the 6-decimal base token. Default: 1,000,000,000 tokens. |
| `percentageSupplyOnMigration` | Optional. Default: 20% of the supply. |

The preset gives the creator no token allocation (no locked vesting), migrates to a Meteora DAMM v2 pool and locks all of the migrated liquidity permanently. If you create configs with your own DBC tooling, `buildZeroPvpConfigParameters(preset)` returns just the DBC `ConfigParameters`.

The router only opens a market for a config that:

* uses the Trucee transfer hook (error 6013 `WrongTransferHook`);
* charges a static fee collected in the quote token, with no fee scheduler, rate limiter or dynamic fee (error 6014 `UnsupportedFeeConfig`);
* uses an allowlisted quote mint (error 6017 `QuoteMintNotAllowed`) with a threshold at or below its cap (error 6018 `ThresholdTooHigh`).

### Sign

`SignTransaction` has the same shape as a wallet adapter's `signTransaction`. The example signs with `keypairSigner`, a local keypair; in a browser app you pass `useWallet().signTransaction` from the Solana wallet adapter instead. The example stops there. To go live, send the signed transactions with your usual `@solana/web3.js` flow, the launch transactions in the order of the plan.

## Errors

`decodeTxError(err)` maps a failed send or simulation to `{ program, code, name, message }`, where `program` is `router`, `hook`, `dbc`, `wallet` or `unknown`. It reads web3.js `SendTransactionError`s, simulation logs, `InstructionError` results and wallet-adapter errors (including a rejection in the wallet), and returns `null` for anything it does not recognise, such as a network error. The codes you are most likely to meet:

| Program | Code | Name | Message |
| --- | --- | --- | --- |
| hook | 6000 | `TransferNotViaRouter` | Pre-graduation transfers must go through the Zero-PvP router |
| router | 6007 | `InvalidExitAmount` | Exit amount must be > 0 and <= position |
| router | 6009 | `CurveNotComplete` | Curve is not complete yet |
| router | 6015 | `BufferInsufficient` | Buffer cannot cover the refund |
| router | 6017 | `QuoteMintNotAllowed` | Mainnet beta: quote mint is not on the allowlist |
| router | 6018 | `ThresholdTooHigh` | Mainnet beta: migration quote threshold above the cap |
| router | 6022 | `PositionCapExceeded` | Buy would exceed the anti-whale cap (20% of curve supply) |

The full tables are `ROUTER_ERRORS` and `HOOK_ERRORS` in `sdk/src/errors.ts`.

{% hint style="info" %}
`PositionCapExceeded` comes from the Anti-Whale cap, which runs on devnet since the router v5 upgrade. A buy that would leave your position above 20% of the curve's sale supply fails with it.
{% endhint %}

## After graduation

When the swap that completes the curve runs, DBC revokes the transfer hook and the token trades freely. Two more builders, both implemented and permissionless, settle the buffer:

* `finalizeInstruction({ cluster, market, pool, bufferVault })` snapshots the buffer surplus and the open cost basis once the curve is complete.
* `claimSurplusInstruction({ cluster, accounts, cranker, owner })` pays a holder's share of the surplus. Anyone can sign as `cranker`; the share always goes to the owner's canonical quote token account and the position's rent to the owner.

`parseRouterEvents(logs)` decodes the router's events from a transaction's log messages: `BuyEvent`, `SellEvent`, `ClaimEvent` and `FinalizeEvent`, plus `AutoExitSetEvent` and `AutoExitEvent` from Auto-Exit.

## Next steps

* [How it works](../how-it-works.md): the mechanism and the refund math.
* [Programs reference](programs.md): the router and hook programs.
* [Security](../security.md): invariants, tests and known limitations.
