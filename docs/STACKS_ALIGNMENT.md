# Stacks Ecosystem Alignment

## Overview

StacksCare is built from the ground up on the Stacks ecosystem. Every major technical component — from smart contract language to wallet integration to payment protocol — is a deliberate choice of a Stacks-native tool over a generic alternative. This document explains how and why.

---

## 1. Clarity Smart Contracts

### Why Clarity Over Solidity

The choice of Clarity was not arbitrary. For a healthcare application where contracts govern immutable access to sensitive medical data, Clarity's **decidability** is a critical property:

| Property | Clarity | Solidity |
|---|---|---|
| Reentrancy attacks | Impossible (no external calls mid-execution) | Common vulnerability |
| Integer overflow | Impossible (checked by design) | Requires SafeMath library |
| Opaque bytecode | No — source is what executes | EVM bytecode differs from source |
| Pre-execution analysis | Full program analysis possible | Halting problem applies |
| Post-conditions | Built-in (`post-conditions`) | No native equivalent |

For a contract that will govern health record ownership for potentially decades, these properties are not nice-to-haves — they are requirements.

### Clarity Features Used in StacksCare

**`tx-sender` binding:**
Every state-changing function in `stackscare.clar` uses `tx-sender` to bind the caller. There is no way for a backend server, a smart contract proxy, or an intermediary to call `create-record` on behalf of a patient. The record is cryptographically owned by the wallet that signed the transaction.

```clarity
(define-public (create-record (ipfs-hash (string-ascii 100)) (record-type (string-ascii 20)))
  (let ((owner tx-sender)  ;; immutably bound to the caller's address
        (record-id ...))
    (map-set health-records { owner: owner, record-id: record-id }
             { ipfs-hash: ipfs-hash, record-type: record-type, timestamp: block-height })
    (ok record-id)))
```

**Runtime assertions:**
Access control is enforced at the contract level — not in application logic that can be bypassed:

```clarity
(asserts! (is-eq (get owner record) tx-sender) ERR-NOT-OWNER)
```

This assertion runs inside the Stacks node. No backend misconfiguration, no API vulnerability, no JWT forgery can bypass it.

**`define-read-only`:**
The `get-record` function uses `define-read-only` with explicit authorization checks. Even public read-only queries respect access control — an unauthorized caller receives `ERR-NOT-AUTHORIZED` rather than the IPFS hash.

**Clarity v4 / Epoch 3.3:**
StacksCare targets the latest Clarity version (v4) and Stacks epoch (3.3), ensuring compatibility with the current network state and access to the latest language features.

---

## 2. Clarinet

Clarinet is used as the primary development and deployment tool for all smart contracts.

### Development Workflow

```bash
# Syntax check
clarinet check

# Run full test suite (63 tests)
clarinet test

# Deploy to testnet
clarinet deployments apply --testnet --no-dashboard
```

### Test Coverage with Clarinet SDK

Tests are written in TypeScript using the `@hirosystems/clarinet-sdk` and Vitest:

```typescript
import { describe, it, expect } from "vitest";
import { Cl } from "@stacks/transactions";
import { initSimnet } from "@hirosystems/clarinet-sdk";

const simnet = await initSimnet();

describe("stackscare", () => {
  it("create-record returns record-id for valid owner", () => {
    const { result } = simnet.callPublicFn(
      "stackscare",
      "create-record",
      [Cl.stringAscii("QmXxx..."), Cl.stringAscii("lab-result")],
      address1
    );
    expect(result).toBeOk(Cl.uint(0));
  });

  it("non-owner cannot grant access", () => {
    const { result } = simnet.callPublicFn(
      "stackscare",
      "grant-access",
      [Cl.uint(0), Cl.principal(address2)],
      address2  // not the owner
    );
    expect(result).toBeErr(Cl.uint(100));  // ERR-NOT-OWNER
  });
});
```

### Deployment Configuration

The testnet deployment plan (`deployments/default.testnet-plan.yaml`) specifies:

```yaml
id: 0
name: default-testnet
network: testnet
stacks-node: https://api.testnet.hiro.so
bitcoin-node: ...
plan:
  batches:
    - id: 0
      epoch: "3.3"
      transactions:
        - contract-publish:
            contract-name: molbot-registry
            expected-sender: STV9VBEA4NB0Q2N67HD6AXP2MGSEKVAJFC8GFTT7
            clarity-version: 4
        - contract-publish:
            contract-name: stackscare
            expected-sender: STV9VBEA4NB0Q2N67HD6AXP2MGSEKVAJFC8GFTT7
            clarity-version: 4
```

`molbot-registry` deploys first because `stackscare` may reference it in future versions. Both deploy in epoch 3.3 with Clarity v4.

---

## 3. Hiro Wallet

### Integration via `@stacks/connect`

All wallet interactions use the official `@stacks/connect` library:

```typescript
import { connect, isConnected, getLocalStorage } from "@stacks/connect";

// Connect wallet
await connect({ appDetails: { name: "StacksCare", icon: "/logo.png" } });

// Get connected address
const address = getLocalStorage()?.addresses?.stx?.[0]?.address;
```

### Transaction Signing

Smart contract calls are signed by the Hiro Wallet browser extension — the private key never leaves the wallet:

```typescript
import { openContractCall } from "@stacks/connect";
import { AnchorMode, contractPrincipalCV, uintCV } from "@stacks/transactions";

await openContractCall({
  contractAddress: "STV9VBEA4NB0Q2N67HD6AXP2MGSEKVAJFC8GFTT7",
  contractName: "stackscare",
  functionName: "grant-access",
  functionArgs: [uintCV(recordId), contractPrincipalCV(doctorAddress)],
  network: "testnet",
  anchorMode: AnchorMode.Any,
  onFinish: ({ txId }) => setCurrentTxId(txId),
});
```

