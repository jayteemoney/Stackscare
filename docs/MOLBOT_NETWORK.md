# Molbot Agent Network — AI Commerce on Stacks

> The first production demonstration of autonomous machine-to-machine healthcare AI commerce on a Bitcoin-secured blockchain.

---

## Table of Contents

1. [What Is a Molbot?](#what-is-a-molbot)
2. [The Three Molbots](#the-three-molbots)
3. [On-Chain Agent Discovery](#on-chain-agent-discovery)
4. [Orchestration Flow — Step by Step](#orchestration-flow--step-by-step)
5. [x402 Machine-to-Machine Payments](#x402-machine-to-machine-payments)
6. [Code: Discovery + Call + Payment](#code-discovery--call--payment)
7. [Economic Model](#economic-model)
8. [Why This Matters](#why-this-matters)
9. [Future Extensions](#future-extensions)

---

## What Is a Molbot?

A **molbot** (short for *molecule-bot*) is an autonomous AI agent that:

- Provides a specific, well-defined computational service (symptom analysis, report formatting, imaging interpretation, drug interaction checking, etc.)
- Exposes that service as an HTTP endpoint gated behind an **x402 micropayment**
- Registers its capabilities, endpoint URL, and price on the **Stacks blockchain** via the `molbot-registry.clar` smart contract
- Accepts **STX micropayments** from other agents or patients, verified on-chain

Molbots are not human-operated SaaS products — they are **economic agents**. They earn STX for every computation they perform, and they spend STX to hire other molbots when they need specialist capabilities. The entire payment layer is handled in code, without human intervention, using the x402 protocol over standard HTTP.

The key insight is that **HTTP already has a status code for payment required**: `402 Payment Required`. The x402 protocol operationalizes this long-dormant standard to create a universal machine payment rail. On StacksCare, that rail runs on Stacks (Bitcoin-secured).

---

## The Three Molbots

### 1. MedAnalyzer

| Field          | Value                                      |
|----------------|--------------------------------------------|
| Service Type   | `medical-ai`                               |
| Price          | **10,000 µSTX** (0.01 STX ≈ $0.003)       |
| Endpoint       | `POST /api/analyze/symptoms`               |
| Model          | Meta Llama 3.1 8B (via HuggingFace API)    |
| Agent ID       | `1` (on-chain registry)                    |

MedAnalyzer is the core AI reasoning engine. It receives a free-text symptom description from the Orchestrator, sends it to Llama 3.1, and returns a structured medical analysis covering probable diagnoses, recommended next steps, and urgency assessment.

The endpoint is gated by `X402StacksMiddleware`. Any request without a valid `payment-signature` header receives a `402 Payment Required` response describing the exact STX amount, recipient address, and network required. A request with a valid payment passes through to the Llama inference call.

**What it does NOT do**: provide definitive medical advice. It is an AI triage and information tool. This is made explicit in every response.

---

### 2. ReportFormatter

| Field          | Value                                       |
|----------------|---------------------------------------------|
| Service Type   | `report-formatter`                          |
| Price          | **5,000 µSTX** (0.005 STX ≈ $0.0015)       |
| Endpoint       | `POST /api/molbot/format`                   |
| Agent ID       | `3` (on-chain registry)                     |

ReportFormatter takes the raw text output from MedAnalyzer and structures it into a clean, patient-readable report with labeled sections: Summary, Possible Conditions, Recommendations, When to Seek Urgent Care, and Disclaimer.

By separating formatting from analysis, both capabilities become independently upgradeable and independently priceable. A hospital deploying a specialized formatter for cardiology reports, for example, could register it in the on-chain registry and immediately become discoverable by any Orchestrator.

---

### 3. Orchestrator

| Field          | Value                                           |
|----------------|-------------------------------------------------|
| Service Type   | `orchestrator`                                  |
| Price          | **Free for patients** (costs absorbed internally)|
| Endpoint       | `POST /api/molbot/orchestrate`                  |
| Internal cost  | Up to 15,000 µSTX per full orchestration        |

The Orchestrator is the patient-facing entry point. It abstracts the complexity of the multi-agent system behind a single API call. The patient submits symptoms and receives a formatted report — the Orchestrator handles discovering agents, making payments, chaining results, and assembling the final response.

Importantly, the Orchestrator pays other molbots **autonomously** using a server-side STX key. The patient never signs multiple transactions or knows how many agents were involved. The full **payment trail** is included in the response so patients can verify the work that was done on their behalf.

---

## On-Chain Agent Discovery

Agent discovery is the mechanism by which one molbot finds another. StacksCare implements this at two levels:

### Level 1: On-Chain Registry (Primary)

The `molbot-registry.clar` contract stores a permissionless catalog of agents. Any Stacks principal can register an agent with:

```clarity
(define-public (register-agent
    (name (string-ascii 50))
    (endpoint-url (string-ascii 200))
    (service-type (string-ascii 50))
    (price-ustx uint)
    (token-type (string-ascii 10)))
```

The registry stores:

```clarity
(define-map agents
  { agent-id: uint }
  {
    owner: principal,        ;; Who controls this agent registration
    name: (string-ascii 50),
    endpoint-url: (string-ascii 200),
    service-type: (string-ascii 50),
    price-ustx: uint,        ;; Canonical price in µSTX
    token-type: (string-ascii 10),
    active: bool,
    registered-at: uint      ;; Block height of registration
  }
)
```

The Orchestrator's Python registry client reads the on-chain data at startup:

```python
async def refresh_from_chain(self) -> bool:
    agent_count = await self._read_agent_count()
    for i in range(1, agent_count + 1):
        agent = await self._read_agent(i)
        if agent:
            chain_agents.append(agent)
    if chain_agents:
        self._agents = chain_agents
        self._loaded_from_chain = True
        return True
    return False
```

The read-only contract call uses the Hiro Stacks API:

```
POST https://api.testnet.hiro.so/v2/contracts/call-read/
     {deployer}/molbot-registry/get-agent-count
```

### Level 2: Seed Agents (Fallback)

When the blockchain is unavailable (local dev, testnet downtime, network partition), the registry falls back to an in-memory seed list that mirrors the on-chain registrations:

```python
SEED_AGENTS: list[MolbotAgent] = [
    MolbotAgent(
        agent_id=1,
        name="MedAnalyzer",
        endpoint_url="http://localhost:8000/api/analyze/symptoms",
        service_type="medical-ai",
        price_ustx=10_000,
        token_type="STX",
    ),
    MolbotAgent(
        agent_id=3,
        name="ReportFormatter",
        endpoint_url="http://localhost:8000/api/molbot/format",
        service_type="report-formatter",
        price_ustx=5_000,
        token_type="STX",
    ),
]
```

This design ensures the system degrades gracefully rather than failing entirely when the Stacks API is temporarily unreachable.

### Discovery API

```python
def discover(self, service_type: str) -> Optional[MolbotAgent]:
    """Find the first active agent matching the given service type."""
    for agent in self._agents:
        if agent.service_type == service_type and agent.active:
            return agent
    return None
```

Discovery is by `service_type` string, not by agent ID. This means the system is **agent-agnostic**: as long as a registered agent exposes the correct service type, the Orchestrator will find and use it. Multiple agents of the same type can coexist; the registry currently returns the first active match, with round-robin and auction-based selection planned for future versions.

---

## Orchestration Flow — Step by Step

```
Patient Browser
     │
     │  POST /api/molbot/orchestrate
     │  { "symptoms": "chest tightness, shortness of breath..." }
     │
     ▼
┌─────────────────────────────────────────────────────┐
│                   Orchestrator                       │
│                                                      │
│  1. registry.discover("medical-ai")                  │
│     → MedAnalyzer @ /api/analyze/symptoms            │
│                                                      │
│  2. POST /api/analyze/symptoms                       │
│     ← HTTP 402                                       │
│       payment-required: { payTo, amount: 10000 µSTX }│
│                                                      │
│  3. create_stx_payment(recipient, 10000)             │
│     encode_payment_signature(payment)                │
│                                                      │
│  4. POST /api/analyze/symptoms                       │
│     header: payment-signature: <base64-encoded>      │
│     ← HTTP 200                                       │
│       header: payment-response: settled:<tx_id>      │
│       body: { "analysis": "..." }                    │
│                                                      │
│  5. registry.discover("report-formatter")            │
│     → ReportFormatter @ /api/molbot/format           │
│                                                      │
│  6. POST /api/molbot/format                          │
│     ← HTTP 402                                       │
│       payment-required: { payTo, amount: 5000 µSTX } │
│                                                      │
│  7. create_stx_payment(recipient, 5000)              │
│                                                      │
│  8. POST /api/molbot/format                          │
│     header: payment-signature: <base64-encoded>      │
│     ← HTTP 200                                       │
│       body: { "formatted": { sections... } }         │
│                                                      │
│  9. Assemble OrchestrationResult                     │
│     total_cost_ustx = 15000                          │
└─────────────────────────────────────────────────────┘
     │
     │  HTTP 200
     │  {
     │    "rawAnalysis": "...",
     │    "formattedReport": { sections },
     │    "paymentTrail": [
     │      { molbotName, amountUstx, txId, status, durationMs },
     │      { molbotName, amountUstx, txId, status, durationMs }
     │    ],
     │    "totalCostUstx": 15000
     │  }
     ▼
Patient Browser
```

The payment trail is surfaced directly in the UI's "AI Work Summary" section, giving patients full transparency into which agents performed work on their behalf and what was paid.

### Document Analysis Flow

A parallel orchestration path handles document uploads:

1. Patient uploads a medical file (PDF, image, lab report)
2. File is encrypted with AES-256 and pinned to IPFS
3. `orchestrate_document()` discovers `medical-ai-document` agent (falls back to `medical-ai`)
4. File bytes are sent as multipart upload with x402 payment
5. Formatter receives raw analysis and structures it as above

---

## x402 Machine-to-Machine Payments

### The Protocol

x402 is an open standard for HTTP-native payments. The flow reuses standard HTTP:

| Step | HTTP Event                                   |
|------|----------------------------------------------|
| 1    | Client sends request (no payment)            |
| 2    | Server returns `402 Payment Required`        |
| 3    | Server sets `payment-required` header (base64-encoded payment details) |
| 4    | Client reads payment details, signs STX transfer |
| 5    | Client retries with `payment-signature` header |
| 6    | Server verifies signature → returns `200 OK` |
| 7    | Server sets `payment-response: settled:<tx_id>` |

### The 402 Response Body

```json
{
  "x402Version": 2,
  "accepts": [
    {
      "scheme": "exact",
      "network": "stacks-testnet",
      "payTo": "STV9VBEA4NB0Q2N67HD6AXP2MGSEKVAJFC8GFTT7",
      "maxAmountRequired": "10000",
      "resource": "POST /api/analyze/symptoms",
      "description": "AI analysis of described symptoms",
      "tokenType": "STX",
      "mimeType": "application/json"
    }
  ]
}
```

### The Payment Signature

The client (in this case, the Orchestrator acting as an autonomous payer) creates a signed STX transfer and encodes it as a base64 JSON object:

```json
{
  "signedTransaction": "0x<stacks-tx-hex>",
  "sender": "STV9VBEA4NB0Q2N67HD6AXP2MGSEKVAJFC8GFTT7",
  "recipient": "STV9VBEA4NB0Q2N67HD6AXP2MGSEKVAJFC8GFTT7",
  "amount": "10000",
  "tokenType": "STX",
  "network": "stacks-testnet",
  "timestamp": 1710854400,
  "type": "agent-to-agent"
}
```

### Middleware Implementation

The `X402StacksMiddleware` ASGI middleware intercepts every request to a paid route:

```python
PAID_ROUTES: dict[str, RoutePayment] = {
    "POST /api/analyze/document":  RoutePayment(price_ustx=10_000, token_type="STX", ...),
    "POST /api/analyze/symptoms":  RoutePayment(price_ustx=10_000, token_type="STX", ...),
    "POST /api/molbot/format":     RoutePayment(price_ustx=5_000,  token_type="STX", ...),
}
```

On a valid payment, the middleware:
1. Calls `verify_payment()` which checks recipient, amount, and optionally broadcasts to the Stacks node
2. Stores the receipt in `request.state.payment_receipt` for use by route handlers
3. Adds `payment-response: settled:<tx_id>` to the response

---

## Code: Discovery + Call + Payment

The `_call_molbot_with_x402_payment` function is the core of agent-to-agent commerce. It handles the full 402 → sign → retry cycle autonomously:

```python
async def _call_molbot_with_x402_payment(
    endpoint: str,
    payload: dict,
    price_ustx: int,
    step: PaymentStep,
) -> Optional[str]:
    async with httpx.AsyncClient(timeout=60) as client:

        # Attempt 1: no payment (expect 402)
        resp = await client.post(endpoint, json=payload,
                                 headers={"Content-Type": "application/json"})

        if resp.status_code == 402:
            # Read payment requirements from 402 body
            # Create signed STX payment
            payment = await create_stx_payment(
                recipient=settings.stx_address,
                amount_ustx=price_ustx,
                private_key=settings.stx_private_key,
                network=settings.stacks_network,
            )
            payment_header = encode_payment_signature(payment)

            # Attempt 2: with payment
            resp = await client.post(
                endpoint,
                json=payload,
                headers={
                    "Content-Type": "application/json",
                    "payment-signature": payment_header,
                },
            )

            if resp.status_code == 200:
                step.status = "paid"
                step.tx_id = resp.headers.get("payment-response", "").replace("settled:", "")
                step.duration_ms = int((time.time() - start) * 1000)
                data = resp.json()
                return data.get("analysis", data.get("formatted", str(data)))
            else:
                step.status = f"failed-{resp.status_code}"
                return None

        elif resp.status_code == 200:
            # Dev mode: endpoint didn't require payment
            step.status = "free"
            return resp.json().get("analysis", str(resp.json()))
```

The full orchestration ties discovery to payment in a linear pipeline:

```python
async def orchestrate_symptoms(symptoms: str) -> OrchestrationResult:
    result = OrchestrationResult(success=False)

    # Step 1: MedAnalyzer
    analyzer = registry.discover("medical-ai")
    analysis_step = PaymentStep(
        molbot_name=analyzer.name,
        amount_ustx=analyzer.price_ustx,
        ...
    )
    raw_analysis = await _call_molbot_with_x402_payment(
        endpoint=analyzer.endpoint_url,
        payload={"symptoms": symptoms},
        price_ustx=analyzer.price_ustx,
        step=analysis_step,
    )
    result.payment_trail.append(analysis_step)

    # Step 2: ReportFormatter
    formatter = registry.discover("report-formatter")
    format_step = PaymentStep(
        molbot_name=formatter.name,
        amount_ustx=formatter.price_ustx,
        ...
    )
    formatted = await _call_molbot_with_x402_payment(
        endpoint=formatter.endpoint_url,
        payload={"raw_analysis": raw_analysis},
        price_ustx=formatter.price_ustx,
        step=format_step,
    )
    result.payment_trail.append(format_step)

    result.success = True
    result.total_cost_ustx = sum(
        s.amount_ustx for s in result.payment_trail if s.status == "paid"
    )
    return result
```

### Payment Step Lifecycle

Each `PaymentStep` transitions through states:

```
pending → paid       (successful x402 payment)
pending → free       (dev mode, no payment required)
pending → failed-402 (payment rejected by receiving agent)
pending → error-500  (HTTP error from receiving agent)
pending → error: ... (network exception)
```

The frontend renders each step's status, duration, and transaction ID in the "AI Work Summary" panel.

---

## Economic Model

### Agent Revenue

| Agent          | Price     | Revenue per call |
|----------------|-----------|-----------------|
| MedAnalyzer    | 10,000 µSTX | 0.01 STX      |
| ReportFormatter| 5,000 µSTX  | 0.005 STX     |

At 1,000 orchestrations per day:
- MedAnalyzer: 10 STX/day
- ReportFormatter: 5 STX/day

At current STX prices ($0.30/STX), this is modest — but the economic primitive is correct. As STX price appreciates and usage scales, agents earn real revenue for real computation.

### The Flywheel

```
More patients use the platform
    → More agents earn revenue
        → More agents register specialized services
            → Platform becomes more useful
                → More patients use the platform
```

### Orchestrator Economics

In the current implementation, the Orchestrator's costs (10,000 + 5,000 = 15,000 µSTX per full orchestration) are absorbed server-side. This is a deliberate UX decision: the patient's experience is frictionless. Future versions will:

1. Charge patients a flat orchestration fee (e.g., 20,000 µSTX) via x402 from the frontend
2. Let the Orchestrator keep the margin (20,000 - 15,000 = 5,000 µSTX profit per orchestration)
3. Create an incentive to optimize the agent pipeline for cost and quality

### Agent Registration Economics

Registering a molbot costs only the Stacks transaction fee (≈ 200 µSTX). Any developer can deploy an agent, register it on-chain, and immediately participate in the healthcare AI economy. The registry is fully permissionless.

---

## Why This Matters

### First Machine-to-Machine Healthcare AI Commerce

StacksCare is, to our knowledge, the first system to demonstrate:

1. **Autonomous AI agents paying each other** using a blockchain-native micropayment protocol
2. **On-chain agent discovery** — agents find each other through a smart contract, not a centralized directory
3. **Healthcare-specific application** — not a toy demo, but a functional medical analysis pipeline
4. **Bitcoin-secured payments** — all payments settle on Stacks, which inherits Bitcoin's finality via Proof of Transfer

### Why x402 + Stacks Is the Right Stack

Traditional payment rails (credit cards, bank transfers) cannot handle:
- Sub-cent transactions (10,000 µSTX ≈ $0.003)
- Machine-initiated payments without human authorization
- Programmable, conditional payment logic
- Payments verified without a central counterparty

Stacks + x402 solves all four. The HTTP-native design means any service that can handle HTTP can participate in the agent economy without custom blockchain integration.

### Why Healthcare

Healthcare data is the most sensitive category of personal information. The $10.93 million average cost of a healthcare data breach (IBM Cost of a Data Breach Report) is driven by centralized data stores. When AI agents need to process health data, the question of who pays, who authorizes, and who is accountable becomes critical.

The Molbot Network answers all three:
- **Who pays**: the Orchestrator pays agents programmatically, on-chain, with an auditable trail
- **Who authorizes**: only the patient can grant record access; agents are authorized at the record level via `stackscare.clar`
- **Who is accountable**: every payment and every agent registration is on-chain and immutable

---

## Future Extensions

### Hospital Services as Molbots

Any hospital department could deploy a specialist molbot:
- **Radiology molbot**: accepts DICOM images, returns AI-assisted interpretation
- **Pharmacy molbot**: accepts medication lists, returns drug interaction checks
- **Lab molbot**: accepts lab result files, returns reference range analysis

Each registers in the on-chain catalog with its price and endpoint. Orchestrators discover and pay them automatically.

### Per-Record Access Payments

Future `stackscare.clar` versions could require a micropayment alongside every `grant-access` call. The record owner earns STX each time they share data for research or insurance purposes — making patients economic participants in the value their data creates.

### Subscription Bundles

Agents could register subscription tiers:
- **Pay-per-use**: current model (10,000 µSTX per call)
- **Daily pass**: 50,000 µSTX for unlimited calls for 24 hours
- **Monthly subscription**: 1 STX for 500 calls per month

The subscription state would be tracked on-chain or via a dedicated subscription contract.

### Agent Auctions

When multiple agents offer the same `service-type`, the Orchestrator could:
1. Fetch prices and reputation scores for all matching agents
2. Select the cheapest above a quality threshold
3. Or run a sealed-bid auction for complex tasks

### Cross-Chain Agent Commerce

With sBTC, the agent economy extends to Bitcoin holders. An agent could accept payment in sBTC (pegged Bitcoin on Stacks) and settle on the Bitcoin L1. This opens the healthcare AI economy to the entire Bitcoin ecosystem — over 50 million holders — without requiring they acquire STX first.

---

*The Molbot Network is not a feature — it is an economic primitive. It demonstrates that AI agents can be autonomous economic actors, discovering each other through blockchain registries and compensating each other through programmable micropayments. StacksCare is the first healthcare application of this primitive.*
