import { showPaymentInfo, showError, showHiddenContent } from './show.ts'
import { Paywally, PaywallyOptions } from './paywally.ts'
import './style.css'

const pButton = document.querySelector<HTMLButtonElement>('#pay button')!

const options: PaywallyOptions = {
  npubkey: '62cef883863022a4f1d60d54857c9d729650702c9fe227b0988c0b6e36c4bcce',
  nrelays: ['wss://relay.damus.io', 'wss://relay.primal.net'],
  mintUrl: 'https://mint.coinos.io',
  myLnurl: 'bordalix@coinos.io',
  paySats: 21, // amount in sats
  withLog: true,
}

async function pay() {
  try {
    // disable button
    pButton.disabled = true
    pButton.innerText = 'Loading...'

    // using callbacks
    Paywally.create(options, showPaymentInfo, showHiddenContent)

    // using async/await
    // const paywally = await Paywally.create(options)
    // showPaymentInfo(await paywally.getInvoice())
    // showHiddenContent(await paywally.waitForPayment())
  } catch (error) {
    showError(error)
    pButton.disabled = false
    pButton.innerText = 'Retry'
  }
}

pButton.addEventListener('click', pay)
