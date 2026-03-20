# x402 Protocol — Machine-Native Payments on Stacks

## What is x402?

x402 is an HTTP-native payment protocol that resurrects and extends the long-dormant **HTTP 402 "Payment Required"** status code. Originally defined in the HTTP/1.1 specification in 1996, the 402 status was reserved for future use but never standardized — because no universal micropayment layer existed for the internet.

Stacks, with its programmable STX asset and Bitcoin-secured finality, provides exactly that layer. The x402 protocol defines a standard handshake where:

1. A client makes a normal HTTP request
2. The server responds with `402 Payment Required` and a payment specification
3. The client signs a STX payment and retries with a `payment-signature` header
4. The server verifies the payment and fulfills the request

This is **HTTP-native money** — no wallet popups, no blockchain confirmation waiting, no UI interruption. The payment happens in the background, as automatically as a TLS handshake.

---

## Why x402 Matters for StacksCare

StacksCare uses x402 in a context that demonstrates its full potential: **machine-to-machine payments**. The patient never touches the payment flow. The Orchestrator molbot autonomously:

1. Discovers a specialist AI agent (MedAnalyzer)
2. Calls that agent's HTTP endpoint
3. Receives a 402 with STX payment requirements
4. Signs the payment using the Orchestrator's private key
5. Gets the AI analysis back
6. Does the same for the ReportFormatter agent

The patient receives a structured health report and a payment trail showing every transaction. **The patient paid nothing — the Orchestrator paid on their behalf.** This creates a new service model where orchestrators absorb micropayment complexity and charge patients a flat fee, while specialist agents earn STX for their computational work.

---

## The x402 Handshake in Detail

### Step 1: Initial Request

```http
POST /api/analyze/symptoms HTTP/1.1
Host: localhost:8000
Content-Type: application/json

{"symptoms": "persistent headache for 2 days"}
```

### Step 2: 402 Response (x402 Challenge)

```http
HTTP/1.1 402 Payment Required
Content-Type: application/json

{
  "x402Version": 2,
  "accepts": [
    {
      "scheme": "exact",
      "network": "stacks-testnet",
      "payTo": "STV9VBEA4NB0Q2N67HD6AXP2MGSEKVAJFC8GFTT7",
      "maxAmountRequired": "10000",
      "resource": "/api/analyze/symptoms",
      "description": "AI symptom analysis — MedAnalyzer Molbot",
      "tokenType": "STX",
      "mimeType": "application/json"
    }
  ]
}
```

The `maxAmountRequired: "10000"` is denominated in µSTX — this equals **0.01 STX** (approximately $0.003 at current prices). Micropayments of this scale are economically impossible with Ethereum gas fees but trivial on Stacks.

### Step 3: Payment Signing (Orchestrator)

```python
# backend/x402_stacks.py
payment = await create_stx_payment(
    recipient=settings.stx_address,
    amount_ustx=10_000,           # 0.01 STX
    private_key=settings.stx_private_key,
    network="stacks-testnet",
)
payment_header = encode_payment_signature(payment)
```

The payment signature is a structured object encoding:
- The recipient address
- The exact amount
- A nonce (prevents replay attacks)
- A timestamp
- The payer's Stacks address
- An ECDSA signature over the above fields

### Step 4: Authenticated Retry

```http
POST /api/analyze/symptoms HTTP/1.1
Host: localhost:8000
Content-Type: application/json
payment-signature: eyJwYXllciI6IlNUVjlWQkVBNE5CMFEyTjY3...

{"symptoms": "persistent headache for 2 days"}
```

### Step 5: Payment Verification and Fulfillment

```python
# backend/x402_middleware.py
# Middleware decodes and verifies the payment-signature header
# If valid: passes request to route handler
# If invalid/missing: returns 402 again
```

The middleware verifies:
- Signature is cryptographically valid (ECDSA secp256k1)
- Payment amount meets the minimum requirement
- Payment recipient matches this server's address
- Nonce has not been used before (replay protection)
- Timestamp is within acceptable window

