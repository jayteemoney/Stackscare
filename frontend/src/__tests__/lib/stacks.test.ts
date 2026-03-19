/**
 * stacks.ts unit tests — all blockchain calls mocked.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@stacks/connect", () => ({
  connect: vi.fn(),
  disconnect: vi.fn(),
  isConnected: vi.fn(),
  getLocalStorage: vi.fn(),
  openContractCall: vi.fn(),
}));

vi.mock("@stacks/network", () => ({
  STACKS_MAINNET: { version: "mainnet" },
  STACKS_TESTNET: { version: "testnet" },
}));

vi.mock("@stacks/transactions", () => ({
  uintCV: vi.fn((v: number) => ({ type: "uint", value: BigInt(v) })),
  stringAsciiCV: vi.fn((v: string) => ({ type: "ascii", data: v })),
  principalCV: vi.fn((v: string) => ({ type: "principal", address: v })),
  fetchCallReadOnlyFunction: vi.fn(),
  cvToJSON: vi.fn((v: unknown) => v),
}));

import * as stacksConnect from "@stacks/connect";
import * as stacksTx from "@stacks/transactions";
import {
  connectWallet,
  disconnectWallet,
  isWalletConnected,
  getStacksAddress,
  callCreateRecord,
  callGrantAccess,
  callRevokeAccess,
  fetchPatientRecordIds,
  fetchRecord,
  checkIsAuthorized,
  verifyRecord,
  fetchTotalRecords,
  fetchTxStatus,
  explorerTxUrl,
  explorerAddressUrl,
} from "@/lib/stacks";

const mockConnect = vi.mocked(stacksConnect.connect);
const mockDisconnect = vi.mocked(stacksConnect.disconnect);
const mockIsConnected = vi.mocked(stacksConnect.isConnected);
const mockGetLocalStorage = vi.mocked(stacksConnect.getLocalStorage);
const mockOpenContractCall = vi.mocked(stacksConnect.openContractCall);
const mockFetchReadOnly = vi.mocked(stacksTx.fetchCallReadOnlyFunction);
const mockCvToJSON = vi.mocked(stacksTx.cvToJSON);

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Auth ──────────────────────────────────────────────────────────────────

describe("connectWallet", () => {
  it("calls connect() and invokes onSuccess when resolved", async () => {
    mockConnect.mockResolvedValueOnce({} as any);
    const onSuccess = vi.fn();
    connectWallet(onSuccess);
    await vi.waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
  });

  it("does not throw when connect() rejects (user cancelled)", async () => {
    mockConnect.mockRejectedValueOnce(new Error("User cancelled"));
    const onSuccess = vi.fn();
    connectWallet(onSuccess);
    await vi.waitFor(() => expect(mockConnect).toHaveBeenCalledTimes(1));
    expect(onSuccess).not.toHaveBeenCalled();
  });
});

describe("disconnectWallet", () => {
  it("calls disconnect()", () => {
    disconnectWallet();
    expect(mockDisconnect).toHaveBeenCalledTimes(1);
  });
});

describe("isWalletConnected", () => {
  it("returns true when isConnected() returns true", () => {
    mockIsConnected.mockReturnValueOnce(true);
    expect(isWalletConnected()).toBe(true);
  });

  it("returns false when isConnected() returns false", () => {
    mockIsConnected.mockReturnValueOnce(false);
    expect(isWalletConnected()).toBe(false);
  });
});

describe("getStacksAddress", () => {
  it("returns null when not connected", () => {
    mockIsConnected.mockReturnValueOnce(false);
    expect(getStacksAddress()).toBeNull();
  });

  it("returns null when no addresses in storage", () => {
    mockIsConnected.mockReturnValueOnce(true);
    mockGetLocalStorage.mockReturnValueOnce({ addresses: { stx: [] } } as any);
    expect(getStacksAddress()).toBeNull();
  });

  it("returns testnet address (ST...) when on testnet", () => {
    mockIsConnected.mockReturnValueOnce(true);
    mockGetLocalStorage.mockReturnValueOnce({
      addresses: {
        stx: [
          { address: "ST1TESTADDRESS123" },
          { address: "SP1MAINADDRESS456" },
        ],
      },
    } as any);
    // IS_MAINNET is false in test environment (no NEXT_PUBLIC_STACKS_NETWORK)
    const addr = getStacksAddress();
    expect(addr).toBe("ST1TESTADDRESS123");
  });

  it("falls back to first address if no prefix match", () => {
    mockIsConnected.mockReturnValueOnce(true);
    mockGetLocalStorage.mockReturnValueOnce({
      addresses: {
        stx: [{ address: "SP1MAINONLY" }],
      },
    } as any);
    const addr = getStacksAddress();
    expect(addr).toBe("SP1MAINONLY");
  });
});

// ── Contract write calls ──────────────────────────────────────────────────

describe("callCreateRecord", () => {
  it("calls openContractCall with create-record and correct args", () => {
    const onFinish = vi.fn();
    const onCancel = vi.fn();
    callCreateRecord("QmTestHash", "consultation", onFinish, onCancel);

    expect(mockOpenContractCall).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: "create-record",
        functionArgs: [
          expect.objectContaining({ data: "QmTestHash" }),
          expect.objectContaining({ data: "consultation" }),
        ],
      })
    );
  });

  it("invokes onFinish callback with txId from openContractCall", () => {
    const onFinish = vi.fn();
    const onCancel = vi.fn();

    mockOpenContractCall.mockImplementationOnce(({ onFinish: cb }) => {
      cb?.({ txId: "0xABCDEF" });
    });

    callCreateRecord("QmHash", "lab_result", onFinish, onCancel);
    expect(onFinish).toHaveBeenCalledWith("0xABCDEF");
  });

  it("invokes onCancel when user cancels", () => {
    const onFinish = vi.fn();
    const onCancel = vi.fn();

    mockOpenContractCall.mockImplementationOnce(({ onCancel: cb }) => {
      cb?.();
    });

    callCreateRecord("QmHash", "prescription", onFinish, onCancel);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe("callGrantAccess", () => {
  it("calls openContractCall with grant-access", () => {
    callGrantAccess(1, "ST1DOCTOR", vi.fn(), vi.fn());
    expect(mockOpenContractCall).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: "grant-access" })
    );
  });
});

describe("callRevokeAccess", () => {
  it("calls openContractCall with revoke-access", () => {
    callRevokeAccess(2, "ST1DOCTOR", vi.fn(), vi.fn());
    expect(mockOpenContractCall).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: "revoke-access" })
    );
  });
});

// ── Contract read-only calls ──────────────────────────────────────────────

describe("fetchPatientRecordIds", () => {
  it("returns parsed list of record IDs", async () => {
    mockFetchReadOnly.mockResolvedValueOnce({ type: "list" } as any);
    mockCvToJSON.mockReturnValueOnce({
      value: [{ value: "1" }, { value: "2" }, { value: "3" }],
    });

    const ids = await fetchPatientRecordIds("ST1PATIENT");
    expect(ids).toEqual([1, 2, 3]);
  });

  it("returns empty array when value is missing", async () => {
    mockFetchReadOnly.mockResolvedValueOnce({} as any);
    mockCvToJSON.mockReturnValueOnce({});

    const ids = await fetchPatientRecordIds("ST1PATIENT");
    expect(ids).toEqual([]);
  });
});

describe("fetchRecord", () => {
  it("returns parsed record on success", async () => {
    mockFetchReadOnly.mockResolvedValueOnce({} as any);
    mockCvToJSON.mockReturnValueOnce({
      success: true,
      value: {
        value: {
          owner: { value: "ST1OWNER" },
          "ipfs-hash": { value: "QmIPFSHash" },
          "record-type": { value: "consultation" },
          timestamp: { value: "12345" },
        },
      },
    });

    const record = await fetchRecord(1, "ST1OWNER");
    expect(record).toEqual({
      owner: "ST1OWNER",
      ipfsHash: "QmIPFSHash",
      recordType: "consultation",
      timestamp: 12345,
    });
  });

  it("returns null when result is not successful", async () => {
    mockFetchReadOnly.mockResolvedValueOnce({} as any);
    mockCvToJSON.mockReturnValueOnce({ success: false });

    const record = await fetchRecord(999, "ST1STRANGER");
    expect(record).toBeNull();
  });
});

describe("checkIsAuthorized", () => {
  it("returns true when authorized", async () => {
    mockFetchReadOnly.mockResolvedValueOnce({} as any);
    mockCvToJSON.mockReturnValueOnce({ value: true });

    const result = await checkIsAuthorized(1, "ST1DOCTOR", "ST1PATIENT");
    expect(result).toBe(true);
  });

  it("returns false when not authorized", async () => {
    mockFetchReadOnly.mockResolvedValueOnce({} as any);
    mockCvToJSON.mockReturnValueOnce({ value: false });

    const result = await checkIsAuthorized(1, "ST1STRANGER", "ST1PATIENT");
    expect(result).toBe(false);
  });
});

describe("verifyRecord", () => {
  it("returns public metadata on success", async () => {
    mockFetchReadOnly.mockResolvedValueOnce({} as any);
    mockCvToJSON.mockReturnValueOnce({
      success: true,
      value: {
        value: {
          owner: { value: "ST1OWNER" },
          "record-type": { value: "imaging" },
          timestamp: { value: "67890" },
        },
      },
    });

    const meta = await verifyRecord(1, "ST1ANYONE");
    expect(meta).toEqual({ owner: "ST1OWNER", recordType: "imaging", timestamp: 67890 });
  });

  it("returns null on failure", async () => {
    mockFetchReadOnly.mockResolvedValueOnce({} as any);
    mockCvToJSON.mockReturnValueOnce({ success: false });

    expect(await verifyRecord(404, "ST1ANY")).toBeNull();
  });
});

describe("fetchTotalRecords", () => {
  it("returns parsed uint count", async () => {
    mockFetchReadOnly.mockResolvedValueOnce({} as any);
    mockCvToJSON.mockReturnValueOnce({ value: "42" });

    const total = await fetchTotalRecords("ST1ANY");
    expect(total).toBe(42);
  });

  it("returns 0 when value is missing", async () => {
    mockFetchReadOnly.mockResolvedValueOnce({} as any);
    mockCvToJSON.mockReturnValueOnce({});

    const total = await fetchTotalRecords("ST1ANY");
    expect(total).toBe(0);
  });
});

// ── Stacks API helpers ────────────────────────────────────────────────────

describe("fetchTxStatus", () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns tx_status from API response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValueOnce({ tx_status: "success" }),
    });

    const status = await fetchTxStatus("0xTXID");
    expect(status).toBe("success");
  });

  it("returns 'not_found' for 404", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
    const status = await fetchTxStatus("0xUNKNOWN");
    expect(status).toBe("not_found");
  });

  it("returns 'pending' for non-ok non-404 responses", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
    const status = await fetchTxStatus("0xTX");
    expect(status).toBe("pending");
  });

  it("returns 'pending' on network error", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));
    const status = await fetchTxStatus("0xTX");
    expect(status).toBe("pending");
  });

  it("returns 'pending' when tx_status is absent", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValueOnce({}),
    });
    const status = await fetchTxStatus("0xTX");
    expect(status).toBe("pending");
  });
});

describe("explorerTxUrl", () => {
  it("generates a testnet explorer URL for a txId", () => {
    const url = explorerTxUrl("0xABCD");
    expect(url).toContain("0xABCD");
    expect(url).toContain("testnet");
  });
});

describe("explorerAddressUrl", () => {
  it("generates a testnet explorer URL for an address", () => {
    const url = explorerAddressUrl("ST1TEST");
    expect(url).toContain("ST1TEST");
    expect(url).toContain("testnet");
  });
});
