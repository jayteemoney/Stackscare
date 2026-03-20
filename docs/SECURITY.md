# Security Model & Threat Analysis

## Overview

StacksCare is designed with a defense-in-depth security model across four layers: smart contract enforcement, cryptographic access control, encrypted storage, and payment integrity. This document describes the threat model, mitigations, known limitations, and the security roadmap.

---

## Threat Model

| Threat | Attack Vector | Mitigation | Status |
|---|---|---|---|
| Unauthorized record access | Direct contract call | `get-record` checks authorization on-chain | ✓ Mitigated |
| Ownership spoofing | Fake `tx-sender` | `tx-sender` is set by the Stacks node — cannot be forged | ✓ Mitigated |
| Backend data breach | Backend DB exfiltration | Backend stores no plaintext data | ✓ Mitigated |
| IPFS file snooping | Direct IPFS hash fetch | AES-256 encryption — file is unreadable without key | ✓ Mitigated |
| Replay attack on x402 | Resend captured `payment-signature` | Nonce + timestamp validation in middleware | ✓ Mitigated |
| x402 payment spoofing | Fake ECDSA signature | secp256k1 verification against payer's public key | ✓ Mitigated |
| Reentrancy attack | Recursive contract calls | Clarity is non-reentrant by design | ✓ N/A |
| Access revocation bypass | Call `get-record` after revoke | Contract checks `granted: true` at query time | ✓ Mitigated |
| Admin override | Backend modifies ownership | No ownership mutation in backend; all writes are wallet-signed | ✓ Mitigated |
| Shared AES key exposure | Backend key leak | Current: shared key risk acknowledged | ⚠ Accepted |
| Man-in-the-middle | HTTP interception | HTTPS required in production | ✓ Infra |

---

## 1. Smart Contract Security

### Clarity Decidability

Clarity's decidability provides a class of security guarantees impossible in Turing-complete languages:

- **No reentrancy:** Clarity does not support calling into arbitrary external contracts mid-execution. The attack vector that drained $60M from The DAO simply does not exist.
- **No integer overflow:** All arithmetic in Clarity is checked. There is no `unchecked{}` block, no need for SafeMath.
- **No opaque bytecode:** The source code is what gets executed. No compiler transformation introduces unexpected behavior. What you audit is what runs.
- **Pre-execution analysis:** Because Clarity programs always terminate, static analysis tools can reason fully about contract behavior before deployment.

### Ownership Binding

The `tx-sender` binding is fundamental to StacksCare's security model:

```clarity
(define-public (create-record ...)
  (let ((owner tx-sender))  ;; Set by the Stacks node from the transaction signer
    ...))
```

`tx-sender` is not a parameter that the caller passes — it is injected by the Stacks node from the transaction's cryptographic signature. There is no way to call `create-record` and claim someone else's address as the owner.

### Access Enforcement at Query Time

The `get-record` read-only function enforces authorization on every call:

```clarity
(define-read-only (get-record (record-id uint) (requester principal) (owner principal))
  (let ((record (map-get? health-records { owner: owner, record-id: record-id })))
    (if (is-none record)
        (err ERR-NOT-FOUND)
        (if (or (is-eq requester owner)
                (is-some (map-get? access-control { record-id: record-id, authorized: requester })))
            (ok (unwrap-panic record))
            (err ERR-NOT-AUTHORIZED)))))
```

Even a direct Stacks node RPC call cannot bypass this check. The IPFS CID is never exposed to unauthorized principals — even through read-only queries to the public node.

### Access Revocation

Revocation sets `granted: false` in the `access-control` map. Because `get-record` checks the live map value at query time, revocation takes effect immediately upon block confirmation. There is no session, cache, or token that remains valid after revocation.

---

## 2. Encrypted Storage Security

### AES-256 Encryption

All medical files are encrypted with AES-256 before leaving the backend:

```python
# backend/ipfs_client.py
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

def encrypt_file(data: bytes, key: bytes) -> bytes:
    iv = os.urandom(16)
    cipher = Cipher(algorithms.AES(key), modes.CBC(iv))
    encryptor = cipher.encryptor()
    # PKCS7 padding
    padded = pad(data, 16)
    ciphertext = encryptor.update(padded) + encryptor.finalize()
    return iv + ciphertext  # IV prepended to ciphertext
```

The encrypted bytes are pinned to IPFS via Pinata. The resulting CID is what gets stored on-chain.

### What an Attacker Gains from IPFS

If an attacker obtains the IPFS CID (e.g., from monitoring the blockchain), they can fetch the encrypted file. What they receive is AES-256 ciphertext — unreadable without the encryption key. Without the key, the file is computationally indistinguishable from random bytes.

### What Is Stored On-Chain

Only the IPFS CID is stored in `stackscare.clar`. No patient name, no diagnosis, no medication list, no date of birth — just a content hash that is meaningless without:
1. The ability to fetch from IPFS (requires the CID)
2. The encryption key (not stored on-chain)

---

## 3. x402 Payment Security

### Payment Signature Verification

The x402 middleware verifies five properties of every payment signature:

