# Gate Protocol × Stellar — technical architecture

## Product

Gate Protocol is an event host platform: create events, paid tickets, registration (wallet or email), roster/CSV, QR check-in. Historically payments used **USDC on Base**. SCF Build funds a **first-class Stellar USDC rail** so organizers in Africa and Stellar communities can settle tickets on Stellar.

## Stellar integration (current MVP)

### Payment verification

1. Organizer enables `ticket_accept_stellar` on a paid event.
2. Attendee sends **Circle USDC** (or testnet USDC) to `NEXT_PUBLIC_STELLAR_TREASURY`.
3. Attendee pastes the **64-char Stellar transaction hash** at registration.
4. Server calls Horizon:
   - `GET {horizon}/transactions/{hash}/payments`
   - Requires successful `payment` / path payment
   - `to` = treasury
   - asset = USDC + configured issuer
   - amount ≥ ticket price
5. On success, registration is stored with `payment_status = paid_stellar`.

Code: `src/lib/stellar-payment.ts`, wired in `src/app/api/register/route.ts`.

### Why Stellar (not data storage)

- Core feature: **paid ticket settlement**
- Improves fees and accessibility vs EVM-only for many African users
- Enables future **anchor / mobile-money → USDC** paths on Stellar

### Off-chain services (unchanged)

- Supabase: events, registrations, attendance
- Next.js API: auth by organizer wallet/email session
- QR / verification codes: event check-in

Stellar does **not** replace the roster DB; it settles payment.

## SCF Integration Track (required list partners)

Horizon verify alone is **not** an official Integration List item. Funded work must center on:

| List partner | Role in Gate |
|--------------|--------------|
| [Stellar Wallets Kit](https://stellarwalletskit.dev/) and/or [Freighter Connect](https://developers.stellar.org/docs/build/guides/freighter) | Connect wallet + sign USDC ticket payment |
| Optional: [MoneyGram](https://stellar.org/products-and-tools/moneygram) / [Bridge](http://www.bridge.xyz) | Cash on/off-ramp for African hosts/attendees |

See `INTEGRATION-TRACK.md`.

## Planned (tranches)

| Feature | Tech |
|---------|------|
| Freighter / Wallets Kit pay | Official list integrations — build/sign/submit payment |
| Memo matching | Optional memo = registration email for support |
| On-ramp (optional) | MoneyGram or Bridge per Integration List |
| Soroban | Not primary for Integration Track; optional later |

## Networks

| Env | Horizon | USDC |
|-----|---------|------|
| testnet | horizon-testnet.stellar.org | configurable issuer |
| public | horizon.stellar.org | Circle `GA5ZSE…KZVN` |

## Security notes

- Verification is server-side; client cannot skip Horizon checks (except `NEXT_PUBLIC_DEV_MODE=true` for local).
- Treasury address is env-configured; never hardcode mainnet keys in the repo.
