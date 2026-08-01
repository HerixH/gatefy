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

### Verified Build badge (Lab)

Embedding `--meta` alone is **not** enough. Lab shows **Verified Build** only when a **GitHub attestation** exists for the exact on-chain WASM hash (SEP-55).

1. Commit + push `contracts/soroban/` and `.github/workflows/soroban-release.yml`
2. Tag & push: `git tag v0.1.0-attendance && git push origin v0.1.0-attendance`
3. Download `attendance_proof.wasm` from the GitHub Release (attested)
4. Deploy **that** WASM (hash must match the attestation)
5. Reload the contract in Lab

Until step 4, Lab may still show **Unverified Build** even though meta lists `source_repo`.

**Deployed testnet instance (Gate — with source meta):**

| | |
|--|--|
| Contract | `CBX7FFXZ7PIOXLKPKXELZRK5XNZSGJS7PKQR4P423ZJ2FXYDGQC35XEV` |
| Admin / minter | `gate-minter` → `GBDH542K3AF3WTRHPXIBH6IUQVJHJBZZ7FGGMUG7BBFWML46ZVEF6ERJ` |
| Wasm hash | `a63fd5e9570d5eff74ec1863770caab341cda7e1f77534281185b73ec03b8c5c` |
| Lab | https://lab.stellar.org/r/testnet/contract/CBX7FFXZ7PIOXLKPKXELZRK5XNZSGJS7PKQR4P423ZJ2FXYDGQC35XEV |

Previous instance (no meta): `CBM3JGJD6K222PDOB7DJRNHBTUG3YUWMVPKRS37NV4QS7OTZTMNXVXMM`

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
