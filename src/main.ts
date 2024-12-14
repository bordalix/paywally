import './style.css'
import { showPaymentInfo, showError, showHidden } from './show.ts'
import { CashuMint, CashuWallet, MintQuoteState } from '@cashu/cashu-ts'
import { getInvoice } from './lnurlp.ts'

const paySats = 3 // amount to be paid in sats
const mintUrl = 'https://mint.coinos.io'

async function pay() {
  try {
    // initialize cashu wallet
    let mintQuoteState: MintQuoteState
    const wallet = new CashuWallet(new CashuMint(mintUrl))
    await wallet.loadMint()
    // get final invoice
    const invoice = await getInvoice(paySats - 2)
    if (!invoice) throw "unable to get owner's invoice"
    const meltQuote = await wallet.createMeltQuote(invoice)
    console.log('meltQuote', meltQuote)
    const amountToSend = meltQuote.amount + meltQuote.fee_reserve
    console.log('amount to send', amountToSend)
    // create mint quote
    const mintQuote = await wallet.createMintQuote(amountToSend)
    console.log('mintQuote', mintQuote)
    // show invoice in text and qrcode
    showPaymentInfo(mintQuote.request)
    // wait for invoice to be paid
    while (true) {
      console.log("checking quote's state")
      mintQuoteState = (await wallet.checkMintQuote(mintQuote.quote)).state
      if (mintQuoteState === 'PAID') break
      await new Promise((res) => setTimeout(res, 5000))
    }
    if (mintQuoteState === 'PAID') {
      const proofs = await wallet.mintProofs(paySats, mintQuote.quote)
      const { send } = await wallet.send(amountToSend, proofs)
      const meltResponse = await wallet.meltProofs(meltQuote, send)
      console.log('meltResponse', meltResponse)
    }
    // show hidden content
    showHidden()
  } catch (error) {
    showError(error)
  }
}

document.querySelector<HTMLButtonElement>('#pay')!.addEventListener('click', pay)
