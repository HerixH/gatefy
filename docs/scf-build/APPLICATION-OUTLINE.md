# SCF Build — Integration Track application outline

**Track:** [Integration Track](https://stellar.gitbook.io/scf-handbook/scf-awards/build-award/integration-track)  
**Must integrate ≥1 item from:** [Integration List](https://stellar.gitbook.io/scf-handbook/scf-awards/build-award/integration-track/integration-list.md)

Keep the form **self-contained**. See also `INTEGRATION-TRACK.md`.

---

## Project name

Gate Protocol — Stellar wallet & ticket-payment integrations for live events

## Track selection

**Integration Track** (existing application composing official Stellar building blocks)

## One-liner

A live event host platform integrating **Stellar Wallets Kit / Freighter** so organizers accept **USDC ticket payments on Stellar**, with a path to **MoneyGram / Bridge** for local cash-in in Africa.

## Problem

Event hosts need paid tickets + verifiable check-in. Attendees (especially in Africa) need low-friction stablecoin payment and cash on/off-ramps. EVM-only flows and WhatsApp/spreadsheets leave that gap.

## Existing product & traction (required for this track)

Gate Protocol is **already live** (not a greenfield app):

- Create events, wallet **or** email registration, host dashboard, QR check-in, Base USDC + mobile-money references  
- Company revenue: **$0** (pre-monetization)  
- Fill: events hosted ___, registrations ___, countries ___  
- Founder: Herix Hangandu (Zambia)

## What we integrate (from the official list)

| Integration | Why it matters |
|-------------|----------------|
| **Stellar Wallets Kit** and/or **Freighter Connect** | Attendees connect a Stellar wallet and sign USDC ticket payments in-app — core conversion for paid events |
| **Optional: MoneyGram or Bridge** | Cash-in / treasury rails so hosts and guests in Zambia & Africa can fund USDC tickets without crypto-native only UX |

Horizon verification of USDC → treasury is **connective tissue** between Gate’s registration API and the wallet integration—not a substitute for a listed partner.

## How integration improves the product & Stellar ecosystem

- Unlocks Stellar as a **real commerce rail** (event tickets), not storage  
- Brings existing Gate hosts/attendees onto Stellar wallets and USDC  
- Composes ecosystem wallets (+ optional on-ramps) instead of reinventing them  
- Differentiates Gate vs Eventbrite/Luma (no Stellar) and vs POAP-only tools (no full host + payments stack)

## Technical plan (summary)

1. Integrate **Stellar Wallets Kit / Freighter** into registration pay flow  
2. Server verifies payment via Horizon; store `paid_stellar` on registration  
3. Host toggle: accept USDC on Stellar (already started locally)  
4. Optional Tranche: MoneyGram or Bridge for cash ↔ USDC  
5. **Mainnet launch** of the integrated payment path (final tranche)

Detail: `ARCHITECTURE.md`. Alignment notes: `INTEGRATION-TRACK.md`.

## Team readiness

Solo technical founder; product already shipping (Next.js, Supabase, payments UX). Ready to start listed integrations immediately using their docs/Discord.

## Open source

If any Soroban helpers ship later, open-source under MIT/Apache-2.0. **Primary SCF deliverables are integrations**, not a new protocol.

## Budget & tranches

See `TRANCHES.md` — scoped to Integration Track bands (**~$25k–$50k** small / **~$50k–$100k** with on-ramp). Most $ toward Freighter / Wallets Kit (+ optional MoneyGram/Bridge). No marketing or audits.

## Process reminder

1. SCF **Interest form** → Integration Track (+ referral code if any)  
2. When invited → Build form → **Integration Track**  
3. Name list partners explicitly; prove traction; three tranches; Mainnet last  

## Eligibility reminders

- ≥1 official Integration List partner named and budgeted  
- Existing traction stated with numbers  
- Budget = mostly integration + connective tissue  
- No marketing / token giveaways  
- Self-contained submission  

---

**Local (not pushed):** Stellar payment verifier + host toggle already started.  
Still required for SCF: Freighter / Wallets Kit (and Interest form).
