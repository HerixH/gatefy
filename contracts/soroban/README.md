# Gate Protocol — Soroban attendance mint

On successful door verify, Gate mints a **non-transferable attendance proof** on Stellar (Soroban). Base ERC-721 comes later behind the same app adapter.

## Contract

`attendance_proof/` — admin-gated `mint(attendee, event_id) → u64`.

## Deploy (testnet)

### Prerequisites

**Windows**

```powershell
winget install --id Stellar.StellarCLI
rustup target add wasm32v1-none
# Restart the terminal after winget so `stellar` is on PATH
```

**macOS / Linux**

```bash
curl -fsSL https://github.com/stellar/stellar-cli/raw/main/install.sh | sh
rustup target add wasm32v1-none
```

### Build with source meta (required for Lab)

```bash
cd attendance_proof
SHA=$(git rev-parse HEAD)
stellar contract build \
  --out-dir ./target/wasm-out \
  --meta "source_repo=github:HerixH/gatefy" \
  --meta "commit_sha=$SHA" \
  --meta "source_rev=$SHA" \
  --meta "name=gate-attendance-proof" \
  --meta "version=0.1.0"
```

### Deploy (testnet)

```bash
# Create + fund a minter (once)
stellar keys generate gate-minter --network testnet --fund

stellar contract deploy \
  --wasm ./target/wasm-out/attendance_proof.wasm \
  --source-account gate-minter \
  --network testnet

stellar contract invoke \
  --id <CONTRACT_ID> \
  --source-account gate-minter \
  --network testnet \
  --send=yes \
  -- initialize --admin $(stellar keys address gate-minter)
```

### Lab badges (SEP-55 + SEP-58)

| Badge | How we get it |
|-------|----------------|
| **Verified Build** | GitHub Actions attestation (SEP-55) on the release WASM |
| **Source Code Verified** | Digest-pinned Docker build that stamps `bldimg`, `bldopt`, `source_uri`, `source_sha256` (SEP-58) |

Release workflow: `.github/workflows/soroban-release.yml` (Docker image `stellar/stellar-cli` pinned by **amd64** digest).

```bash
git tag v0.1.2-attendance && git push origin v0.1.2-attendance
# wait for Actions → download BOTH assets from the release:
#   attendance_proof.wasm
#   attendance_proof-source.tar.gz
stellar contract deploy --wasm attendance_proof.wasm --source-account gate-minter --network testnet
```

**Deployed testnet instance (Gate — SEP-55 + SEP-58 release `v0.1.2-attendance`):**

| | |
|--|--|
| Contract | `CBG2JH4H7YFLD2PJJMXHNRNQGCLIID7MOWMVPXDZVTVMZWBNDPXBUNA7` |
| Admin / minter | `gate-minter` → `GBDH542K3AF3WTRHPXIBH6IUQVJHJBZZ7FGGMUG7BBFWML46ZVEF6ERJ` |
| Wasm hash | `44ddf8319685682af18d841a1e65d78911d8885a381da8cce82673497cd2f64e` |
| Release | https://github.com/HerixH/gatefy/releases/tag/v0.1.2-attendance |
| Actions | https://github.com/HerixH/gatefy/actions/runs/30713788351 |
| Lab | https://lab.stellar.org/r/testnet/contract/CBG2JH4H7YFLD2PJJMXHNRNQGCLIID7MOWMVPXDZVTVMZWBNDPXBUNA7 |

Set `SOROBAN_CONTRACT_ID` to the contract ID above (already done in local `.env.local`).

## App env

```bash
ATTENDANCE_MINT_CHAIN=soroban
SOROBAN_CONTRACT_ID=C...
STELLAR_MINTER_SECRET=S...
NEXT_PUBLIC_STELLAR_NETWORK=testnet
# optional override:
# SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
```

Set `ATTENDANCE_MINT_CHAIN=off` to keep check-in DB-only.  
`ATTENDANCE_MINT_CHAIN=base` is reserved (not wired yet).

## Flow

1. Attendee verifies (`POST /api/verify`) with a Stellar address (Freighter session).
2. Server records Supabase attendance.
3. Server minter invokes Soroban `mint` → stores `mint_tx` / `token_id` on the attendance row.
