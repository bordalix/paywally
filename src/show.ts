// to obfuscate content:
// - change 'https://github.com/bordalix/paywally' with rot('iuuqt;00hjuivc/dpn0cpsebmjy0qbzxbmmz')
// - change 'https://coinos.io/.well-known/lnurlp/bordalix' with rot('iuuqt;00dpjopt/jp0/xfmm.lopxo0movsmq0cpsebmjy')
export const rot = (str: string) =>
  str
    .split('')
    .map((char) => String.fromCharCode(char.charCodeAt(0) - 1))
    .join('')

/**
 * Show an error message
 * @param error error to show
 */
export function showError(error: unknown): void {
  const errorMessage = error instanceof Error ? error.message : String(error)
  document.querySelector<HTMLElement>('#error')!.innerText = errorMessage
  console.error('An error occurred:', error)
}

/**
 * Show hidden content
 * @param paid if the payment was made
 * @returns void
 */
export function showHiddenContent(paid: boolean): void {
  if (!paid) return
  document.querySelector<HTMLDivElement>('#qrcode')!.innerHTML = ''
  document.querySelector<HTMLDivElement>('#hidden')!.innerHTML = `
    <p>repo at <a href="${rot('iuuqt;00hjuivc/dpn0cpsebmjy0qbzxbmmz')}">github</a></p>
  `
}

/**
 * Show payment information
 * @param invoice the invoice to show
 */
export function showPaymentInfo(invoice: string): void {
  const color = '#000'
  document.querySelector<HTMLButtonElement>('#pay')!.style.display = 'none'
  document.querySelector<HTMLDivElement>('#qrcode')!.innerHTML = `
    <qr-code 
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
}
