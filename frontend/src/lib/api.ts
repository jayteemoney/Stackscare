/**
 * StacksCare API Client — Molbot Commerce Edition
 *
 * Client functions for all backend endpoints:
 *   - File upload (free)
 *   - AI analysis (x402-gated with STX on Stacks)
 *   - Molbot orchestration (agent-to-agent commerce)
 *   - Molbot registry (service discovery)
 */

import { x402Fetch, X402_PAYMENT_INFO } from './x402Client';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// ── Types ──

export interface UploadResult {
  success: boolean;
  ipfs_hash: string;
  message: string;
}

export interface AnalysisResult {
  success: boolean;
  analysis: string;
  model?: string;
}

export interface MolbotAgent {
  agentId: number;
  name: string;
  endpointUrl: string;
  serviceType: string;
  priceUstx: number;
  tokenType: string;
  active?: boolean;
}

export interface PaymentStep {
  molbotName: string;
  serviceType: string;
  endpoint: string;
  amountUstx: number;
  tokenType: string;
  txId: string | null;
  status: string;
  durationMs: number | null;
}

export interface OrchestrationResult {
  success: boolean;
  rawAnalysis: string | null;
  formattedReport: Record<string, any> | null;
  paymentTrail: PaymentStep[];
  totalCostUstx: number;
  error: string | null;
}

// ── Upload (free — no x402) ──

export async function uploadRecord(
  file: File,
  recordType: string = 'other'
): Promise<UploadResult> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('record_type', recordType);

  const res = await fetch(`${API_BASE}/api/upload`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Upload failed');
  }

  return res.json();
}

// ── AI Analysis (x402-gated with STX) ──

export async function analyzeDocument(file: File): Promise<AnalysisResult> {
  const formData = new FormData();
  formData.append('file', file);

  const res = await x402Fetch(`${API_BASE}/api/analyze/document`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Document analysis failed');
  }

  return res.json();
}

export async function analyzeSymptoms(symptoms: string): Promise<AnalysisResult> {
  const res = await x402Fetch(`${API_BASE}/api/analyze/symptoms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symptoms }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Symptom analysis failed');
  }

  return res.json();
}

// ── Molbot Commerce ──

/**
 * Call the Orchestrator molbot — triggers agent-to-agent commerce.
 * The orchestrator discovers and pays specialist molbots (MedAnalyzer,
 * ReportFormatter) via x402 on Stacks, then returns aggregated results
 * with the full payment trail.
 *
 * This endpoint itself is free; the orchestrator pays internally.
 */
export async function orchestrateAnalysis(
  symptoms: string
): Promise<OrchestrationResult> {
  const res = await fetch(`${API_BASE}/api/molbot/orchestrate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symptoms }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Orchestration failed');
  }

  return res.json();
}

/**
 * List all registered molbot agents from the on-chain registry.
 */
export async function listMolbots(): Promise<{
  agents: MolbotAgent[];
  count: number;
  network: string;
}> {
  const res = await fetch(`${API_BASE}/api/molbot/registry`);

  if (!res.ok) {
    throw new Error('Failed to fetch molbot registry');
  }

  return res.json();
}

/**
 * Discover molbots by service type.
 */
export async function discoverMolbot(
  serviceType: string
): Promise<{ agents: MolbotAgent[] }> {
  const res = await fetch(`${API_BASE}/api/molbot/registry/${serviceType}`);

  if (!res.ok) {
    throw new Error(`No molbot found for service type: ${serviceType}`);
  }

  return res.json();
}

// Re-export payment info for UI components
export { X402_PAYMENT_INFO };
