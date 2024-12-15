import { finalizeEvent, generateSecretKey, getPublicKey, nip04, SimplePool, UnsignedEvent } from 'nostr-tools'
import { EncryptedDirectMessage } from 'nostr-tools/kinds'

const DEFAULT_RELAYS = ['wss://relay.damus.io', 'wss://relay.primal.net']

export const sendViaNostr = async (toPub: string, message: string) => {
  const pool = new SimplePool()
  const sk = generateSecretKey()
  const pk = getPublicKey(sk)
  const event: UnsignedEvent = {
    kind: EncryptedDirectMessage,
    tags: [['p', toPub]],
    content: await nip04.encrypt(sk, toPub, message),
    created_at: Math.floor(Date.now() / 1000),
    pubkey: pk,
  }
  const signedEvent = finalizeEvent(event, sk)
  pool.publish(DEFAULT_RELAYS, signedEvent)
}
