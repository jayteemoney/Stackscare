# Smart Contracts — Clarity Deep Dive

## Overview

StacksCare deploys two Clarity smart contracts on the Stacks blockchain (testnet). Together they form the immutable backbone of the platform — enforcing ownership, access control, and agent discovery without any centralized server.

Both contracts are written in **Clarity v4** and deployed to Stacks testnet at:

- `STV9VBEA4NB0Q2N67HD6AXP2MGSEKVAJFC8GFTT7.stackscare`
- `STV9VBEA4NB0Q2N67HD6AXP2MGSEKVAJFC8GFTT7.molbot-registry`

---

## Contract 1: `stackscare.clar`

### Purpose
The health record ownership contract. It stores IPFS content hashes and enforces who is allowed to access each record.

### Why Clarity is the Right Language

Clarity's **decidability** is a critical property for a health record contract. Unlike Solidity (EVM), Clarity programs can be fully analyzed before execution — there are no reentrancy attacks, no integer overflow vulnerabilities, and no opaque bytecode. The contract code is exactly what gets executed, verified, and audited. In a healthcare context where immutability is permanent, this predictability is not just a feature — it is a requirement.

### Data Structures

```clarity
;; Each health record
(define-map health-records
  { owner: principal, record-id: uint }
  {
    ipfs-hash:   (string-ascii 100),
    record-type: (string-ascii 20),
    timestamp:   uint
  }
)

;; Access control: who can read a specific record
(define-map access-control
  { record-id: uint, authorized: principal }
  { granted: bool }
)

;; Per-patient record counter
(define-map record-counters
  { owner: principal }
  { count: uint }
)

;; Global record count
(define-data-var total-records uint u0)
```

### Public Functions

#### `create-record`
```clarity
(define-public (create-record
    (ipfs-hash (string-ascii 100))
    (record-type (string-ascii 20)))
  ...)
```
Registers a new health record. The caller (`tx-sender`) becomes the immutable owner. Returns the new `record-id` on success.

**Security:** Input validation ensures non-empty hash and valid record type. The `tx-sender` binding means this cannot be called on behalf of another address.

#### `grant-access`
```clarity
(define-public (grant-access
    (record-id uint)
    (authorized principal))
  ...)
```
Grants a doctor's Stacks address read access to a specific record. Only the record owner can call this.

**Security:** `(asserts! (is-eq (get owner record) tx-sender) ERR-NOT-OWNER)` — this assertion is evaluated at runtime by the Stacks node. No backend server can bypass it.

#### `revoke-access`
```clarity
(define-public (revoke-access
    (record-id uint)
    (authorized principal))
  ...)
```
Revokes a previously granted access. Sets `granted: false` in the access-control map. The revocation is permanent and immediate upon block confirmation.

### Read-Only Functions

#### `get-record`
```clarity
(define-read-only (get-record
    (record-id uint)
    (requester principal)
    (owner principal))
  ...)
```
Returns the full record tuple (including IPFS hash) only if:
- `requester == owner`, OR
- `access-control[(record-id, requester)].granted == true`

Otherwise returns `ERR-NOT-AUTHORIZED`. This means the IPFS CID is never exposed to unauthorized parties even through public read-only queries.

#### `is-authorized`
```clarity
(define-read-only (is-authorized
    (record-id uint)
    (requester principal)
    (owner principal))
  (ok bool))
```
Used by the frontend to check current access status without requiring a wallet transaction.

### Error Codes

| Code | Meaning |
|---|---|
| `u100` | Not the record owner |
| `u101` | Record not found |
| `u102` | Not authorized to view |
| `u103` | Invalid input (empty string) |

### Test Coverage

The contract has **63 passing tests** covering:
- Successful record creation and retrieval
- Ownership enforcement (non-owner cannot modify)
- Access grant and revoke cycles
- Authorization check before and after grants
- Edge cases: empty strings, non-existent records, self-authorization

---

## Contract 2: `molbot-registry.clar`

### Purpose
An on-chain service catalog for autonomous AI agents (molbots). Any agent can register its endpoint, service type, and price. Other agents query this registry to discover and pay for specialized services.

