import { EncryptedDirectMessage } from 'nostr-tools/kinds'
import { getEncodedTokenV4, type MeltQuoteResponse, type MintQuoteResponse, Wallet } from '@cashu/cashu-ts'
import { finalizeEvent, generateSecretKey, getPublicKey, nip04, SimplePool, type UnsignedEvent } from 'nostr-tools'

export interface PaywallyOptions {
  npubkey: string
  mintUrl: string
  myLnurl: string
  payFees: number
  paySats: number
  withLog: boolean
  nrelays: string[]
}

export class Paywally {
  readonly wallet: Wallet
  readonly options: PaywallyOptions

  amountToSend: number = 0
  meltQuote: MeltQuoteResponse | null = null
  mintQuote: MintQuoteResponse | null = null

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
   * @param myOptions optional
   * @param onInvoice optional
   * @param onPayment optional
   * @returns Paywally instance
   */
  static async create(
    options: PaywallyOptions,
    onInvoice?: (invoice: string) => void,
    onPayment?: (paid: boolean) => void
  ): Promise<Paywally> {
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
    if (!invoice) throw "unable to get receiver's invoice"
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
    if (!this.meltQuote) throw 'meltQuote not present'
    if (!this.mintQuote) throw 'mintQuote not present'
    const maxAttempts = 60 // 5 minutes with 5-second intervals
    let attempts = 0
    // wait for invoice to be paid
    while (true) {
      if (attempts >= maxAttempts) throw new Error('Payment timeout')
      attempts++
      this.debug("checking quote's state")
      const mintQuote = await this.wallet.checkMintQuoteBolt11(this.mintQuote.quote)
      if (mintQuote.state === 'PAID') {
        // if paid, mint proofs and use them to pay original invoice
        const proofs = await this.wallet.mintProofsBolt11(this.options.paySats, this.mintQuote.quote)
        this.debug('proofs', proofs)
        const { send } = await this.wallet.send(this.amountToSend, proofs)
        // melt proofs to access change token (2 sats fee reserve)
        const meltResponse = await this.wallet.meltProofsBolt11(this.meltQuote, send)
        this.debug('meltResponse', meltResponse)
        // send change token via Nostr
        this.sendViaNostr(
          getEncodedTokenV4({
            proofs: meltResponse.change,
            mint: this.options.mintUrl,
            memo: 'paywally',
          })
        )
        this.debug('payment successful, change sent via Nostr')
        return true
      }
      await new Promise((res) => setTimeout(res, 5000))
    }
  }

  // private methods

  /**
   * Make a CURL request
   * @param url the URL to request
   * @returns the response JSON
   */
  private async curl(url: string) {
    const response = await fetch(url)
    if (!response.ok) throw `Unable to reach ${url}`
    return await response.json()
  }

  /**
   * Log debug information
   * @param args debug information
   */
  private debug(...args: unknown[]) {
    if (this.options.withLog) {
      console.log('Debug info:', ...args)
    }
  }

  /**
   * Fetch receiver's invoice from lnurlp endpoint
   * @returns receiver's invoice (string)
   */
  private async getReceiverInvoice(): Promise<string> {
    const { myLnurl, paySats, payFees } = this.options
    const amount = paySats - payFees // deduct fee reserve
    if (!myLnurl) throw 'myLnurl is required'
    if (!amount) throw 'amount is required'
    if (myLnurl.split('@').length !== 2) throw 'invalid address'
    const [user, host] = myLnurl.split('@')
    const data: {
      tag: string
      minSendable: number
      maxSendable: number
      callback: string
    } = await this.curl(`https://${host}/.well-known/lnurlp/${user}`)
    if (data.tag !== 'payRequest') throw 'host unable to make lightning invoice'
    if (!data.callback) throw 'callback url not present in response'
    if (data.minSendable > amount * 1000) throw 'amount too low'
    if (data.maxSendable < amount * 1000) throw 'amount too high'
    const json: { pr: string } = await this.curl(`${data.callback}?amount=${amount * 1000}`)
    if (!json.pr) throw 'unable to get invoice'
    return json.pr
  }

  /**
   * Send a message via Nostr encrypted with nip04
   * @param toPub recipient's public key
   * @param message message to send
   */
  private async sendViaNostr(message: string) {
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
