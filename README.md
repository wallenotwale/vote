# Vote for Humanity 🗳️

Anonymous, verifiable elections powered by **ZKPassport** identity proofs and **Celestia** data availability.

Voters prove they're real humans by scanning their passport (NFC + zero-knowledge proof) — no personal data revealed. Votes are encrypted client-side, posted as Celestia blobs, and independently verifiable by anyone running a light node.

## How It Works

```
Passport NFC scan ──► ZKPassport proof (no PII disclosed)
                          │
                          ▼
              Client encrypts vote choice
                          │
                          ▼
           Server posts blob to Celestia namespace
                          │
                          ▼
        Anyone can verify via DA sampling / Celenium
```

1. **Create an election** — requires ZKPassport proof to verify you're a unique human. Generates an encryption keypair and posts config to a unique Celestia namespace. The `creator_nullifier` (derived from your ZKPassport proof) is stored on-chain, proving a verified human created the election.
2. **Vote** — scan your passport, pick a candidate, vote is encrypted client-side and posted as a Celestia blob with your ZK proof + scoped nullifier (prevents double-voting without revealing identity).
3. **Tally** — admin reveals the decryption key; anyone can verify the count against on-chain blobs.
4. **Verify** — all vote blobs are publicly available on Celestia; light nodes can independently confirm data availability.

## Tech Stack

| Layer | Tech |
|---|---|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Identity | [ZKPassport](https://zkpassport.id) SDK |
| Data Availability | Celestia mocha testnet |
| Database | SQLite via Drizzle ORM |
| Vote Encryption | RSA-OAEP (ElGamal planned) |
| Styling | Tailwind CSS |
| Wallet | Celestia account via `@cosmjs/proto-signing` |

## Quick Start

### Prerequisites

- Node.js 20+
- A Celestia DA endpoint (or run [Lumina](https://github.com/eigerco/lumina) locally)
- Smartphone with NFC for passport scanning (or use mock mode)

### Setup

```bash
# Clone & install
git clone git@github.com:wallenotwale/vote.git
cd vote
npm install

# Configure environment
cp .env.local.example .env.local
# Edit .env.local with your Celestia RPC URL, admin key, etc.

# Run dev server
npm run dev
# → http://localhost:3000
```

### Environment Variables

```bash
CELESTIA_RPC_URL=http://localhost:26658   # DA endpoint
CELESTIA_NETWORK=mocha-4
CELESTIA_AUTH_TOKEN=                       # Lumina JWT (if auth enabled)
MOCK_ZKPASSPORT=false                     # true = skip real passport scan
ADMIN_API_KEY=change-me-before-deploy
DATABASE_URL=file:./db/zkvote.db
```

### Scripts

```bash
npm run dev              # Start dev server
npm run build            # Production build
npm test                 # Run tests
npm run wallet:generate  # Generate a Celestia wallet
npm run db:generate      # Generate Drizzle migrations
npm run db:migrate       # Apply migrations
```

## Project Structure

```
├── app/
│   ├── page.tsx                    # Home — create/list elections
│   ├── election/[id]/             # Election detail + vote flow
│   ├── admin/zkpassport/          # ZKPassport admin tools
│   └── api/
│       ├── election/              # Create & read elections
│       ├── vote/                  # Cast votes
│       ├── verify/                # Verify vote blobs on-chain
│       ├── results/               # Election results
│       ├── tally/                 # Trigger tally (admin)
│       ├── zkpassport/            # ZKPassport request lifecycle
│       └── celestia/              # Wallet & balance helpers
├── lib/
│   ├── celestia.ts                # Celestia RPC client + namespace derivation
│   ├── celestia-account.ts        # Wallet generation & balance checks
│   ├── crypto.ts                  # Vote encryption/decryption
│   ├── zkpassport.ts              # ZKPassport proof verification
│   ├── zkpassport-requests.ts     # Request lifecycle persistence
│   ├── validation.ts              # Input validation
│   ├── db.ts                      # SQLite/Drizzle setup
│   └── types.ts                   # Shared TypeScript types
├── components/                    # React components
├── db/schema.ts                   # Drizzle ORM schema
├── scripts/                       # CLI utilities
└── tests/                         # Test suite
```

## Privacy Model

Three layers of unlinkability:

1. **ZKPassport** — passport NFC scan generates a zero-knowledge proof of valid government document. No personal data disclosed.
2. **Scoped nullifier** — unique per (passport, election) pair. Prevents double-voting without enabling cross-election tracking. Cannot be reversed to identity.
3. **Vote encryption** — vote choice encrypted client-side with the election public key. Nobody knows the content until tally.

### What's public on Celestia
- Election config (candidates, timeframe, encryption pubkey)
- Vote blobs (nullifier + encrypted vote + ZK proof)
- Tally (results + decryption key + all nullifiers)

### What's NOT linkable
- Nullifier → person
- Encrypted vote → plaintext (until tally)
- IP/timing → vote choice

## API Overview

### Election Creation

`POST /api/election` requires:
- `zkpassport_proof` — ZKPassport proof verifying you're a unique human

The server derives a `creator_nullifier` from your proof using a "creator" scope (different from voting scope). This means:
- Same person = same creator_nullifier across all elections they create
- Cannot link creator to voter (different scopes)
- Cannot reverse nullifier to identity

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/election` | Create election (requires ZKPassport) |
| `GET` | `/api/election/[id]` | Get election details |
| `POST` | `/api/vote` | Cast a vote |
| `GET` | `/api/verify/[id]` | Verify vote blobs on-chain |
| `GET` | `/api/results/[id]` | Get election results |
| `POST` | `/api/tally/[id]` | Trigger tally (admin) |
| `GET` | `/api/zkpassport/request/[id]` | Create ZKPassport request URL/state |
| `GET` | `/api/zkpassport/status/[requestId]` | Poll proof status |
| `POST` | `/api/celestia/wallet/generate` | Generate Celestia wallet |
| `GET` | `/api/celestia/wallet/balance/[address]` | Check wallet balance |


## Current Status

This is a **proof of concept** on Celestia's mocha testnet. See [SPEC.md](./SPEC.md) for the full architecture doc and build plan.

### Working
- Election creation with ZKPassport human verification (creator_nullifier)
- Vote submission with nullifier uniqueness enforcement
- ZKPassport request lifecycle (create → poll → proof auto-fill)
- SQLite-persisted request/proof state
- On-chain vote verification via namespace blob scanning
- Celestia wallet generation and balance checks
- Client-lib signer flow (txs signed by your own key)

### Planned
- ElGamal/Curve25519 encryption (currently RSA-OAEP)
- Lumina WASM in-browser DA verification
- Threshold decryption (N-of-M admin keys)
- Voter eligibility rules (nationality, age gates)

## License

See [LICENSE](./LICENSE).
