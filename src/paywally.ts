import { EncryptedDirectMessage } from 'nostr-tools/kinds'
import {
  getEncodedTokenV4,
  type MeltQuoteBolt11Response,
  type MintQuoteBolt11Response,
  MintQuoteState,
  Wallet,
} from '@cashu/cashu-ts'
import { finalizeEvent, generateSecretKey, getPublicKey, nip04, SimplePool, type UnsignedEvent } from 'nostr-tools'

const maxAttempts = 60
const delayBetweenAttemptsMs = 5000

interface LnurlpResponse {
  tag: string
  minSendable: number
  maxSendable: number
  callback: string
}

interface InvoiceResponse {
  pr: string
}

export interface PaywallyOptions {
  npubkey: string
  mintUrl: string
  myLnurl: string
  feeSats: number
  paySats: number
  withLog: boolean
  nrelays: string[]
}

/**
 * Paywally class to handle payment and change token sending via Nostr
 */
export class Paywally {
  readonly wallet: Wallet
  readonly options: PaywallyOptions

  meltQuote: MeltQuoteBolt11Response | null = null
  mintQuote: MintQuoteBolt11Response | null = null

  private constructor(
    wallet: Wallet,
    options: PaywallyOptions,
    onInvoice?: (invoice: string) => void,
    onPayment?: (paid: boolean) => void,
    onError?: (error: string) => void
  ) {
    this.options = options
    this.wallet = wallet

    const handleError = (error: unknown) => {
      if (onError) onError(error instanceof Error ? error.message : String(error))
    }

    if (onInvoice) {
      this.getInvoice()
        .then((invoice) => {
          if (onInvoice) onInvoice(invoice)
          if (onPayment) this.waitForPayment().then(onPayment).catch(handleError)
        })
        .catch(handleError)
    }
  }

  /**
   * Create a Paywally instance
   *
   * @example
   *
   * const onInvoice = (invoice: string) => { ...show invoice to user... }
   * const onPayment = (paid: boolean) => { ...unlock content to user... }
   * const onError = (error: string) => { ...show throw error to user... }
   *
   * // options for Paywally
   * const options: PaywallyOptions = {
   *   npubkey: '62cef883863022a4f1d60d54857c9d729650702c9fe227b0988c0b6e36c4bcce',
   *   nrelays: ['wss://relay.damus.io', 'wss://relay.primal.net'],
   *   mintUrl: 'https://mint.coinos.io',
   *   myLnurl: 'bordalix@coinos.io',
   *   paySats: 21, // consumer facing amount in sats
   *   feeSats: 3, // reserved network fees in sats
   *   withLog: true,
   * }
   *
   * // using callbacks
   * Paywally.create(options, onInvoice, onPayment, onError)
   *
   * // using async/await
   * try {
   *   const paywally = await Paywally.create(options)
   *   onInvoice(await paywally.getInvoice())
   *   onPayment(await paywally.waitForPayment())
   * } catch (error) {
   *   onError(error)
   * }
   *
   * @param options required
   * @param onInvoice optional
   * @param onPayment optional
   * @param onError optional
   * @returns Paywally instance
   */
  static async create(
    options: PaywallyOptions,
    onInvoice?: (invoice: string) => void,
    onPayment?: (paid: boolean) => void,
    onError?: (error: string) => void
  ): Promise<Paywally> {
    // validate options
    const { feeSats, npubkey, nrelays, mintUrl, myLnurl, paySats } = options
    if (!npubkey) throw new Error('npubkey is required')
    if (!nrelays) throw new Error('nrelays is required')
    if (!mintUrl) throw new Error('mintUrl is required')
    if (!myLnurl) throw new Error('myLnurl is required')
    if (!paySats) throw new Error('paySats is required')
    if (!feeSats) throw new Error('feeSats is required')

    // test npubkey length
    if (npubkey.length !== 64) throw new Error('Invalid npubkey')

    // test nrelays array
    if (!Array.isArray(nrelays) || nrelays.length === 0) {
      throw new Error('nrelays must be a non-empty array of relay URLs')
    }

    // test myLnurl format is a lnurlp (user@host)
    const lnurlParts = myLnurl.split('@')
    if (lnurlParts.length !== 2 || !lnurlParts[0] || !lnurlParts[1]) {
      throw new Error('myLnurl must be in the format user@host')
    }

    // test paySats and feeSats
    if (paySats <= 0) throw new Error('paySats must be greater than 0')
    if (feeSats <= 0) throw new Error('feeSats must be greater than 0')
    if (paySats <= feeSats) throw new Error('paySats must be greater than feeSats')

    // create wallet
    const wallet = new Wallet(mintUrl)
    await wallet.loadMint() // wallet is now ready to use
    return new Paywally(wallet, options, onInvoice, onPayment, onError)
  }

