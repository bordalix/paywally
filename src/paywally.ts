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

  amountToSend: number = 0
  meltQuote: MeltQuoteBolt11Response | null = null
  mintQuote: MintQuoteBolt11Response | null = null

  private constructor(
    wallet: Wallet,
    options: PaywallyOptions,
    onInvoice?: (invoice: string) => void,
    onPayment?: (paid: boolean) => void
  ) {
    this.options = options
    this.wallet = wallet
    if (onInvoice) {
      this.getInvoice().then((invoice) => {
        onInvoice(invoice)
        if (onPayment) {
          this.waitForPayment().then((paid) => {
            onPayment(paid)
          })
        }
      })
    }
  }

  /**
   * Create a Paywally instance
   *
   * @example
   *
   * const onInvoice = (invoice: string) => { ...show invoice to user... }
   * const onPayment = (paid: boolean) => { ...unlock content to user... }
   * const showError = (error: any) => { ...show thrown error to user... }
   *
   * // options for Paywally
   * const options: PaywallyOptions = {
   *   npubkey: '62cef883863022a4f1d60d54857c9d729650702c9fe227b0988c0b6e36c4bcce',
   *   nrelays: ['wss://relay.damus.io', 'wss://relay.primal.net'],
   *   mintUrl: 'https://mint.coinos.io',
   *   myLnurl: 'bordalix@coinos.io',
   *   paySats: 21, // amount in sats
   *   feeSats: 2, // fees in sats
   *   withLog: true,
   * }
   *
   * // using callbacks
   * try {
   *   Paywally.create(options, onInvoice, onPayment)
   * } catch (error) {
   *  showError(error)
   * }
   *
   * // using async/await
   * try {
   *   const paywally = await Paywally.create(options)
   *   onInvoice(await paywally.getInvoice())
   *   onPayment(await paywally.waitForPayment())
   * } catch (error) {
   *   showError(error)
   * }
   *
   * @param options required
   * @param onInvoice optional
   * @param onPayment optional
   * @returns Paywally instance
   */
  static async create(
    options: PaywallyOptions,
    onInvoice?: (invoice: string) => void,
    onPayment?: (paid: boolean) => void
  ): Promise<Paywally> {
    // validate options
    if (!options.npubkey) throw new Error('npubkey is required')
    if (!options.nrelays) throw new Error('nrelays is required')
    if (!options.mintUrl) throw new Error('mintUrl is required')
    if (!options.myLnurl) throw new Error('myLnurl is required')
    if (!options.paySats) throw new Error('paySats is required')
    if (!options.feeSats) throw new Error('feeSats is required')

    // test npubkey length
    if (options.npubkey.length !== 64) throw new Error('invalid npubkey')

    // test nrelays array
    if (!Array.isArray(options.nrelays) || options.nrelays.length === 0) {
      throw new Error('nrelays must be a non-empty array of relay URLs')
    }

    // test myLnurl format is a lnurlp (user@host)
    const lnurlParts = options.myLnurl.split('@')
    if (lnurlParts.length !== 2 || !lnurlParts[0] || !lnurlParts[1]) {
      throw new Error('myLnurl must be in the format user@host')
    }

    // test paySats and feeSats
    if (options.paySats <= 0) throw new Error('paySats must be greater than 0')
    if (options.feeSats < 0) throw new Error('feeSats must be 0 or greater')
    if (options.feeSats >= options.paySats) throw new Error('feeSats must be less than paySats')

    // create wallet
    const wallet = new Wallet(options.mintUrl)
    await wallet.loadMint() // wallet is now ready to use
    return new Paywally(wallet, options, onInvoice, onPayment)
  }

  /**
   * Fetch receiver's invoice and create mint & melt quotes
   * @returns mint invoice (string)
   */
  async getInvoice(): Promise<string> {
    const invoice = await this.getReceiverInvoice()
    if (!invoice) throw new Error("unable to get receiver's invoice")
    // create melt quote
    this.meltQuote = await this.wallet.createMeltQuoteBolt11(invoice)
    this.debug('meltQuote', this.meltQuote)
    // calculate amount to send
    this.amountToSend = this.meltQuote.amount + this.meltQuote.fee_reserve
    this.debug('amount to send', this.amountToSend)
    // create mint quote
    this.mintQuote = await this.wallet.createMintQuoteBolt11(this.amountToSend)
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
    if (!this.meltQuote) throw new Error('meltQuote not present')
    if (!this.mintQuote) throw new Error('mintQuote not present')
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
        const { send } = await this.wallet.send(this.amountToSend, proofs)
        // melt proofs to access change token (2 sats fee reserve)
        const meltResponse = await this.wallet.meltProofsBolt11(this.meltQuote, send)
        this.debug('meltResponse', meltResponse)
        // send change token via Nostr
        await this.sendViaNostr(
          getEncodedTokenV4({
            proofs: meltResponse.change,
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
    const { myLnurl, paySats, feeSats } = this.options
    const amount = paySats - feeSats // deduct fee reserve
    if (!myLnurl) throw new Error('myLnurl is required')
    if (!amount) throw new Error('amount is required')
    const [user, host] = myLnurl.split('@')
    const data = await this.curl<LnurlpResponse>(`https://${host}/.well-known/lnurlp/${user}`)
    if (data.tag !== 'payRequest') throw new Error('host unable to make lightning invoice')
    if (!data.callback) throw new Error('callback url not present in response')
    if (data.minSendable > amount * 1000) throw new Error('amount too low')
    if (data.maxSendable < amount * 1000) throw new Error('amount too high')
    const json = await this.curl<InvoiceResponse>(`${data.callback}?amount=${amount * 1000}`)
    if (!json.pr) throw new Error('unable to get invoice')
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