This contract is what enables **truly decentralized agent-to-agent commerce** — no central directory, no API gateway, no intermediary. The registry is on Bitcoin-anchored Stacks.

### Data Structures

```clarity
;; Core agent storage
(define-map agents
  { agent-id: uint }
  {
    owner:        principal,
    name:         (string-ascii 50),
    endpoint-url: (string-ascii 200),
    service-type: (string-ascii 50),
    price-ustx:   uint,
    token-type:   (string-ascii 10),
    active:       bool,
    registered-at: uint
  }
)

;; Reverse lookup: one agent per principal
(define-map owner-agent
  { owner: principal }
  { agent-id: uint }
)

;; Global ordered index for enumeration
(define-map agent-index
  { idx: uint }
  { agent-id: uint }
)

;; Auto-incrementing counter
(define-data-var agent-counter uint u0)

;; Hard cap: 50 agents maximum
(define-constant MAX-AGENTS u50)
```

### Public Functions

#### `register-agent`
Registers a new molbot. Each Stacks principal can only register one agent (enforced via `owner-agent` reverse lookup). Emits a `print` event for off-chain indexers.

#### `update-agent`
Allows an agent owner to update their endpoint URL and price. Critical for dynamic pricing — an agent can lower its price during off-peak hours or raise it during high demand.

#### `deregister-agent`
Sets `active: false`. The agent remains in the registry (immutable history) but will not be returned in active discovery queries. This preserves audit trails.

### Registry Events

All write operations emit structured events via `(print {...})`:

```clarity
;; On register
{ event: "agent-registered", agent-id: uint, owner: principal,
  name: string, service-type: string, price-ustx: uint }

;; On update
{ event: "agent-updated", agent-id: uint, endpoint-url: string,
  price-ustx: uint }

;; On deregister
{ event: "agent-deregistered", agent-id: uint, owner: principal }
```

These events can be consumed by off-chain indexers (e.g., a Stacks API event listener) to maintain a real-time agent discovery service without querying the chain for every request.

### Design Decisions

**One agent per principal:** This prevents spam registration and Sybil attacks. An operator running multiple specialized agents must use separate wallet addresses for each — creating natural accountability.

**Price stored in µSTX:** The `price-ustx` field stores the cost in microSTX (1 STX = 1,000,000 µSTX). Storing in µSTX avoids decimal handling in Clarity (which only has integer arithmetic) and allows prices as low as 1 µSTX (~$0.000001 at current STX prices).

**MAX-AGENTS cap:** The constant `u50` limits the global agent list to prevent unbounded storage growth in the current implementation. This is a deliberate hackathon-scope constraint; production would use pagination or a more sophisticated indexing strategy.

---

## Deployment

### Testnet Deployment Steps

```bash
cd claritycare-contracts

# 1. Verify contract syntax
clarinet check

# 2. Run full test suite
clarinet test

# 3. Apply testnet deployment
clarinet deployments apply --testnet --no-dashboard
```

The deployment plan (`deployments/default.testnet-plan.yaml`) specifies:
- Sender: `STV9VBEA4NB0Q2N67HD6AXP2MGSEKVAJFC8GFTT7`
- Deploy order: `molbot-registry` first, then `stackscare`
- Epoch: `3.3` (latest Stacks epoch)
- Clarity version: `4`

### Contract Addresses (Testnet)

```
STV9VBEA4NB0Q2N67HD6AXP2MGSEKVAJFC8GFTT7.stackscare
STV9VBEA4NB0Q2N67HD6AXP2MGSEKVAJFC8GFTT7.molbot-registry
```

Verify at: `https://explorer.hiro.so/txid/{tx_id}?chain=testnet`

---

## Why Not Use an Existing Standard?

We evaluated SIP-009 (NFTs) and SIP-010 (fungible tokens) for representing health records but rejected both:

- **SIP-009 (NFTs):** Would make health records publicly tradeable — inappropriate for medical data. Transfer functions could be called by the NFT marketplace, creating unauthorized transfers.
- **SIP-010:** Designed for fungible tokens, not for record ownership with per-record access control.

A custom contract allows precise access semantics: per-record, per-address, revocable grants with no transfer mechanism and no marketplace compatibility. This is the correct security model for medical records.
