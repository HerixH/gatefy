# SCF Build materials — Gate Protocol × Stellar

**Aligned track:** [Integration Track](https://stellar.gitbook.io/scf-handbook/scf-awards/build-award/integration-track)  
**Must use ≥1 partner from:** [Integration List](https://stellar.gitbook.io/scf-handbook/scf-awards/build-award/integration-track/integration-list.md)

Official criteria also apply: [Submission criteria](https://stellar.gitbook.io/scf-handbook/scf-awards/build-award/submission-criteria)

Work stays **local** until you choose to push.

---

## Read first

1. **`INTEGRATION-TRACK.md`** — fit check, why Horizon-alone isn’t enough, recommended list partners  
2. **`APPLICATION-OUTLINE.md`** — paste into the Build form  
3. **`TRANCHES.md`** — ~$38k wallet-only or ~$52k + on-ramp  
4. **`ARCHITECTURE.md`** — technical detail  

---

## Alignment summary

| Do | Don’t |
|----|--------|
| Apply as **Integration Track** | Pitch as Open Track “new protocol” |
| Name **Freighter / Stellar Wallets Kit** (required) | Rely only on Horizon REST as the “integration” |
| Optional: **MoneyGram / Bridge** for Africa cash-in | Put most budget on custom Soroban |
| Show **existing Gate traction** | Claim greenfield with no users |
| Budget **$25k–$50k** (or $50k–$100k with on-ramp) | Under-scope at $17k custom-only |
| Interest form first for Integration Track | Skip interest form |

---

## Product work already local (connective tissue)

| Piece | Status |
|-------|--------|
| `ticket_accept_stellar` + host UI | Done (local) |
| Horizon USDC → treasury verify | Done — `src/lib/stellar-payment.ts` |
| Register API `paymentRail: stellar` | Done |
| **Freighter Connect** (pay USDC in-app) | Done locally — `StellarPayPanel` + `stellar-freighter-pay.ts` |
| Stellar Wallets Kit (multi-wallet) | Deferred — Freighter is on official Integration List |
| MoneyGram / Bridge | Not yet (optional Path B) |

## Local setup (payments verify)

1. Run `supabase/patches/06_ticket_accept_stellar.sql`  
2. `.env.local`:

```env
NEXT_PUBLIC_STELLAR_NETWORK=testnet
NEXT_PUBLIC_STELLAR_TREASURY=G.......................................................
```

3. `npm run dev` — enable **USDC on Stellar** on a paid event  

---

## Process

1. SCF Interest form → **Integration Track**  
2. If invited → Build form → Integration Track + list partners  
3. Tranches within 90 days of prior payment after award  
