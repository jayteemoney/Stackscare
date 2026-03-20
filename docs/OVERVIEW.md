# Project Overview — Origin, Vision & Problem Statement

## Origin Story

StacksCare was born directly from the **StacksHealth bounty challenge**:

> *"A platform that uses Stacks technology to create a secure, patient-owned health record system. Integrates with healthcare providers and leverages smart contracts to ensure privacy and data integrity."*

The idea resonated because it addresses a universal problem that affects billions of people regardless of geography, wealth, or technical literacy: **patients have no control over the most personal data that exists about them — their health records.**

The team asked a simple question: *What if your medical history lived in your wallet, not in a hospital's database?*

That question became StacksCare.

---

## The Global Health Data Crisis

### Scale of the Problem

- **2.7 billion people** in developing nations lack any form of portable health records
- In the United States alone, **700+ million health records** have been breached since 2009
- The average cost of a healthcare data breach is **$10.93 million** — the highest of any industry
- **30% of patients** in the US report that their doctor did not have access to their previous medical records at point of care
- An estimated **$8.3 billion** is lost annually in the US due to duplicate medical tests caused by inaccessible records

### The Root Cause

The fundamental issue is **custodianship**. Today's health record systems were designed around institutions, not patients:

1. **Hospital A** stores your MRI results on their private server
2. **Hospital B** (where you move or travel to) cannot access those results
3. You request a copy — it arrives weeks later, often incomplete, possibly on a CD-ROM
4. If the hospital suffers a breach, your name, diagnosis, medications, and insurance data are exposed
5. You have no legal mechanism to prevent Hospital A from selling anonymized versions of your data to pharmaceutical companies

This is not a data quality problem. It is a **data sovereignty problem.** The data exists. Patients just don't own it.

---

## Why Blockchain? Why Stacks?

Most blockchain health record projects fail because they attempt to store medical data on-chain — expensive, slow, and privacy-destroying. StacksCare takes a fundamentally different approach:

**Store the proof on-chain. Store the data off-chain.**

| Layer | What's Stored | Technology |
|---|---|---|
| On-chain | Ownership proof, access permissions, audit trail | Stacks (Clarity) |
| Off-chain | Encrypted medical file | IPFS (Pinata) |
| Client-side | Decryption key | Patient's wallet |

This architecture means:
- The blockchain never sees your medical data
- The medical data is unreadable without your key
- Ownership and access rights are enforced by immutable code, not by a company's privacy policy

**Why Stacks specifically?**

Stacks provides something no other blockchain offers for this use case: **Bitcoin finality.** Every Stacks block is eventually anchored to Bitcoin via Proof of Transfer (PoX). This means the ownership records in StacksCare inherit Bitcoin's security — the most battle-tested, decentralized consensus layer in existence. For health records that may need to remain valid for decades, this permanence matters.

---

## What StacksCare Builds

StacksCare is not just a health records viewer. It is a **full-stack patient sovereignty platform** with three distinct layers:

### Layer 1: Health Vault (Records Ownership)
A patient connects their Hiro Wallet and uploads a medical document. The file is encrypted with AES-256 in the backend, pinned to IPFS, and the content hash (CID) is registered on the `stackscare.clar` contract. The patient now owns that record cryptographically — not as a legal claim, but as a mathematical fact.

### Layer 2: Access Control (Permission Management)
The patient grants or revokes a doctor's Stacks address access to any specific record via a single transaction. The smart contract enforces this. No database administrator, no support ticket, no waiting period — one transaction and it is done.

### Layer 3: Molbot Commerce Network (AI Agent Economy)
The most innovative layer: an autonomous network of AI agents that discover each other via an on-chain registry (`molbot-registry.clar`), pay each other with STX micropayments using the **x402 protocol**, and produce structured health analysis reports. This demonstrates a new economic primitive: **machines paying machines to do medical work on behalf of patients.**

---

## Vision

StacksCare's long-term vision is to become the infrastructure layer for patient-controlled health data globally.

In five years:
- A patient in Lagos, Nigeria can share their vaccination history with a clinic in London with one wallet transaction
- Hospitals and clinics integrate as "healthcare provider molbots" — registering their services on-chain and getting paid automatically via x402 for processing record requests
- Pharmaceutical researchers pay STX directly to patients who voluntarily share anonymized records — patients earn from their own data
- Health insurance companies query on-chain access logs (not the records themselves) to verify coverage claims, eliminating fraud
- Governments issue digital health certificates anchored to Bitcoin through Stacks, verifiable by any party worldwide

This is not speculative. Every technical primitive needed for this vision exists in StacksCare today.
