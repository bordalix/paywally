import './style.css'
import { getInvoice } from './lnurlp.ts'
import { showPaymentInfo, showError, showHiddenContent } from './show.ts'
import { CashuMint, CashuWallet, getEncodedTokenV4, MintQuoteState } from '@cashu/cashu-ts'
import { sendViaNostr } from './nostr.ts'

const mintUrl = 'https://mint.coinos.io'
const myLnurl = 'bordalix@coinos.io'
const paySats = 21 // amount to be paid in sats
const pButton = document.querySelector<HTMLButtonElement>('#pay button')!
const npubkey = '62cef883863022a4f1d60d54857c9d729650702c9fe227b0988c0b6e36c4bcce'

async function pay() {
  try {
    pButton.disabled = true
    pButton.innerText = 'Loading...'
    // initialize cashu wallet
    let mintQuoteState: MintQuoteState
    const wallet = new CashuWallet(new CashuMint(mintUrl))
    await wallet.loadMint()
    // get final invoice
    const invoice = await getInvoice(myLnurl, paySats - 2)
    if (!invoice) throw "unable to get owner's invoice"
    // create melt quote
    const meltQuote = await wallet.createMeltQuote(invoice)
    console.log('meltQuote', meltQuote)
    // calculate amount to send
    const amountToSend = meltQuote.amount + meltQuote.fee_reserve
    console.log('amount to send', amountToSend)
    // create mint quote
    const mintQuote = await wallet.createMintQuote(amountToSend)
    console.log('mintQuote', mintQuote)
    // show invoice to user in text and qrcode
    showPaymentInfo(mintQuote.request)
    // wait for invoice to be paid
    while (true) {
      console.log("checking quote's state")
      mintQuoteState = (await wallet.checkMintQuote(mintQuote.quote)).state
      if (mintQuoteState === 'PAID') break
      await new Promise((res) => setTimeout(res, 5000))
    }
    // if paid, mint proofs and use them to pay original invoice
    if (mintQuoteState === 'PAID') {
      const proofs = await wallet.mintProofs(paySats, mintQuote.quote)
      const { send } = await wallet.send(amountToSend, proofs)
      const meltResponse = await wallet.meltProofs(meltQuote, send)
      console.log('meltResponse', meltResponse)
      // unlock content
      showHiddenContent()
      // send change token via Nostr
      sendViaNostr(
        npubkey,
        getEncodedTokenV4({
          proofs: meltResponse.change,
          mint: mintUrl,
          memo: 'paywally',
        })
      )
    }
  } catch (error) {
    showError(error)
    pButton.disabled = false
    pButton.innerText = 'Retry'
  }
}

pButton.addEventListener('click', pay)
