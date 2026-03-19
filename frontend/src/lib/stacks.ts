/**
 * Stacks blockchain helpers.
 *
 * @stacks/connect v8 API (breaking changes from v6/v7):
 *   - showConnect / AppConfig / UserSession → REMOVED (or no-op stubs)
 *   - Authentication: connect() — async, returns Promise<GetAddressesResult>
 *   - Sign out:       disconnect()
 *   - Auth state:     isConnected(), getLocalStorage()
 *   - Contract calls: openContractCall() — still works, same signature
 *
 * @stacks/network v7:
 *   - StacksTestnet/StacksMainnet classes → STACKS_TESTNET / STACKS_MAINNET constants
 *
 * @stacks/transactions v7:
 *   - callReadOnlyFunction → fetchCallReadOnlyFunction
 */

import {
  connect,
  disconnect,
  isConnected,
  getLocalStorage,
  openContractCall,
} from "@stacks/connect";
import { STACKS_MAINNET, STACKS_TESTNET } from "@stacks/network";
import {
  uintCV,
  stringAsciiCV,
  principalCV,
  fetchCallReadOnlyFunction,
  cvToJSON,
  type ClarityValue,
} from "@stacks/transactions";

// ===========================
// CONFIG
// ===========================

export const IS_MAINNET = process.env.NEXT_PUBLIC_STACKS_NETWORK === "mainnet";
export const NETWORK_LABEL = IS_MAINNET ? "Mainnet" : "Testnet";

export const STACKS_NETWORK = IS_MAINNET ? STACKS_MAINNET : STACKS_TESTNET;

export const CONTRACT_ADDRESS =
  process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "";

export const CONTRACT_NAME = "stackscare";

// ===========================
// AUTH  (v8 API)
// ===========================

/**
 * Open the Hiro Wallet selector modal.
 * Resolves when the user successfully connects; rejects/ignores on cancel.
 */
export function connectWallet(onSuccess: () => void) {
  // v8: connect() shows the wallet selector modal (no appDetails option)
  connect()
    .then(onSuccess)
    .catch(() => {
      // User closed the modal — not an error we need to surface
    });
}

/** Clear wallet session and redirect to home. */
export function disconnectWallet() {
  disconnect();
}

/**
 * Returns true if the user has previously connected a wallet.
 * Uses @stacks/connect's localStorage-backed state.
 */
export function isWalletConnected(): boolean {
  return isConnected();
}

/**
 * Returns the user's STX address for the current network, or null if not connected.
 *
 * Hiro Wallet provides both SP… (mainnet) and ST… (testnet) addresses.
 * We pick the one matching the configured network by address prefix.
 */
export function getStacksAddress(): string | null {
  if (!isConnected()) return null;
  const storage = getLocalStorage();
  const stxAddresses = storage?.addresses?.stx;
  if (!stxAddresses?.length) return null;
  // Mainnet addresses start with SP, testnet with ST
  const prefix = IS_MAINNET ? "SP" : "ST";
  return (
    stxAddresses.find((a) => a.address.startsWith(prefix))?.address ??
    stxAddresses[0]?.address ??
    null
  );
}

// ===========================
// CONTRACT WRITE CALLS
// (opens Hiro Wallet for user signature)
// ===========================

export function callCreateRecord(
  ipfsHash: string,
  recordType: string,
  onFinish: (txId: string) => void,
  onCancel: () => void
) {
  openContractCall({
    network: STACKS_NETWORK,
    contractAddress: CONTRACT_ADDRESS,
    contractName: CONTRACT_NAME,
    functionName: "create-record",
    functionArgs: [stringAsciiCV(ipfsHash), stringAsciiCV(recordType)],
    postConditions: [],
    onFinish: ({ txId }) => onFinish(txId),
    onCancel,
  });
}

export function callGrantAccess(
  recordId: number,
  doctorAddress: string,
  onFinish: (txId: string) => void,
  onCancel: () => void
) {
  openContractCall({
    network: STACKS_NETWORK,
    contractAddress: CONTRACT_ADDRESS,
    contractName: CONTRACT_NAME,
    functionName: "grant-access",
    functionArgs: [uintCV(recordId), principalCV(doctorAddress)],
    postConditions: [],
    onFinish: ({ txId }) => onFinish(txId),
    onCancel,
  });
}

