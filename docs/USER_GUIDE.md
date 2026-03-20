# User Guide — Getting Started with StacksCare

## Overview

This guide walks you through every feature of StacksCare step by step. No blockchain experience required — we explain what's happening at every stage in plain English.

---

## Before You Begin: What You'll Need

### 1. Hiro Wallet Browser Extension

Hiro Wallet is the official Stacks wallet. It's a browser extension, similar to MetaMask for Ethereum.

- **Install:** Visit [wallet.hiro.so](https://wallet.hiro.so) and install the extension for Chrome, Firefox, or Brave
- **Create an account:** Follow the Hiro Wallet setup — you'll receive a 24-word recovery phrase. **Write this down and keep it safe.** It's the key to your health vault.
- **Switch to Testnet:** In Hiro Wallet settings, switch the network to "Testnet" — StacksCare currently runs on Stacks testnet

### 2. Testnet STX (for Testing)

On testnet, you use "play money" STX that has no real value. You'll need a small amount to pay blockchain transaction fees (~0.001 STX per transaction).

- Visit the Stacks testnet faucet: `https://explorer.hiro.so/sandbox/faucet?chain=testnet`
- Paste your Stacks address (starts with `ST...`) and click "Request STX"
- You'll receive 500 testnet STX — more than enough for all testing

### 3. The Application

- **Backend:** Start the FastAPI backend (`uvicorn main:app --port 8000 --reload` from the `backend/` folder)
- **Frontend:** Start the Next.js dev server (`npm run dev` from the `frontend/` folder)
- **Access:** Open `http://localhost:3001` in your browser

---

## Step 1: Connect Your Wallet

1. Open StacksCare at `http://localhost:3001`
2. You'll see the landing page with an overview of the platform
3. Click **"Enter Your Health Vault"** or navigate to `http://localhost:3001/dashboard`
4. You'll see a prompt: "Connect your Hiro Wallet to access your health vault"
5. Click **"Connect Wallet"**
6. The Hiro Wallet extension will open and ask you to approve the connection
7. Click **"Connect"** in the wallet popup
8. Your wallet address appears in the navigation bar — you're now connected

**What just happened:** You've authenticated with StacksCare using your Stacks wallet. No email, no password, no account creation required. Your wallet address is your identity.

---

## Step 2: Upload a Health Record

### Preparing Your File

StacksCare accepts:
- **PDF** — lab reports, prescriptions, referral letters
- **Images (JPG, PNG)** — scans, X-rays (photos of physical documents)
- **Text files (TXT)** — notes, symptom logs

Your file should be under 10MB for this version.

### Upload Steps

1. In the dashboard, locate the **"Upload Health Record"** card
2. Select your record type by clicking one of the options:
   - **Lab Result** — blood tests, urine analysis, biopsy results
   - **Prescription** — medication prescriptions
   - **X-ray / Scan** — radiological images
   - **Consultation** — doctor's notes from a visit
   - **Other** — anything that doesn't fit above
3. Click the upload area (or drag and drop your file) — the button activates once a file is selected
4. Click **"Save & Analyze"** — this single button does everything: encrypts your file, pins it to IPFS, triggers an AI analysis of your document, and registers your ownership on the blockchain

### What Happens Next

The **"Save & Analyze"** button runs through several stages automatically — you'll see the button label change as each step completes:

**Stage 1 — Uploading (a few seconds):**
- Your file is encrypted with AES-256
- The encrypted file is pinned to IPFS (a distributed storage network)
- You receive a content hash (CID) like `QmXxx...` — this is the file's permanent address
- An AI analysis of your file content begins in the background

**Stage 2 — Waiting for Wallet (~5 seconds):**
- Your Hiro Wallet popup opens automatically asking you to approve the transaction
- Review the transaction details and click **"Confirm"** in the wallet popup

**Stage 3 — Confirming on Blockchain (~10 seconds on testnet):**
- The CID is registered on the `stackscare.clar` smart contract, tied to your wallet address
- A banner at the top of the page shows "Saving to blockchain…"
- When confirmed: "Saved! Your record is on the blockchain."
- Your AI analysis appears inline on the upload card

**What just happened:** Your health record is now cryptographically yours. The encrypted file lives on IPFS, and the smart contract permanently records that you are the owner. No one — not StacksCare, not the backend operator, not the IPFS provider — can grant someone else access to your record.

---

## Step 3: View Your Records

After uploading, your records appear in the **"My Health Records"** section below the upload card.

Each record card shows:
- **Record type** (e.g., "Lab Result")
- **Date uploaded**
- **"View encrypted file"** — opens the raw encrypted file on IPFS (appears as binary data — it's encrypted)
- **"Share with a Doctor"** section for access management

### Reading Your Record Count

The dashboard header shows your total record count (e.g., "3 Records"). This is read directly from the smart contract — it's the authoritative count.

---

## Step 4: Share a Record with a Doctor

You can grant a doctor access to any specific record with a single transaction.

### What You Need

Your doctor needs to give you their **Stacks address** — a string starting with `ST...` (testnet) or `SP...` (mainnet). You can share your Stacks address with them the same way you'd share an email address.

### Grant Access Steps

1. Find the record you want to share in "My Health Records"
2. Click **"Share with a Doctor"** on that record's card
3. Enter the doctor's Stacks address in the input field
4. Click **"Give Access"**
5. Your Hiro Wallet popup opens — review and confirm the transaction
6. The status banner shows "Saving to blockchain…" then "Saved!"

**What just happened:** The `grant-access` function in the smart contract now records that the doctor's address is authorized to read this specific record. Only this record — not all your records. The grant is per-record and per-address.

### What the Doctor Sees

With access granted, the doctor can call `get-record` on the smart contract and receive the IPFS CID. They can then fetch the encrypted file from IPFS and decrypt it using the shared key. (In production, each patient would have their own encryption key — the doctor would receive a per-record decryption key alongside the CID.)

---

## Step 5: Revoke a Doctor's Access

Access can be revoked at any time. The revocation takes effect with the next Stacks block confirmation (~10 seconds on testnet).

### Revoke Steps

1. Find the record in "My Health Records"
2. The access management section shows the doctor's address that currently has access
3. Click **"Remove Access"** next to their address
4. Confirm in Hiro Wallet
5. After confirmation, the doctor can no longer read that record

**What just happened:** The smart contract sets `granted: false` for that doctor's access to that record. Any future call to `get-record` from that address returns `ERR-NOT-AUTHORIZED`.

### Verify Access Status

Click **"Verify"** next to any doctor's address to check their current access status without making a transaction. This calls the `is-authorized` read-only function on the contract.

---

## Step 6: AI Symptom Analysis

The **Molbot Agent Network** section of the dashboard lets you get an AI-powered health analysis without uploading a file.

### Analysis Steps

1. Scroll to the **"Multi-Agent Analysis Network"** section
2. In the text area, describe your symptoms in plain English. For example:
   - "I've had a persistent headache for 2 days, mostly on my right side, with light sensitivity"
   - "My blood pressure reading was 145/95 this morning, I also have occasional dizziness"
   - Paste the text content of a lab report for deeper analysis
3. Click **"Analyze My Symptoms"**
4. Wait 10–30 seconds while the AI agents process your request
5. Read your results in the **"Your Health Report"** section

### Understanding Your Results

The analysis includes:
- **Risk Level** — Low / Moderate / High / Critical (based on symptoms described)
- **Key Findings** — the most clinically relevant points from your description
- **Plain English Summary** — what the AI understands about your situation
- **Questions to Ask Your Doctor** — specific questions you should raise at your next appointment

**Important:** This is AI analysis for informational purposes only. Always consult a qualified healthcare provider for medical decisions.

### The AI Work Summary

Below your health report, you'll see the **"AI Work Summary"** section showing:

```
MedAnalyzer      0.01 STX    ✓ Paid    3.4s
ReportFormatter  0.005 STX   ✓ Paid    1.2s
────────────────────────────────────────────
Total cost: 0.015 STX
```

This shows which AI agents processed your request, what they were paid, and how long each took. The payments happen automatically in the background — you paid nothing.

---

## Step 7: Registering as an Agent (Advanced)

If you're a developer or AI service provider, you can register your service on the on-chain agent catalog.

### Registration Steps

1. In the "Multi-Agent Analysis Network" section, expand the "View Available Agents" panel
2. The panel shows agents currently registered on-chain
3. To register your own agent, you would call the `register-agent` function on `molbot-registry.clar` with:
   - Your service name
   - Your endpoint URL (must be publicly accessible)
   - Your service type (`symptom-analysis`, `report-formatting`, or custom)
   - Your price in µSTX
4. Once registered, the Orchestrator can discover and pay your agent automatically

---

## Troubleshooting

### "Wallet not connecting"
- Ensure the Hiro Wallet extension is installed and unlocked
- Refresh the page and try again
- Make sure you're on the Stacks testnet network in Hiro Wallet settings

### "Transaction pending too long"
- Testnet blocks confirm every ~10 seconds under normal conditions
- During testnet congestion, it may take 1–2 minutes
- If still pending after 5 minutes, check the transaction on the Hiro Explorer

### "AI analysis failed or returned an error"
- Ensure the backend is running on port 8000
- Check the backend logs for the specific error
- If you see "error-422" in the UI, the backend AI service may be temporarily unavailable — try again in a moment

### "IPFS file not loading"
- IPFS file fetching can be slow (10–30 seconds) for the first access
- The file content is encrypted — it will appear as binary data, not readable text
- This is expected behavior

### "Record not appearing after upload"
- The upload requires two confirmations: IPFS pin (immediate) and blockchain transaction (~10s)
- Wait for the "Saved!" banner before expecting to see the record
- Refresh the page if the record doesn't appear after 30 seconds

---

## Getting Help

- **Hiro Wallet Support:** [wallet.hiro.so](https://wallet.hiro.so)
- **Stacks Testnet Faucet:** Access via the Hiro Explorer sandbox
- **StacksCare Issues:** [github.com/jayteemoney/Stackscare](https://github.com/jayteemoney/Stackscare/issues)