```python
def verify_payment(payment: PaymentSignature, required_amount: int):
    # 1. Cryptographic validity — ECDSA secp256k1
    public_key = recover_public_key(payment.signature, payment.message_hash)
    expected_address = public_key_to_stacks_address(public_key)
    if expected_address != payment.payer:
        raise PaymentVerificationError("Signature does not match payer address")

    # 2. Amount check
    if payment.amount_ustx < required_amount:
        raise PaymentVerificationError("Insufficient payment amount")

    # 3. Recipient check
    if payment.recipient != settings.stx_address:
        raise PaymentVerificationError("Payment not addressed to this server")

    # 4. Replay protection — nonce must not have been seen before
    if payment.nonce in used_nonces:
        raise PaymentVerificationError("Nonce already used")
    used_nonces.add(payment.nonce)

    # 5. Timestamp window — reject stale or future-dated signatures
    age = abs(time.time() - payment.timestamp)
    if age > 300:  # 5-minute window
        raise PaymentVerificationError("Payment signature expired")
```

### Replay Attack Prevention

Each payment signature includes a UUID nonce. The middleware maintains an in-memory set of used nonces. A captured `payment-signature` header cannot be resent — the middleware rejects it with `400 Bad Request` on the second use.

### Payment Destination Validation

The middleware checks that `payment.recipient` matches the server's own STX address. An attacker cannot use a valid payment to a different address to access this endpoint.

---

## 4. Data Transmission Security

### No Plaintext Medical Data in Transit

The upload flow ensures medical data is encrypted before it reaches any external service:

```
Patient browser → HTTPS → FastAPI backend → AES-256 encrypt → IPFS (Pinata)
```

The backend receives the raw file, encrypts it, and sends only the ciphertext to IPFS. Neither the IPFS pin service nor any network observer sees the plaintext.

### HTTPS Enforcement

All production endpoints enforce HTTPS. The x402 payment signature, while cryptographically signed, is sent over HTTP in development (`localhost`) only. Production deployments require TLS.

---

## 5. Known Limitations & Accepted Risks

### Shared AES Encryption Key

**Current state:** A single AES-256 key is stored in the backend's `.env` file. All records are encrypted with this key.

**Risk:** If the backend server is compromised, an attacker gains the decryption key and can decrypt all stored medical files.

**Mitigation:** The `.env` file is excluded from version control. The backend is stateless and can be run in a secure enclave.

**Roadmap:** Client-side encryption using the patient's Hiro Wallet-derived key. The patient's wallet signs a "derive encryption key" message, and the resulting key is used in the browser before the file is sent to the backend. The backend never sees the key.

### No Per-User Encryption Keys

**Current state:** All patients share the same AES key. A backend operator can decrypt any record.

**Risk:** Backend operator can read all medical records.

**Roadmap:** Per-patient encryption using wallet-derived keys. Each patient's records are encrypted with a key only they can derive from their wallet. The backend becomes a blind relay.

### MAX-AGENTS Cap

The `molbot-registry.clar` enforces a hard cap of 50 agents:

```clarity
(define-constant MAX-AGENTS u50)
(asserts! (< (var-get agent-counter) MAX-AGENTS) ERR-MAX-AGENTS-REACHED)
```

**Risk:** If 50 agents register before legitimate agents, the registry is full.

**Mitigation:** This is a deliberate hackathon-scope constraint. Production would implement pagination, a stake-based registration, or governance for agent approval.

---

## 6. What StacksCare Does NOT Do

- **Does not store medical data on-chain.** The blockchain only holds IPFS CIDs and access permissions.
- **Does not log patient addresses publicly beyond what Stacks provides.** All transactions are visible on-chain (this is inherent to public blockchains), but the transaction data contains only the CID and access grants — not the medical content.
- **Does not maintain a backend database** of patient records, sessions, or user accounts. The backend is stateless.
- **Does not require email, phone number, or any PII** to use the platform. The only identity is a Stacks wallet address.

---

## 7. Security vs. Traditional Health Record Systems

| Property | Traditional EHR | StacksCare |
|---|---|---|
| Data stored at | Hospital/vendor server | IPFS (encrypted) |
| Access control enforced by | Hospital IT policy | Immutable smart contract |
| Override mechanism | Admin SQL update | None — contract is immutable |
| Audit trail | Internal logs (mutable) | On-chain (permanent) |
| Breach impact | Plaintext PII exposed | AES-256 ciphertext only |
| Data portability | Fax or portal export | IPFS CID (permanent URL) |
| Revocation latency | Hours to days | ~10 seconds (next Stacks block) |

---

## 8. Security Roadmap

| Priority | Feature | Impact |
|---|---|---|
| High | Client-side wallet-derived encryption | Eliminates server-side key risk |
| High | Per-patient encryption keys | Eliminates shared-key risk |
| Medium | IPFS CID access logging | Audit trail for off-chain accesses |
| Medium | Rate limiting on x402 endpoints | Prevents payment signature brute-force |
| Low | Agent stake requirement | Prevents Sybil attacks on registry |
| Low | Formal security audit (pre-mainnet) | Independent verification of contract logic |
