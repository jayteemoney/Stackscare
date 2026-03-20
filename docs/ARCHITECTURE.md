# Technical Architecture

## System Overview

StacksCare is composed of four interconnected layers, each independently replaceable but designed to work as a unified system.

```
┌─────────────────────────────────────────────────────────────────┐
│                        Patient Browser                          │
│   Next.js 16 · TypeScript · Tailwind CSS · @stacks/connect     │
└──────────────────────┬──────────────────────┬───────────────────┘
                       │                      │
          Hiro Wallet  │                      │  REST API (httpx)
         (tx signing) │                      │
                       ▼                      ▼
┌──────────────────────────┐    ┌─────────────────────────────────┐
│    Stacks Blockchain     │    │       FastAPI Backend            │
│                          │    │                                  │
│  stackscare.clar         │    │  /api/upload   (IPFS + encrypt) │
│  • create-record         │    │  /api/analyze  (LLM analysis)   │
│  • grant-access          │    │  /api/molbot/orchestrate        │
│  • revoke-access         │    │  /api/molbot/format             │
│  • get-record            │    │  /api/molbot/registry           │
│  • is-authorized         │    │                                  │
│                          │    │  x402 Middleware (STX payments) │
│  molbot-registry.clar    │    └────────────┬────────────────────┘
│  • register-agent        │                 │
│  • get-agent             │                 │  AES-256 encrypt
│  • is-agent-active       │                 ▼
│                          │    ┌─────────────────────────────────┐
│  Settlement: Bitcoin L1  │    │    IPFS (Pinata)                │
│  via Proof of Transfer   │    │    Encrypted medical files      │
└──────────────────────────┘    └─────────────────────────────────┘
```

---

## Data Flow: Uploading a Health Record

```
1. Patient selects file in browser
2. Frontend sends file to POST /api/upload
3. Backend encrypts file with AES-256 (key from .env)
4. Encrypted bytes pinned to IPFS → returns CID (e.g. QmXxx...)
5. Frontend calls Hiro Wallet with create-record(CID, record-type)
6. Wallet signs transaction → broadcast to Stacks mempool
7. Stacks node confirms tx in next block (~10s testnet / ~10min mainnet)
8. stackscare.clar maps (patient-address, record-id) → CID
9. Frontend polls tx status via Hiro API → shows confirmation
```

---

## Data Flow: Granting Doctor Access

```
1. Patient enters doctor's Stacks address (ST... or SP...)
2. Frontend calls Hiro Wallet with grant-access(record-id, doctor-principal)
3. Contract validates: caller == record.owner
4. Contract sets: access-map[(record-id, doctor)] = true
5. Doctor can now call get-record(record-id) → receives CID
6. Doctor fetches encrypted file from IPFS using CID
7. Doctor decrypts file using shared key (future: per-user encryption)
```

---

## Data Flow: Molbot Orchestration (x402)

```
1. Patient submits symptoms via /api/molbot/orchestrate
2. Orchestrator queries molbot-registry → finds MedAnalyzer endpoint
3. Orchestrator → POST MedAnalyzer endpoint
4. MedAnalyzer returns HTTP 402 with payment details (if x402 enabled)
5. Orchestrator signs STX transfer → retries with payment-signature header
6. MedAnalyzer verifies signature → runs Llama 3.1 analysis → returns result
7. Orchestrator → POST ReportFormatter endpoint (same x402 flow)
8. ReportFormatter structures raw analysis into sections
9. Orchestrator returns: analysis + formatted report + payment trail + totalCostUstx (sum of all agent fees, including free-mode calls)
```

---

## Smart Contract Architecture

### `stackscare.clar`

The core health record contract. All operations are patient-initiated.

```
Data Maps:
  health-records: { owner, ipfs-hash, record-type, timestamp }
  access-control: { record-id, authorized-address } → bool
  record-counter: uint (global auto-increment)

Public Functions:
  create-record(ipfs-hash, record-type) → (ok record-id)
  grant-access(record-id, authorized)   → (ok true)
  revoke-access(record-id, authorized)  → (ok true)

Read-Only Functions:
  get-record(record-id, requester)       → record or ERR-NOT-AUTHORIZED
  is-authorized(record-id, addr, owner)  → bool
  get-total-records(owner)               → uint
```

**Key security properties:**
- `create-record` binds the record to `tx-sender` — cannot be called on behalf of another wallet
- `grant-access` checks `(is-eq (get owner record) tx-sender)` — only the owner can grant
- `get-record` checks authorization before returning the IPFS hash — the CID is never exposed to unauthorized callers, even via read-only queries

### `molbot-registry.clar`

On-chain service catalog for autonomous AI agents.

