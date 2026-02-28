# ZK Vote on Celestia — Project Spec

## Overview

A proof-of-concept anonymous voting application using ZKPassport for identity verification and Celestia (mocha testnet) for data availability. Voters prove they're real humans via passport NFC scan without revealing identity, cast encrypted votes posted as Celestia blobs, and independently verify all votes are available via Lumina light node running in-browser.

**One-liner:** Anonymous elections where votes are on Celestia and identity is proven by passport ZK proofs.

## Tech Stack

| Component | Technology |
|-----------|------------|
| Framework | Next.js (App Router) |
| Language | TypeScript (everything) |
| Identity | ZKPassport SDK (`@zkpassport/sdk`) |
| DA Layer | Celestia mocha testnet |
| DA Client | Lumina light node (sidecar) + WASM (browser) |
| Celestia RPC | REST/JSON-RPC to Lumina node |
| Database | SQLite (via better-sqlite3 or drizzle) |
| Encryption | ElGamal on Curve25519 (vote encryption) |
| Styling | Tailwind CSS |

## Architecture

```
┌─────────────────────────────────────────┐
│           Next.js App                    │
│                                          │
│  /app (frontend)                         │
│    - ZKPassport SDK (passport NFC scan)  │
│    - Lumina WASM (DA sampling in browser)│
│    - Vote submission UI                  │
│    - Results + verification dashboard    │
│                                          │
│  /api (backend routes)                   │
│    - POST /api/election       (create)   │
│    - GET  /api/election/:id   (status)   │
│    - POST /api/register       (register) │
│    - POST /api/vote           (cast)     │
│    - GET  /api/results/:id    (tally)    │
│    - POST /api/tally/:id      (trigger)  │
│                                          │
│  /lib                                    │
│    - celestia.ts (RPC client)            │
│    - crypto.ts (encryption, nullifiers)  │
│    - zkpassport.ts (proof verification)  │
│                                          │
└──────────────┬───────────────────────────┘
               │ JSON-RPC
        ┌──────▼──────┐
        │ Lumina node  │
        │ (sidecar)    │
        │ --network    │
        │   mocha      │
        └──────┬───────┘
               │ P2P
        ┌──────▼──────┐
        │   Celestia   │
        │   mocha-4    │
        └──────────────┘
```

## Data Model

### Celestia Namespace

Each election gets a unique namespace: `sha256(election_id)[0:10]` (10-byte v0 namespace).

### Blob Types

All blobs are JSON-encoded with a `type` field for demuxing.

#### Election Config Blob
```json
{
  "type": "election_config",
  "version": 1,
  "election_id": "uuid",
  "title": "Board of Directors 2026",
  "description": "...",
  "candidates": ["Alice", "Bob", "Charlie"],
  "created_at": "2026-03-01T00:00:00Z",
  "voting_start": "2026-03-01T12:00:00Z",
  "voting_end": "2026-03-02T12:00:00Z",
  "encryption_pubkey": "base64-encoded-pubkey",
  "admin_address": "celestia1..."
}
```

#### Vote Blob
```json
{
  "type": "vote",
  "election_id": "uuid",
  "nullifier": "hex-encoded-nullifier",
  "encrypted_vote": "base64-encoded-ciphertext",
  "zkpassport_proof": {
    "proof": "...",
    "vkey_hash": "...",
    "version": "..."
  },
  "timestamp": "2026-03-01T14:30:00Z"
}
```

#### Tally Blob
```json
{
  "type": "tally",
  "election_id": "uuid",
  "results": {
    "Alice": 142,
    "Bob": 89,
    "Charlie": 34
  },
  "total_votes": 265,
  "decryption_key": "base64-encoded-privkey",
  "nullifiers": ["hex1", "hex2", "..."],
  "tallied_at": "2026-03-02T12:05:00Z"
}
```

## Privacy Model

### Three layers of unlinkability:

1. **ZKPassport** — Voter scans passport via NFC. SDK generates a ZK proof that "I hold a valid government-issued document" with **zero personal data disclosed**. We request no attributes — just proof of valid document + a unique identifier scoped to our election.

2. **Nullifier** — ZKPassport provides a scoped unique identifier per (passport, scope) pair. We use `scope = election_id`. Same passport → same nullifier for that election (prevents double-voting). Different election → different nullifier (prevents cross-election tracking). Cannot be reversed to passport identity.

3. **Vote encryption** — Vote choice is encrypted with the election's public key (ElGamal). Ciphertext posted to Celestia. Nobody — not even the server — knows the vote content until the election admin reveals the private key at tally time.

### What's on Celestia (public):
- Election config (candidates, times, pubkey)
- Vote blobs (nullifier + encrypted vote + ZK proof)
- Tally (results + decryption key + all nullifiers)

