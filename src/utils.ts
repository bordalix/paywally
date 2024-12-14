export async function curl(url: string) {
  const response = await fetch(url)
  if (!response.ok) throw `Unable to reach ${url}`
  return await response.json()
}

export function rot(str: string) {
  return str
    .split('')
    .map((char) => String.fromCharCode(char.charCodeAt(0) - 1))
    .join('')
}