```
Data Maps:
  agents: { agent-id } → { owner, name, endpoint-url, service-type,
                            price-ustx, token-type, active, registered-at }
  owner-agent: { owner } → { agent-id }    (one agent per principal)
  agent-index: { idx }   → { agent-id }    (enumeration support)

Public Functions:
  register-agent(name, endpoint, service-type, price, token) → (ok agent-id)
  update-agent(agent-id, endpoint, price)                    → (ok true)
  deregister-agent(agent-id)                                 → (ok true)

Read-Only Functions:
  get-agent(agent-id)          → agent tuple
  get-agent-by-owner(owner)    → agent tuple with id
  get-agent-count()            → uint
  is-agent-active(agent-id)    → bool
```

---

## Backend Architecture

The FastAPI backend is stateless — it holds no patient data. It serves as a bridge between the browser and three external services: IPFS (Pinata), the Stacks blockchain (Hiro API), and the HuggingFace LLM router.

```
backend/
├── main.py               # Route definitions, CORS, x402 init
├── config.py             # Pydantic settings from .env
├── ai_analyzer.py        # HuggingFace Llama 3.1 integration
├── ipfs_client.py        # AES-256 encrypt + Pinata pin
├── x402_stacks.py        # STX payment creation and signature encoding
├── x402_middleware.py    # FastAPI middleware for 402 responses
├── molbot_registry.py    # On-chain agent discovery client
├── molbot_formatter.py   # Report structuring specialist
└── molbot_orchestrator.py # Multi-agent coordination engine
```

### Key Design Decisions

**1. Encryption happens server-side (current) → client-side (roadmap)**
Currently AES-256 encryption runs in the backend with a shared key. This is functional but means the backend operator theoretically has decryption ability. The roadmap moves encryption to the client browser using the patient's wallet-derived key, achieving true zero-knowledge storage.

**2. x402 middleware is opt-in via environment variable**
`X402_ENABLED=false` in `.env` disables payment requirements on all AI endpoints. This allows free development and demonstration while the full payment flow exists and can be enabled with one config change.

**3. Molbot registry falls back to seed agents**
If the on-chain registry query fails (network issue, empty contract), the orchestrator falls back to hardcoded seed agents pointing to `localhost:8000` endpoints. This ensures the demo always works regardless of testnet availability.

---

## Frontend Architecture

```
src/
├── app/
│   ├── page.tsx                    # Landing page (server component)
│   └── dashboard/
│       ├── page.tsx                # Dashboard page (server component)
│       ├── DashboardWrapper.tsx    # Client boundary wrapper
│       └── dashboard-client.tsx   # Full dashboard logic (client)
├── components/
│   ├── WalletConnect.tsx           # Hiro Wallet connect/disconnect
│   ├── UploadRecord.tsx            # File upload + AI analysis trigger
│   ├── RecordsList.tsx             # Record cards + access management
│   ├── MolbotNetwork.tsx           # Agent network + orchestration UI
│   ├── TxBanner.tsx                # Live transaction status polling
│   └── AiResult.tsx                # Markdown-like AI text renderer
├── hooks/
│   ├── useStacksAuth.ts            # Wallet connection state
│   ├── useHealthRecords.ts         # Records CRUD + contract calls
│   ├── useTxStatus.ts              # Transaction polling (5s interval)
│   └── useBackendHealth.ts         # Backend liveness check
└── lib/
    ├── stacks.ts                   # Contract call helpers, explorer URLs
    ├── api.ts                      # Backend REST client
    └── x402Client.ts               # Browser-side x402 fetch wrapper
```

### State Management

No external state library (Redux, Zustand) is used. State flows unidirectionally:

```
useStacksAuth (wallet address)
    → useHealthRecords (records, contract mutations)
        → DashboardContent props
            → UploadRecord (createRecord)
            → RecordsList (grantAccess, revokeAccess)
```

Each mutation (create, grant, revoke) opens the Hiro Wallet popup, signs the transaction, and returns a `txId`. The `useTxStatus` hook polls the Hiro API every 5 seconds until the transaction reaches `success` or `abort_*`.

---

## Security Architecture

See [SECURITY.md](SECURITY.md) for full threat model. Key properties:

1. **No plaintext data on-chain** — Only IPFS CIDs are stored in Clarity contracts
2. **No plaintext data in transit** — Files are encrypted before leaving the backend
3. **Smart contract access gates** — `get-record` returns `ERR-NOT-AUTHORIZED` for any non-owner, non-grantee caller
4. **Wallet-signed mutations** — No backend can modify ownership; all writes require the patient's wallet signature
5. **x402 payment verification** — Agent endpoints validate payment signatures before executing LLM calls

---

## Infrastructure Requirements

| Component | Minimum | Production |
|---|---|---|
| Backend | 1 vCPU, 512MB RAM | 2 vCPU, 2GB RAM |
| Frontend | Vercel Free Tier | Vercel Pro / CDN |
| IPFS | Pinata Free (1GB) | Pinata Professional |
| Stacks Node | Hiro Public API | Dedicated node |
| LLM | HuggingFace Free | HuggingFace Inference Endpoints |