### What's NOT linkable:
- Nullifier → person (can't reverse the hash)
- Encrypted vote → plaintext (until tally)
- IP/timing → vote content (server sees submission time but not vote choice)

### Remaining trust assumptions (POC scope):
- Election admin is trusted to not reveal the private key early
- Server is trusted to post all votes (Lumina DA sampling mitigates withholding)
- ZKPassport proofs are valid (rely on their cryptography)

## API Design

### `POST /api/election`
Create a new election. Generates encryption keypair. Posts config blob to Celestia.

**Request:**
```json
{
  "title": "Board Election 2026",
  "description": "Vote for board members",
  "candidates": ["Alice", "Bob", "Charlie"],
  "voting_start": "2026-03-01T12:00:00Z",
  "voting_end": "2026-03-02T12:00:00Z"
}
```

**Response:**
```json
{
  "election_id": "uuid",
  "namespace": "hex",
  "celestia_height": 12345,
  "encryption_pubkey": "base64"
}
```

### `GET /api/election/:id`
Get election details. Reads config blob from Celestia.

### `POST /api/vote`
Cast a vote. Server verifies ZKPassport proof, checks nullifier uniqueness, encrypts nothing (client encrypts), posts vote blob.

**Request:**
```json
{
  "election_id": "uuid",
  "nullifier": "hex",
  "encrypted_vote": "base64",
  "zkpassport_proof": { ... }
}
```

**Response:**
```json
{
  "success": true,
  "celestia_height": 12350,
  "blob_commitment": "base64"
}
```

### `POST /api/tally/:id`
Admin triggers tally. Reads all vote blobs, decrypts, counts, posts tally blob.
Requires admin auth (simple API key for POC).

### `GET /api/results/:id`
Public results after tally. Reads tally blob from Celestia.

## Frontend Pages

### `/` — Home
- Create election form
- List of active/recent elections

### `/election/[id]` — Election Detail
- Election info (title, candidates, timeframe)
- Status badge (upcoming / voting open / closed / tallied)
- "Vote" button (if open)
- Results (if tallied)
- Lumina DA verification status

### `/election/[id]/vote` — Voting Flow
1. Connect ZKPassport (scan passport via NFC)
2. See candidates, make selection
3. Vote encrypted client-side
4. Submit
5. Confirmation with Celestia block height + blob commitment

### `/election/[id]/verify` — Verification Dashboard
- Lumina WASM running in browser
- DA sampling status for election namespace
- Count of verified vote blobs
- "Your nullifier" check (did my vote get included?)
- Link to raw blob data

## Celestia Integration (`/lib/celestia.ts`)

Talks to Lumina node sidecar via JSON-RPC. Key operations:

```typescript
// Post a blob to a namespace
async function submitBlob(namespace: string, data: object): Promise<{ height: number; commitment: string }>

// Get all blobs in a namespace at a height
async function getBlobs(namespace: string, height: number): Promise<Blob[]>

// Get all blobs across all heights for a namespace (scan)
async function scanNamespace(namespace: string): Promise<Blob[]>

// Get current block height
async function getHeight(): Promise<number>
```

RPC endpoint: `http://localhost:26658` (Lumina node default)

## Crypto (`/lib/crypto.ts`)

```typescript
// Generate election keypair
function generateElectionKeypair(): { publicKey: string; privateKey: string }

// Encrypt a vote choice with election public key
function encryptVote(choice: string, publicKey: string): string

// Decrypt a vote with election private key
function decryptVote(ciphertext: string, privateKey: string): string

// Decrypt all votes and tally
function tallyVotes(encryptedVotes: string[], privateKey: string): Record<string, number>
```

## Dev Setup

### Prerequisites
- Node.js 20+
- Rust + cargo (for Lumina)
- A smartphone with NFC (for ZKPassport — or use mock mode)

### Steps
```bash
# 1. Clone and install
cd projects/zk-vote-celestia
npm install

# 2. Install and run Lumina light node
cargo install lumina-cli --locked
lumina node --network mocha

# 3. Fund the Celestia account
# Get address from Lumina, fund at mocha faucet

# 4. Run the app
npm run dev
# → http://localhost:3000

# 5. (Optional) Mock mode for development without passport
MOCK_ZKPASSPORT=true npm run dev
```

## Project Review (Current State)

### What is already implemented

**Core app + data path (working):**
- [x] Next.js App Router scaffold with TypeScript
- [x] SQLite + Drizzle schema (`elections`, `nullifiers`)
- [x] Celestia client (`/lib/celestia.ts`) with namespace derivation + blob submit/get
- [x] Create election API (`POST /api/election`) including keypair generation + config blob post
- [x] Election list/detail APIs (`GET /api/election`, `GET /api/election/:id`)
- [x] Vote API (`POST /api/vote`) with voting-window guard + nullifier uniqueness
- [x] Home, election detail, and vote UI pages
- [x] Production build passes (`next build`)

### Gaps / mismatches to original spec

- [ ] **Crypto mismatch:** spec says ElGamal Curve25519, current implementation uses RSA-OAEP in `lib/crypto.ts`
- [ ] **ZKPassport integration not implemented:** optional proof fields are accepted but not verified
- [ ] **No tally/results routes yet:** `/api/tally/:id` and `/api/results/:id` missing
- [ ] **No verification dashboard yet:** `/election/[id]/verify` not implemented
- [ ] **No receipt object in vote response** (for easier independent inclusion checks)
- [ ] **No explicit election state machine** (upcoming/open/closed/tallied persisted server-side)

## Updated Build Plan

### Phase 1 — Harden the foundation (now)
- [ ] Add server-side input contracts (candidate limits, nullifier length/format, payload size)
- [ ] Add shared blob schema validator (`type`, `version`, required fields)
- [ ] Add deterministic vote receipt shape: `{election_id, nullifier, celestia_height, blob_commitment, timestamp}`
- [ ] Add basic test coverage for API happy path + key edge cases

### Phase 2 — Identity and anti-double-vote
- [ ] Integrate ZKPassport SDK on vote flow page
- [ ] Implement backend proof verification module (`lib/zkpassport.ts`)
- [ ] Derive nullifier from scoped ZKPassport identifier (do not trust client-provided nullifier)
- [ ] Support `MOCK_ZKPASSPORT=true` mode with explicit mock proof format

### Phase 3 — Tally and public results
- [ ] Implement `POST /api/tally/:id` (admin-auth protected)
- [ ] Implement `GET /api/results/:id`
- [ ] Persist tally metadata (height, commitment, tallied_at)
- [ ] Add results UI on election detail page

### Phase 4 — DA verification UX
- [ ] Add `/election/[id]/verify` page
- [ ] Scan namespace blobs and show inclusion counts
- [ ] Add nullifier lookup UI for voter self-check
- [ ] Add links to raw blob data + heights for independent verification

### Phase 5 — Crypto and security alignment
- [ ] Replace RSA-OAEP with planned ElGamal/Curve25519 path (or update spec if RSA remains intentional)
- [ ] Protect election private key at rest (at minimum env-wrapped encryption for POC)
- [ ] Add admin key rotation / safer admin auth than static header

### Phase 6 — Product polish
- [ ] Mobile-first voting UX refinements
- [ ] Better error/loading/retry states for Celestia/Lumina outages
- [ ] README with local runbook + end-to-end demo script
- [ ] Optional: migrate from ad-hoc bootstrap SQL to explicit migrations

## File Structure

```
zk-vote-celestia/
├── SPEC.md                 (this file)
├── package.json
├── next.config.ts
├── tsconfig.json
├── tailwind.config.ts
├── drizzle.config.ts
├── .env.local.example
│
├── app/
│   ├── layout.tsx
│   ├── page.tsx                    # Home — create/list elections
│   ├── election/
│   │   └── [id]/
│   │       ├── page.tsx            # Election detail + results
│   │       ├── vote/
│   │       │   └── page.tsx        # Voting flow
│   │       └── verify/
│   │           └── page.tsx        # DA verification
│   └── api/
│       ├── election/
│       │   └── route.ts            # POST create
│       ├── election/[id]/
│       │   └── route.ts            # GET details
│       ├── vote/
│       │   └── route.ts            # POST cast vote
│       ├── tally/[id]/
│       │   └── route.ts            # POST trigger tally
│       └── results/[id]/
│           └── route.ts            # GET results
│
├── lib/
│   ├── celestia.ts                 # Celestia RPC client
│   ├── crypto.ts                   # ElGamal encryption
│   ├── zkpassport.ts               # ZKPassport proof verification
│   ├── db.ts                       # SQLite/Drizzle setup
│   └── types.ts                    # Shared types
│
├── components/
│   ├── ElectionCard.tsx
│   ├── VotingForm.tsx
│   ├── PassportScanner.tsx
│   ├── DAVerifier.tsx
│   └── ResultsChart.tsx
│
├── scripts/
│   ├── setup-lumina.sh             # Install + configure Lumina
│   └── fund-account.sh             # Faucet helper
│
└── db/
    └── schema.ts                   # Drizzle schema
```

## Environment Variables

```bash
# Celestia / Lumina
CELESTIA_RPC_URL=http://localhost:26658
CELESTIA_NETWORK=mocha-4

# ZKPassport
NEXT_PUBLIC_ZKPASSPORT_DOMAIN=localhost:3000
MOCK_ZKPASSPORT=false

# Admin
ADMIN_API_KEY=your-secret-key

# Database
DATABASE_URL=file:./db/zkvote.db
```

## Open Questions / Future Work

- **Threshold decryption**: Replace single admin keypair with N-of-M threshold scheme so no single party can decrypt early. Out of scope for POC.
- **On-chain verification**: Deploy ZKPassport verifier contract on Celestia-adjacent chain (e.g., Ethereum L2 using Celestia DA). Currently server-side verification only.
- **Voter eligibility rules**: ZKPassport can gate by nationality, age, etc. Could add "only US citizens over 18" type rules per election.
- **Censorship resistance**: Currently server could refuse to post a vote blob. Could allow direct voter blob submission if they run their own node.
- **Receipt-freeness**: Current scheme doesn't prevent vote-selling (voter can prove how they voted by sharing their encryption randomness). Would need re-encryption mixnets for true receipt-freeness. Way out of scope.

---

_Created: 2026-02-27_
_Status: Planning_
