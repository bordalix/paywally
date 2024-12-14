import { rot } from './utils'

export function showError(error: unknown) {
  const errorMessage = error instanceof Error ? error.message : String(error)
  document.querySelector<HTMLElement>('#error')!.innerText = errorMessage
  console.error('An error occurred:', error)
}

export function showHidden() {
  document.querySelector<HTMLDivElement>('#qrcode')!.innerHTML = ''
  document.querySelector<HTMLDivElement>('#hidden')!.innerHTML = `
    <p>repo at <a href="${rot('iuuqt;00hjuivc/dpn0cpsebmjy0qbzxbmmz')}">github</a></p>
  `
}

export function showPaymentInfo(invoice: string) {
  const color = '#000'
  document.querySelector<HTMLButtonElement>('#pay')!.style.display = 'none'
  document.querySelector<HTMLDivElement>('#qrcode')!.innerHTML = `
    <button id="mock">Paid</button>
    <p id="expiry" />
    <qr-code 
      id="qr1"
      contents="${invoice}"
      module-color="${color}"
      position-ring-color="${color}"
      position-center-color="${color}"
      style="
        background-color: #fff;
        height: 420px;
        width: 420px;
        margin: 2rem auto;
      "
    ></qr-code>
    <p style="word-wrap: break-word">${invoice}</p>
  `
  document.querySelector<HTMLButtonElement>('#mock')!.addEventListener('click', showHidden)
  console.log('invoice', invoice)
}
