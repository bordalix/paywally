// tests for the paywally module
import { describe, expect, it } from 'vitest'
import { decode } from 'light-bolt11-decoder'
import { Paywally } from '../paywally.ts'

const options = {
  npubkey: '62cef883863022a4f1d60d54857c9d729650702c9fe227b0988c0b6e36c4bcce',
  nrelays: ['wss://relay.damus.io', 'wss://relay.primal.net'],
  mintUrl: 'https://mint.coinos.io',
  myLnurl: 'bordalix@coinos.io',
  paySats: 21, // amount in sats
  feeSats: 3, // fees in sats
  withLog: true,
}

describe('paywally module', () => {
  it('should import Paywally', () => {
    console.log(Paywally)
  })
})

describe('create', () => {
  it('should create a Paywally instance', async () => {
    const paywally = await Paywally.create(options)
    expect(paywally).toBeInstanceOf(Paywally)
  })

  it('should throw error for invalid npubkey', async () => {
    await expect(Paywally.create({ ...options, npubkey: 'invalid' })).rejects.toThrow()
  })

  it('should throw error for invalid nrelays', async () => {
    await expect(Paywally.create({ ...options, nrelays: [] })).rejects.toThrow()
  })

  it('should throw error for invalid myLnurl', async () => {
    await expect(Paywally.create({ ...options, myLnurl: '@' })).rejects.toThrow()
    await expect(Paywally.create({ ...options, myLnurl: '@@' })).rejects.toThrow()
    await expect(Paywally.create({ ...options, myLnurl: '@@@' })).rejects.toThrow()
    await expect(Paywally.create({ ...options, myLnurl: 'acme' })).rejects.toThrow()
    await expect(Paywally.create({ ...options, myLnurl: 'acme@' })).rejects.toThrow()
    await expect(Paywally.create({ ...options, myLnurl: '@acme' })).rejects.toThrow()
  })

  it('should throw error for invalid paySats', async () => {
    await expect(Paywally.create({ ...options, paySats: 0 })).rejects.toThrow()
    await expect(Paywally.create({ ...options, paySats: 1 })).rejects.toThrow()
    await expect(Paywally.create({ ...options, paySats: 2 })).rejects.toThrow()
    await expect(Paywally.create({ ...options, paySats: 3 })).rejects.toThrow()
    await expect(Paywally.create({ ...options, paySats: -1 })).rejects.toThrow()
  })

  it('should throw error for invalid feeSats', async () => {
    await expect(Paywally.create({ ...options, feeSats: -1 })).rejects.toThrow()
    await expect(Paywally.create({ ...options, feeSats: 21 })).rejects.toThrow()
  })

  it('should throw error if paySats is less than or equal to feeSats', async () => {
    await expect(Paywally.create({ ...options, feeSats: 21 })).rejects.toThrow()
    await expect(Paywally.create({ ...options, paySats: 3 })).rejects.toThrow()
    await expect(Paywally.create({ ...options, paySats: 2 })).rejects.toThrow()
    await expect(Paywally.create({ ...options, paySats: 1 })).rejects.toThrow()
    await expect(Paywally.create({ ...options, paySats: 0 })).rejects.toThrow()
  })
})

describe('getInvoice', () => {
  it('should get an invoice', async () => {
    const paywally = await Paywally.create(options)
    const invoice = await paywally.getInvoice()
    const amount = decode(invoice).sections.find((s) => s.name === 'amount')?.value
    expect(Number(amount)).toBe(options.paySats * 1000) // in msats
  })
})