export function callRevokeAccess(
  recordId: number,
  doctorAddress: string,
  onFinish: (txId: string) => void,
  onCancel: () => void
) {
  openContractCall({
    network: STACKS_NETWORK,
    contractAddress: CONTRACT_ADDRESS,
    contractName: CONTRACT_NAME,
    functionName: "revoke-access",
    functionArgs: [uintCV(recordId), principalCV(doctorAddress)],
    postConditions: [],
    onFinish: ({ txId }) => onFinish(txId),
    onCancel,
  });
}

// ===========================
// CONTRACT READ-ONLY CALLS
// (no wallet signature needed — free, instant)
// ===========================

async function readOnly(
  functionName: string,
  functionArgs: ClarityValue[],
  senderAddress: string
): Promise<unknown> {
  const result = await fetchCallReadOnlyFunction({
    network: STACKS_NETWORK,
    contractAddress: CONTRACT_ADDRESS,
    contractName: CONTRACT_NAME,
    functionName,
    functionArgs,
    senderAddress,
  });
  return cvToJSON(result);
}

export async function fetchPatientRecordIds(
  patientAddress: string
): Promise<number[]> {
  const result = (await readOnly(
    "get-patient-record-ids",
    [principalCV(patientAddress)],
    patientAddress
  )) as { value: { value: string }[] };

  return (result?.value ?? []).map((v) => parseInt(v.value, 10));
}

export async function fetchRecord(
  recordId: number,
  callerAddress: string
): Promise<{
  owner: string;
  ipfsHash: string;
  recordType: string;
  timestamp: number;
} | null> {
  const result = (await readOnly(
    "get-record",
    [uintCV(recordId)],
    callerAddress
  )) as {
    success: boolean;
    value?: {
      value: {
        owner: { value: string };
        "ipfs-hash": { value: string };
        "record-type": { value: string };
        timestamp: { value: string };
      };
    };
  };

  if (!result?.success) return null;
  const v = result.value!.value;
  return {
    owner: v.owner.value,
    ipfsHash: v["ipfs-hash"].value,
    recordType: v["record-type"].value,
    timestamp: parseInt(v.timestamp.value, 10),
  };
}

export async function checkIsAuthorized(
  recordId: number,
  doctorAddress: string,
  callerAddress: string
): Promise<boolean> {
  const result = (await readOnly(
    "is-authorized",
    [uintCV(recordId), principalCV(doctorAddress)],
    callerAddress
  )) as { value: boolean };
  return result?.value === true;
}

export async function verifyRecord(
  recordId: number,
  callerAddress: string
): Promise<{
  owner: string;
  recordType: string;
  timestamp: number;
} | null> {
  const result = (await readOnly(
    "verify-record",
    [uintCV(recordId)],
    callerAddress
  )) as {
    success: boolean;
    value?: {
      value: {
        owner: { value: string };
        "record-type": { value: string };
        timestamp: { value: string };
      };
    };
  };

  if (!result?.success) return null;
  const v = result.value!.value;
  return {
    owner: v.owner.value,
    recordType: v["record-type"].value,
    timestamp: parseInt(v.timestamp.value, 10),
  };
}

// ===========================
// STACKS API — TX STATUS
// ===========================

const STACKS_API_BASE = IS_MAINNET
  ? "https://api.mainnet.hiro.so"
  : "https://api.testnet.hiro.so";

/** Stacks Explorer URL for a transaction */
export function explorerTxUrl(txId: string): string {
  return `https://explorer.hiro.so/txid/${txId}?chain=${IS_MAINNET ? "mainnet" : "testnet"}`;
}

/** Stacks Explorer URL for an address */
export function explorerAddressUrl(address: string): string {
  return `https://explorer.hiro.so/address/${address}?chain=${IS_MAINNET ? "mainnet" : "testnet"}`;
}

export async function fetchTotalRecords(senderAddress: string): Promise<number> {
  const result = (await readOnly(
    "get-total-records",
    [],
    senderAddress
  )) as { value: string };
  return parseInt(result?.value ?? "0", 10);
}

export async function fetchTxStatus(txId: string): Promise<string> {
  try {
    const resp = await fetch(`${STACKS_API_BASE}/extended/v1/tx/${txId}`);
    if (resp.status === 404) return "not_found";
    if (!resp.ok) return "pending";
    const data = await resp.json();
    return data.tx_status ?? "pending";
  } catch {
    return "pending";
  }
}
