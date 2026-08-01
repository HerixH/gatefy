# Alignment: SCF Build — Integration Track

Source: [Integration Track](https://stellar.gitbook.io/scf-handbook/scf-awards/build-award/integration-track) · [Integration List](https://stellar.gitbook.io/scf-handbook/scf-awards/build-award/integration-track/integration-list.md)

## Fit check for Gate Protocol

| Requirement | Gate status | Action |
|-------------|-------------|--------|
| Existing app with traction (not greenfield) | Live product (Base + email hosts, host dashboard) | Emphasize **existing users/events** in the form |
| Integrate ≥1 item from official Integration List | Horizon USDC verify alone is **not** enough | Must ship **Stellar Wallets Kit** and/or **Freighter Connect** (+ optional on-ramp) |
| Budget mostly for integration costs | Old draft was custom verifier / Soroban-heavy | Re-scope budget to **wallet kit + Freighter + (optional) MoneyGram/Bridge** |
| Not a net-new protocol | Gate is an application | Correct — do **not** pitch as Open Track protocol |
| Not “tools for other developers” | B2B host SaaS | Correct — Integration Track OK |
| No marketing / audit in budget | — | Keep out of tranches |
| 3 tranches; final = Mainnet launch | Required for Build awards | Keep Mainnet as Tranche 3 |

## Who this track is for (vs others)

- **Integration Track** ✅ — existing app composing wallets / anchors / on-ramps  
- **Open Track** — net-new protocols (worse fit)  
- **Instawards** — tiny/new apps without traction  
- **RFP Track** — libraries for other developers  

## Recommended integrations (from the official list)

### Primary (required — pick at least one)

1. **[Stellar Wallets Kit](https://stellarwalletskit.dev/)** — connect Freighter + other Stellar wallets; &lt;1 day estimate on list, but UX for ticket pay is real work.  
2. **[Freighter Connect](https://developers.stellar.org/docs/build/guides/freighter)** — SDF-maintained browser wallet for signing USDC ticket payments.

### Secondary (Africa / payments — strong story)

3. **[MoneyGram](https://stellar.org/products-and-tools/moneygram)** — cash in/out; 1+ month; fits Zambia/Africa hosts.  
4. **[Bridge](http://www.bridge.xyz)** — fiat/treasury rails; 1–5 days listed.  
5. **[BlindPay](https://blindpay.com/)** or **[Abroad](https://www.abroad.finance/)** — local rails ↔ stablecoins (1–2 weeks).

**Do not center the ask on custom Soroban** for Integration Track. Optional later; budget must mainly be integrations.

## Suggested scope & budget band

From SCF table:

| Scope | Example | Suggested budget |
|-------|---------|------------------|
| **Small** (recommended start) | Freighter **or** Stellar Wallets Kit + ticket pay UX | **$25,000–$50,000** |
| Medium | Wallet + MoneyGram or Bridge | **$50,000–$100,000** |

Most line items = hours on those integrations + “connective tissue” (Gate UI/API).  
Horizon verification we already started counts as connective tissue, not the named integration.

## Process (Integration Track)

1. Submit **SCF Interest form** and select **Integration Track** (include referral code if any).  
2. If invited, submit **Build form** → choose **Integration Track**.  
3. Name the exact list partner(s), how they improve Gate, and traction.  
4. Reviewers → possible changes → Tranche 1 funding → later tranches within **90 days** of prior payment.

## Pitch framing (use this)

> Gate Protocol is a **live** event registration and check-in product. We are integrating **Freighter Connect** (SDF, Integration List) so hosts can accept **USDC ticket payments on Stellar**, and optionally **MoneyGram / Bridge** so African attendees can cash-in to USDC. SCF funds those integrations—not a new chain or protocol.

## Local implementation status

- **Freighter Connect** — connect + sign + submit USDC ticket payment (`src/components/StellarPayPanel.tsx`)
- Horizon verify on register — already wired
- Set `NEXT_PUBLIC_STELLAR_TREASURY` + `NEXT_PUBLIC_STELLAR_NETWORK=testnet` to demo

## What to fix in our old draft

| Old (misaligned) | New (aligned) |
|------------------|---------------|
| Horizon-only “Stellar rail” as the whole ask | List **Freighter / Wallets Kit** as the funded integration |
| Budget ~$17k custom + Soroban | **$25k–$50k** (or $50k–$100k with on-ramp) |
| Tranche 3 heavy on Soroban contracts | Tranche 3 = **Mainnet** of wallet + payments (+ optional on-ramp live) |
| Open Track vibes | Explicitly **Integration Track** |
