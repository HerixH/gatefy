# SCF Integration Track — three tranches (aligned)

Budget must mainly fund **official Integration List** work ([guide](https://stellar.gitbook.io/scf-handbook/scf-awards/build-award/integration-track)).  
Suggested band: **Small $25k–$50k** (wallet) or **Medium $50k–$100k** (wallet + on-ramp).  
No marketing. No audit line items. Final tranche = **Mainnet launch**.

Edit dollar amounts before submit. Figures below are a **Small + optional Medium path**.

---

## Tranche 1 — Wallet integration MVP (testnet)

**Integrations:** [Stellar Wallets Kit](https://stellarwalletskit.dev/) and/or [Freighter Connect](https://developers.stellar.org/docs/build/guides/freighter)

| Deliverable | Detail | Est. cost (USD) |
|-------------|--------|-----------------|
| Stellar Wallets Kit / Freighter connect | Connect wallet in Gate registration UI | 8,000 |
| Sign & submit USDC ticket payment | Build/sign payment to treasury; error UX | 7,000 |
| Horizon verify + `paid_stellar` (connective tissue) | Server confirm payment; host roster labels | 3,000 |
| Testnet demo + docs | Recorded E2E on Stellar testnet | 2,000 |
| **Tranche 1 total** | | **20,000** |

**Exit:** Attendee connects Freighter (or kit wallet) → pays USDC ticket on testnet → registers → host sees paid.

**Timing:** ~6–8 weeks  

---

## Tranche 2 — Harden + optional on-ramp (testnet)

**Integrations:** continue Freighter / Wallets Kit; optional [MoneyGram](https://stellar.org/products-and-tools/moneygram) or [Bridge](http://www.bridge.xyz)

| Deliverable | Detail | Est. cost (USD) |
|-------------|--------|-----------------|
| Wallet UX polish | Mobile/desktop, disconnect, network checks | 4,000 |
| Memo / support matching | Link payment to registration | 2,000 |
| **Optional:** MoneyGram or Bridge pilot | Cash-in path for African hosts/attendees | 12,000 |
| Connective tissue (Gate host settings, emails) | Instructions, toggles, ops docs | 2,000 |
| **Tranche 2 total** | | **8,000** (wallet-only) **or ~20,000** (with on-ramp) |

**Timing:** ≤90 days after Tranche 1 payment  

---

## Tranche 3 — Mainnet launch (required final)

| Deliverable | Detail | Est. cost (USD) |
|-------------|--------|-----------------|
| Mainnet cutover | Public Network, Circle USDC, treasury ops | 6,000 |
| Production monitoring & runbook | Failure modes, support path | 2,000 |
| Mainnet launch proof | Live paid event path + SCF report | 2,000 |
| **Tranche 3 total** | | **10,000** |

**Exit:** Mainnet ticket payment via Freighter / Wallets Kit live in production.

---

## Budget rollup

### Path A — Small (wallet only) — recommended

| Tranche | USD |
|---------|-----|
| 1 | 20,000 |
| 2 | 8,000 |
| 3 | 10,000 |
| **Total** | **38,000** |

Fits SCF **Small** band ($25k–$50k).

### Path B — Medium (wallet + MoneyGram/Bridge)

| Tranche | USD |
|---------|-----|
| 1 | 20,000 |
| 2 | 20,000 |
| 3 | 12,000 |
| **Total** | **52,000** |

Near bottom of **Medium** band ($50k–$100k).

---

## Explicitly out of scope for this ask

- Marketing, growth hacks, token giveaways  
- Full custom Soroban protocol as primary deliverable  
- Rebuilding Gate from scratch  
