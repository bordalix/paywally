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
    } = await curl(`https://${host}/.well-known/lnurlp/${user}`)
    if (data.tag !== 'payRequest') throw 'host unable to make lightning invoice'
    if (!data.callback) throw 'callback url not present in response'
    if (data.minSendable > amount * 1000) throw 'amount too low'
    if (data.maxSendable < amount * 1000) throw 'amount too high'
    const json: { pr: string } = await curl(`${data.callback}?amount=${amount * 1000}`)
    if (!json.pr) throw 'unable to get invoice'
    return json.pr
  } catch (err) {
    showError(err)
    return ''
  }
}