On success, the middleware adds a `payment-response: settled:{tx_id}` header to the response.

---

## x402 in the Molbot Network

The full payment flow during a `POST /api/molbot/orchestrate` request:

```
Patient → Orchestrator (free endpoint)
    │
    ├─→ MedAnalyzer POST /api/analyze/symptoms
    │       ← 402 (requires 0.01 STX)
    │       → POST with payment-signature header (0.01 STX signed)
    │       ← 200 + raw AI analysis + payment-response header
    │
    └─→ ReportFormatter POST /api/molbot/format
            ← 402 (requires 0.005 STX)
            → POST with payment-signature header (0.005 STX signed)
            ← 200 + structured report + payment-response header
```

The patient receives:
```json
{
  "paymentTrail": [
    {
      "molbotName": "MedAnalyzer",
      "amountUstx": 10000,
      "status": "paid",
      "txId": "0x1a2b3c...",
      "durationMs": 3421
    },
    {
      "molbotName": "ReportFormatter",
      "amountUstx": 5000,
      "status": "paid",
      "txId": "0x4d5e6f...",
      "durationMs": 1203
    }
  ],
  "totalCostUstx": 15000
}
```

This payment trail is **the proof** that work was done and fairly compensated — entirely without human oversight, entirely on Stacks.

---

## x402 vs. Alternatives

| Method | Latency | Cost | Programmability | UX |
|---|---|---|---|---|
| Credit card APIs | ~200ms | 2.9% + $0.30 | Poor | Requires account |
| Lightning Network (BTC) | ~1s | ~$0.0001 | Limited | Bitcoin only |
| Ethereum ERC-20 | ~15s | $0.50–$50 gas | Good | Complex |
| **x402 on Stacks** | **~0.5s** | **~$0.001** | **Excellent** | **HTTP-native** |

x402 on Stacks is the only solution that is:
- Cheap enough for AI micropayments ($0.001 per request)
- Fast enough for real-time API responses
- HTTP-native (no SDK required for basic clients)
- Bitcoin-secured (settlement anchors to Bitcoin L1)

---

## Browser-Side x402 Client

The frontend includes a custom `x402Client.ts` that wraps the native `fetch` API. This allows any browser-based agent or dApp to participate in x402 payments:

```typescript
// lib/x402Client.ts
export async function x402Fetch(url: string, options?: RequestInit) {
  const response = await fetch(url, options);

  if (response.status !== 402) return response;

  // Parse payment requirements
  const { accepts } = await response.json();
  if (!accepts?.length) throw new X402PaymentError("No payment options");

  // Verify wallet is connected
  if (!isHiroWalletAvailable()) throw new X402WalletError("No wallet");
  if (!isConnected()) throw new X402WalletError("No Stacks account connected");

  // Get STX address and create payment signature
  const address = getLocalStorage()?.addresses?.stx?.[0]?.address;
  const paymentHeader = buildPaymentSignature(accepts[0], address);

  // Retry with payment
  return fetch(url, {
    ...options,
    headers: { ...options?.headers, "payment-signature": paymentHeader },
  });
}
```

This makes x402 consumption as simple as replacing `fetch(url, opts)` with `x402Fetch(url, opts)` — the payment complexity is entirely abstracted.

---

## Future x402 Extensions in StacksCare

1. **Per-record access payments:** Doctors pay a small STX fee to read a patient's record. The patient earns passive income from their health data.

2. **Subscription bundles:** An orchestrator pays a monthly STX subscription for unlimited MedAnalyzer calls, rather than per-request.

3. **sBTC payments:** As sBTC matures on Stacks, x402 payments could be denominated in sBTC — making them Bitcoin-native and globally exchangeable.

4. **Cross-chain x402:** The `payment-signature` header format is chain-agnostic. Future versions could accept payment on any chain that Stacks bridges support.
