# StacksCare — Patient-Owned Health Records on Stacks

> **Decentralized health data ownership · AI-powered analysis · Agent-to-agent micropayments via x402**

[![Stacks](https://img.shields.io/badge/Built%20on-Stacks-5546FF?style=flat-square)](https://stacks.co)
[![Clarity](https://img.shields.io/badge/Smart%20Contracts-Clarity-7C3AED?style=flat-square)](https://docs.stacks.co/clarity/overview)
[![License](https://img.shields.io/badge/License-MIT-emerald?style=flat-square)](LICENSE)
[![Network](https://img.shields.io/badge/Network-Stacks%20Testnet-orange?style=flat-square)](https://explorer.hiro.so/?chain=testnet)

---

## What Is StacksCare?

StacksCare is a decentralized health records platform that gives patients complete, cryptographic ownership of their medical data. Built on Stacks — secured by Bitcoin — it combines:

- **Clarity smart contracts** for tamper-proof ownership and granular access control
- **AES-256 encrypted IPFS storage** for private, censorship-resistant file hosting
- **AI-powered analysis** (Llama 3.1 via HuggingFace) that reads your medical documents in plain English
- **x402 Stacks micropayment protocol** enabling autonomous agent-to-agent AI commerce

No central server owns your records. No hospital can share them without your signature. No one can read them without your key.

---

## The Problem

Over **2.7 billion people** lack access to portable, interoperable health records. Those who do have records face:

- Data locked inside hospital silos they cannot access
- Zero control over who views or sells their health information
- Medical history lost when switching providers
- No way to securely share records with specialists across institutions
- Health data breaches exposing millions annually (700M+ records breached in the US since 2009)

---

## The Solution

StacksCare turns each patient's Stacks wallet into a **personal health vault**:

| Traditional System | StacksCare |
|---|---|
| Hospital owns your records | **You own your records** |
| Access controlled by institution | **Access controlled by smart contract** |
| Data stored on private servers | **Encrypted on IPFS, hash on-chain** |
| Breaches expose plaintext data | **AES-256 ciphertext — unreadable without key** |
| Sharing requires fax/portal requests | **One transaction, instant, reversible** |
| No audit trail | **Every access change permanently logged** |

---

## Core Features

### 1. Patient-Owned Health Vault
Upload any medical document (PDF, JPEG, PNG, TXT). It is encrypted client-side with AES-256, pinned to IPFS via Pinata, and the content hash is stored in a Clarity smart contract tied to your Stacks wallet. You are the sole owner.

### 2. Granular On-Chain Access Control
Grant or revoke a doctor's access with a single Stacks transaction. The `stackscare.clar` contract enforces access rules — no backend, no admin, no override.

### 3. AI Medical Analysis
Upload a lab report or describe your symptoms. Our AI (Meta Llama 3.1 8B) produces a plain-English summary, risk level (Low/Moderate/High/Critical), key findings, and questions to ask your doctor.

### 4. Molbot Agent Network (x402 Commerce)
The flagship innovation: autonomous AI agents that discover each other via an on-chain registry, pay each other with STX micropayments using the x402 protocol, and chain their outputs into a structured health report — all without human involvement.

---

## Quick Start

### Prerequisites
- [Hiro Wallet](https://wallet.hiro.so) browser extension
- Node.js 18+ and Python 3.11+
- [Clarinet](https://docs.hiro.so/clarinet) for contract development

### 1. Clone and install
```bash
git clone https://github.com/jayteemoney/Stackscare.git
cd Stackscare
```

### 2. Backend
```bash
cd backend
cp .env.example .env          # fill in your API keys
pip install -r requirements.txt
uvicorn main:app --port 8000 --reload
```

### 3. Frontend
```bash
cd frontend
cp .env.example .env.local    # set NEXT_PUBLIC_STACKS_NETWORK
npm install
npm run dev                   # http://localhost:3001
```

### 4. Smart Contracts (testnet)
```bash
cd claritycare-contracts
clarinet check                # verify contracts
clarinet deployments apply --testnet --no-dashboard
```

---

## Deployed Contracts (Stacks Testnet)

| Contract | Address |
|---|---|
| `stackscare` | `STV9VBEA4NB0Q2N67HD6AXP2MGSEKVAJFC8GFTT7.stackscare` |
| `molbot-registry` | `STV9VBEA4NB0Q2N67HD6AXP2MGSEKVAJFC8GFTT7.molbot-registry` |

> Verify on [Hiro Explorer (Testnet)](https://explorer.hiro.so/?chain=testnet)

---

## Project Structure

```
Stackscare/
├── docs/                      # Project documentation
│   ├── OVERVIEW.md                # Origin story, problem statement, vision
│   ├── ARCHITECTURE.md            # System design, data flows, tech stack
│   ├── SMART_CONTRACTS.md         # Clarity contract deep-dive
│   ├── X402_PROTOCOL.md           # x402 payment protocol explained
│   ├── MOLBOT_NETWORK.md          # AI agent commerce layer
│   ├── STACKS_ALIGNMENT.md        # Stacks ecosystem integration
│   ├── SECURITY.md                # Threat model and encryption
│   ├── USER_GUIDE.md              # Step-by-step usage guide
│   └── IMPACT_AND_SCALING.md      # ROI, growth strategy, sustainability
├── claritycare-contracts/     # Clarity smart contracts + tests
│   ├── contracts/
│   │   ├── stackscare.clar        # Health record ownership + access control
│   │   └── molbot-registry.clar   # On-chain agent service catalog
│   ├── tests/                     # Vitest + Clarinet SDK tests (63 passing)
│   └── deployments/
├── backend/                   # FastAPI Python backend
│   ├── main.py                    # API routes
│   ├── ai_analyzer.py             # LLM health analysis
│   ├── ipfs_client.py             # AES-256 encrypt + IPFS pin
│   ├── x402_stacks.py             # x402 payment signing
│   ├── x402_middleware.py         # FastAPI x402 middleware
│   ├── molbot_registry.py         # Agent discovery client
│   ├── molbot_orchestrator.py     # Agent-to-agent orchestration
│   └── tests/                     # Pytest test suite
└── frontend/                  # Next.js 16 frontend
    ├── src/app/                   # App router pages
    ├── src/components/            # UI components
    ├── src/hooks/                 # React hooks (wallet, records, tx)
    ├── src/lib/                   # API client, Stacks.js helpers, x402 client
    └── src/__tests__/             # Vitest component/hook tests (149 passing)
```

---

## Documentation

| Document | Description |
|---|---|
| [Overview & Origin](docs/OVERVIEW.md) | Problem statement, origin story, vision |
| [Architecture](docs/ARCHITECTURE.md) | System design, data flow, tech stack |
| [Smart Contracts](docs/SMART_CONTRACTS.md) | Clarity contract deep-dive |
| [x402 Protocol](docs/X402_PROTOCOL.md) | Payment protocol explained |
| [Molbot Network](docs/MOLBOT_NETWORK.md) | AI agent commerce layer |
| [Stacks Alignment](docs/STACKS_ALIGNMENT.md) | Ecosystem integration |
| [Security](docs/SECURITY.md) | Threat model, encryption, access control |
| [User Guide](docs/USER_GUIDE.md) | Step-by-step usage guide |
| [Impact & Scaling](docs/IMPACT_AND_SCALING.md) | ROI, growth strategy, sustainability |
| [Judging Criteria](docs/JUDGING_CRITERIA.md) | Criteria-by-criteria alignment |

---

## Test Results

```
Smart Contracts:   63/63 tests passing  (Clarinet SDK + Vitest)
Frontend:         149/149 tests passing (Vitest + React Testing Library)
Backend:           passing              (Pytest)
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Blockchain | Stacks (testnet), Bitcoin settlement |
| Smart Contracts | Clarity (v4), Clarinet |
| Frontend | Next.js 16, TypeScript, Tailwind CSS |
| Wallet | Hiro Wallet, @stacks/connect |
| Storage | IPFS via Pinata, AES-256 encryption |
| AI | Meta Llama 3.1 8B via HuggingFace Router |
| Backend | FastAPI (Python), httpx |
| Payment Protocol | x402 on Stacks (STX micropayments) |

---

## License

MIT — see [LICENSE](LICENSE)

---

*Built for the Stacks Hackathon · Inspired by the StacksHealth bounty · Powered by Bitcoin finality*
