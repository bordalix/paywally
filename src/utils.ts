export async function curl(url: string) {
  const response = await fetch(url)
  if (!response.ok) throw `Unable to reach ${url}`
  return await response.json()
}

// to obfuscate content:
// - change 'https://github.com/bordalix/paywally' with rot('iuuqt;00hjuivc/dpn0cpsebmjy0qbzxbmmz')
// - change 'https://coinos.io/.well-known/lnurlp/bordalix' with rot('iuuqt;00dpjopt/jp0/xfmm.lopxo0movsmq0cpsebmjy')
export const rot = (str: string) =>
  str
    .split('')
    .map((char) => String.fromCharCode(char.charCodeAt(0) - 1))
    .join('')