The user sees the Hiro Wallet confirmation dialog, reviews the contract call details, and approves. StacksCare never has access to the signing key.

### Testnet vs Mainnet Support

The network is configurable via environment variable:

```bash
NEXT_PUBLIC_STACKS_NETWORK=testnet  # or mainnet
```

The frontend adapts all contract addresses, explorer URLs, and API endpoints based on this setting.

---

## 4. Hiro API

### Transaction Status Polling

After a wallet-signed transaction, StacksCare polls the Hiro API to track confirmation:

```typescript
// hooks/useTxStatus.ts
const pollTxStatus = async (txId: string) => {
  const res = await fetch(
    `https://api.testnet.hiro.so/extended/v1/tx/${txId}`
  );
  const { tx_status } = await res.json();
  return tx_status; // "pending", "success", "abort_by_response", etc.
};

// Polls every 5 seconds until terminal state
useEffect(() => {
  const interval = setInterval(async () => {
    const status = await pollTxStatus(currentTxId);
    setTxStatus(status);
    if (status !== "pending") clearInterval(interval);
  }, 5000);
}, [currentTxId]);
```

### Read-Only Contract Queries

The backend queries contract state without requiring a transaction or wallet:

```python
# backend/molbot_registry.py
async def get_agent(agent_id: int) -> dict:
    url = "https://api.testnet.hiro.so/v2/contracts/call-read/..."
    response = await httpx.post(url, json={"arguments": [serialize_uint(agent_id)]})
    return deserialize_clarity_value(response.json()["result"])
```

---

## 5. STX as Payment Asset

### x402 Micropayments in STX

The x402 protocol uses STX as the native payment currency for agent-to-agent commerce. All prices are denominated in **µSTX** (microSTX):

- 1 STX = 1,000,000 µSTX
- MedAnalyzer fee: 10,000 µSTX = 0.01 STX ≈ $0.003
- ReportFormatter fee: 5,000 µSTX = 0.005 STX ≈ $0.0015

STX is ideal for this use case because:
- Fees are in µSTX fractions of a cent — economically viable for AI micropayments
- Transfers settle in Stacks block time (~10s testnet, ~10min mainnet)
- No layer-2 required — STX transfers are first-class on Stacks L1

### Payment Signature Format

The x402 payment signature encodes a STX transfer authorization:

```python
payment = {
    "payer": "STV9VBEA4NB0Q2N67HD6AXP2MGSEKVAJFC8GFTT7",
    "recipient": "ST2J1G...agent_address",
    "amount_ustx": 10000,
    "nonce": "a7f3b2c1...",  # UUID, prevents replay
    "timestamp": 1710000000,
    "signature": "3044022..."  # ECDSA secp256k1
}
```

The signature is base64-encoded and sent in the `payment-signature` HTTP header.

---

## 6. Bitcoin Finality via Proof of Transfer

### Why Bitcoin Finality Matters for Health Records

Health records may need to remain accessible and verifiable for decades. A patient's ownership claim over their medical history must be durable beyond any single company's lifecycle.

Stacks achieves this through **Proof of Transfer (PoX)**: every Stacks block is cryptographically anchored to a Bitcoin block. This means:

- StacksCare ownership records inherit Bitcoin's security model
- 51% attacks on Stacks require 51% attacks on Bitcoin
- Records registered today will be verifiable as long as Bitcoin exists
- No Stacks-specific failure can erase on-chain ownership history

### Permanence for Healthcare

Traditional health record systems:
- EHR vendors go bankrupt (data loss risk)
- Hospitals merge and records migrate (integrity risk)
- Cloud providers change data retention policies (availability risk)

StacksCare on Stacks + Bitcoin:
- The record ownership mapping survives any single point of failure
- IPFS CIDs are content-addressed — the same hash always returns the same file
- Smart contract code is immutable after deployment — access rules cannot be changed

---

## 7. sBTC Integration Roadmap

As sBTC matures on the Stacks network, StacksCare will migrate x402 payments from STX to sBTC:

### Why sBTC

- sBTC is Bitcoin, pegged 1:1, fully backed
- Eliminates STX price volatility risk for pricing agent services
- Makes StacksCare payments truly Bitcoin-native
- Global exchangeability — no STX liquidity requirement

### Migration Path

The x402 payment signature format is token-agnostic. The `tokenType` field in the 402 response currently says `"STX"`:

```json
{ "tokenType": "STX", "maxAmountRequired": "10000" }
```

Switching to sBTC requires:
1. Update `tokenType` to `"sBTC"`
2. Update `create_stx_payment()` to use sBTC transfer instead of STX transfer
3. Update the middleware verification to check sBTC balance/transfer

The rest of the x402 flow — the HTTP handshake, the payment header, the middleware — remains identical.

---

## 8. What StacksCare Demonstrates About Stacks' Unique Value

StacksCare is a proof that Stacks, as a platform, uniquely enables a class of applications that no other blockchain can match:

| Requirement | Stacks | Ethereum | Solana | Bitcoin |
|---|---|---|---|---|
| Bitcoin-level security | ✓ (PoX) | ✗ | ✗ | ✓ (no smart contracts) |
| Predictable smart contracts | ✓ (Clarity) | ✗ (Turing-complete) | ✗ | N/A |
| Sub-cent micropayments | ✓ | ✗ (gas too high) | ✓ | ✗ (Lightning limited) |
| HTTP-native payment protocol | ✓ (x402) | ✗ | ✗ | ✗ |
| Mature wallet ecosystem | ✓ (Hiro) | ✓ (MetaMask) | ✓ (Phantom) | Limited |

The intersection of Bitcoin security, Clarity decidability, and STX micropayments is unique to Stacks — and StacksCare demonstrates all three in a single application.
