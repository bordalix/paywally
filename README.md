# Paywally

A standalone web app that implements a lightning paywall: you need to pay 21 sats to unlock the hidden content.

How it works:

1. The app fetches a 19 sats invoice from bordalix@coinos.io
2. Then it creates a melt quote with this invoice
3. In return the app gets:
   - amount = 19 sats
   - fee_reserve = 2 sats
4. Then it creates a mint quote of 21 sats
5. In return the app gets a payment request (aka ln invoice)
6. It shows this invoice to the user
7. Pools the mint every 5 seconds waiting for the invoice to be paid
8. When paid, it mints the proofs
9. Uses the proofs to melt and pay for the first invoice
10. Receives a change of 2 sats

It’s not perfect, the user can inspect the code and:

- Change the value to pay to 3 sats
- Change bordalix@coinos.io to his own lnurl
- Access the content in the code (is obfuscated, but is there)
