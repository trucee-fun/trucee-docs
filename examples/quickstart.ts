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
const LAUNCH_THRESHOLD = 1_000_000_000n // graduate once 1 SOL of quote sits in the curve
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
  const buy = await quoteBuy(connection, market, BUY_AMOUNT)
  const minOut = (buy.tokensOut * (BPS - SLIPPAGE_BPS)) / BPS
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
  if (LAUNCH_THRESHOLD > sol.maxMigrationQuoteThreshold) {
    throw new Error(`Threshold above the router cap of ${formatAmount(sol.maxMigrationQuoteThreshold, sol)}`)
  }
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

/** Re-wraps each planned transaction, adds its extra signers (signers[i] sign transactions[i]), signs. */
async function signLaunchPlan(
  plan: LaunchPlan,
  creator: PublicKey,
  sign: SignTransaction,
  recent: BlockhashWithExpiryBlockHeight,
): Promise<Transaction[]> {
  const signed: Transaction[] = []
  for (const [i, planned] of plan.transactions.entries()) {
    const tx = toTransaction(creator, recent, planned.instructions)
    const extraSigners = plan.signers[i] ?? []
    if (extraSigners.length > 0) tx.partialSign(...extraSigners)
    signed.push(await sign(tx)) // one at a time, like wallet prompts
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

  const launchTxs = await signLaunchPlan(await buildLaunch(user.publicKey), user.publicKey, sign, recent)
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
