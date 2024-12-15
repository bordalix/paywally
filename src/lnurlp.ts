import { showError } from './show.ts'
import { curl } from './utils.ts'

export const getInvoice = async (address: string, amount: number): Promise<string> => {
  try {
    if (!address) throw 'address is required'
    if (!amount) throw 'amount is required!'
    if (address.split('@').length !== 2) throw 'invalid address'
    const [user, host] = address.split('@')
    const data: {
      tag: string
      minSendable: number
      maxSendable: number
      callback: string
      pr: string
    } = await curl(`https://${host}/.well-known/lnurlp/${user}`)
    if (data.tag !== 'payRequest') throw 'host unable to make lightning invoice'
    if (data.minSendable > amount * 1000) throw 'amount too low'
    if (data.maxSendable < amount * 1000) throw 'amount too high'
    const response = await fetch(`${data.callback}?amount=${amount * 1000}`)
    if (!response.ok) throw 'unable to reach host'
    const json = await response.json()
    if (!json.pr) throw 'unable to get invoice'
    return json.pr
  } catch (err) {
    showError(err)
    return ''
  }
}