  /**
   * Fetch receiver's invoice and create mint & melt quotes
   * @returns mint invoice (string)
   */
  async getInvoice(): Promise<string> {
    // fetch receiver's invoice
    const invoice = await this.getReceiverInvoice()
    if (!invoice) throw new Error("Unable to get receiver's invoice")

    // create melt quote
    this.meltQuote = await this.wallet.createMeltQuoteBolt11(invoice)
    if (!this.meltQuote) throw new Error('Failed to melt invoice: meltQuote not present')
    this.debug('meltQuote', this.meltQuote)

    // check fees are covered
    if (this.options.feeSats <= this.meltQuote.fee_reserve) {
      throw new Error('Not enough fees reserved to cover network fees')
    }

    // create mint quote
    this.mintQuote = await this.wallet.createMintQuoteBolt11(this.options.paySats)
    this.debug('mintQuote', this.mintQuote)

    // return invoice to be paid by user
    this.debug('invoice to pay', this.mintQuote.request)
    return this.mintQuote.request
  }

  /**
   * Wait for payment of the invoice
   * @returns if payment was made (boolean)
   */
  async waitForPayment(): Promise<boolean> {
    // validate quotes
    if (!this.meltQuote) throw new Error('meltQuote not present in waitForPayment')
    if (!this.mintQuote) throw new Error('mintQuote not present in waitForPayment')
    // initialize attempts counter
    let attempts = 0
    // wait for invoice to be paid
    while (true) {
      if (attempts >= maxAttempts) throw new Error('Payment timeout')
      attempts++
      this.debug("checking quote's state")
      const mintQuote = await this.wallet.checkMintQuoteBolt11(this.mintQuote.quote)
      if (mintQuote.state === MintQuoteState.PAID) {
        // if paid, mint proofs and use them to pay original invoice
        const proofs = await this.wallet.mintProofsBolt11(this.options.paySats, this.mintQuote.quote)
        this.debug('proofs', proofs)
        // coin selection and swap with server to prevent double spending
        const { keep: proofsToKeep, send: proofsToSend } = await this.wallet.send(this.options.paySats, proofs)
        // melt proofs to access change token
        const meltResponse = await this.wallet.meltProofsBolt11(this.meltQuote, proofsToSend)
        this.debug('meltResponse', meltResponse)
        // send change token via Nostr
        await this.sendViaNostr(
          getEncodedTokenV4({
            proofs: [...meltResponse.change, ...proofsToKeep],
            mint: this.options.mintUrl,
            memo: 'paywally',
          })
        )
        this.debug('payment successful, change sent via Nostr')
        return true
      }
      await new Promise((res) => setTimeout(res, delayBetweenAttemptsMs))
    }
  }

  // private methods

  /**
   * Make a CURL request
   * @param url the URL to request
   * @returns the response JSON
   */
  private async curl<T>(url: string): Promise<T> {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`Unable to reach ${url}`)
    return await response.json()
  }

  /**
   * Log debug information
   * @param args debug information
   */
  private debug(...args: unknown[]): void {
    if (this.options.withLog) {
      console.log('Debug info:', ...args)
    }
  }

  /**
   * Fetch receiver's invoice from lnurlp endpoint
   * @returns receiver's invoice (string)
   */
  private async getReceiverInvoice(): Promise<string> {
    const amount = this.options.paySats - this.options.feeSats
    const [user, host] = this.options.myLnurl.split('@')
    const data = await this.curl<LnurlpResponse>(`https://${host}/.well-known/lnurlp/${user}`)
    if (data.tag !== 'payRequest') throw new Error('Host unable to make lightning invoice')
    if (!data.callback) throw new Error('Callback url not present in response')
    if (data.minSendable > amount * 1000) throw new Error('Amount below minimum')
    if (data.maxSendable < amount * 1000) throw new Error('Amount above maximum')
    const json = await this.curl<InvoiceResponse>(`${data.callback}?amount=${amount * 1000}`)
    if (!json.pr) throw new Error('Unable to get invoice')
    return json.pr
  }

  /**
   * Send a message via Nostr encrypted with nip04
   * @param toPub recipient's public key
   * @param message message to send
   */
  private async sendViaNostr(message: string): Promise<void> {
    const pool = new SimplePool()
    const sk = generateSecretKey()
    const pk = getPublicKey(sk)
    const event: UnsignedEvent = {
      kind: EncryptedDirectMessage,
      tags: [['p', this.options.npubkey]],
      content: nip04.encrypt(sk, this.options.npubkey, message),
      created_at: Math.floor(Date.now() / 1000),
      pubkey: pk,
    }
    const signedEvent = finalizeEvent(event, sk)
    try {
      await Promise.race([
        pool.publish(this.options.nrelays, signedEvent),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Publish timeout')), 10000)),
      ])
      this.debug('Message published to Nostr successfully')
    } catch (error) {
      this.debug('Failed to publish to Nostr:', error)
      throw error
    } finally {
      pool.close(this.options.nrelays)
    }
  }
}
