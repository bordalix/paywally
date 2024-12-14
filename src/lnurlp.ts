import { showError } from './show.ts'
import { curl, rot } from './utils.ts'

export const getInvoice = async (amount: number): Promise<string> => {
  try {
    if (!amount) throw `amount is required!`
    let data: {
      tag: string
      minSendable: number
      maxSendable: number
      callback: string
      pr: string
    } = await curl(rot('iuuqt;00dpjopt/jp0/xfmm.lopxo0movsmq0cpsebmjy'))
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
