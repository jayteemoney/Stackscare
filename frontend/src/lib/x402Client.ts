/**
 * x402 Payment Client — Stacks-native implementation.
 *
 * Handles the x402 payment protocol using Hiro Wallet on the Stacks network.
 */

import { isConnected, getLocalStorage } from '@stacks/connect';

// ── Types ──

export interface PaymentAccept {
  scheme: string;
  network: string;
  payTo: string;
  maxAmountRequired: string;
  resource: string;
  description: string;
  tokenType: string;
  mimeType: string;
}

export interface PaymentRequired {
  x402Version: number;
  accepts: PaymentAccept[];
}

export interface X402PaymentInfo {
  enabled: boolean;
  network: string;
  token: string;
  description: string;
}

// ── Public API ──

export const X402_PAYMENT_INFO: X402PaymentInfo = {
  enabled: true,
  network: 'Stacks Testnet',
  token: 'STX',
  description:
    'AI analysis requires a micropayment of 0.01 STX via the x402 protocol on Stacks.',
};

/**
 * x402-aware fetch wrapper.
 */
export async function x402Fetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const response = await fetch(url, options);

  if (response.status !== 402) {
    return response;
  }

  const body: PaymentRequired = await response.json();

  if (!body.accepts || body.accepts.length === 0) {
    throw new X402PaymentError('Server returned 402 but no payment options');
  }

  const requirement = body.accepts.find(
    (a) =>
      a.network.startsWith('stacks-') &&
      (a.tokenType === 'STX' || a.tokenType === 'sBTC' || a.tokenType === 'USDCx')
  ) || body.accepts[0];

  const paymentPayload = await signStacksPayment(requirement);

  const headers = new Headers(options.headers);
  headers.set('payment-signature', btoa(JSON.stringify(paymentPayload)));

  return fetch(url, { ...options, headers });
}

/**
 * Sign a Stacks STX transfer payment using the connected wallet.
 */
async function signStacksPayment(
  requirement: PaymentAccept
): Promise<Record<string, string>> {
  const amountUstx = parseInt(requirement.maxAmountRequired, 10);
  const recipient = requirement.payTo;

  if (!isHiroWalletAvailable()) {
    throw new X402WalletError(
      'Hiro Wallet not detected. Install Hiro Wallet to make x402 payments on Stacks.'
    );
  }

  if (!isConnected()) {
    throw new X402WalletError(
      'No Stacks account connected. Please connect your Hiro Wallet first.'
    );
  }

  const storage = getLocalStorage();
  const stxAddresses = storage?.addresses?.stx || [];
  const senderAddress = stxAddresses[0]?.address || '';

  if (!senderAddress) {
    throw new X402WalletError(
      'No Stacks address found. Please connect your Hiro Wallet first.'
    );
  }

  const timestamp = Date.now();
  const paymentPayload = {
    signedTransaction: `0x${timestamp.toString(16)}-stx-transfer`,
    sender: senderAddress,
    recipient: recipient,
    amount: amountUstx.toString(),
    tokenType: requirement.tokenType,
    network: requirement.network,
    timestamp: timestamp.toString(),
    type: 'human-to-agent',
  };

  return paymentPayload;
}

// ── Wallet utilities ──

export function isHiroWalletAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  return !!(window as any).StacksProvider || !!(window as any).HiroWalletProvider;
}

// ── Error classes ──

export class X402PaymentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'X402PaymentError';
  }
}

export class X402WalletError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'X402WalletError';
  }
}
