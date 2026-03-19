/**
 * x402Client unit tests
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock @stacks/connect before importing the module under test
vi.mock("@stacks/connect", () => ({
  isConnected: vi.fn(),
  getLocalStorage: vi.fn(),
}));

import { isConnected, getLocalStorage } from "@stacks/connect";
import {
  x402Fetch,
  isHiroWalletAvailable,
  X402PaymentError,
  X402WalletError,
  X402_PAYMENT_INFO,
} from "@/lib/x402Client";

const mockIsConnected = vi.mocked(isConnected);
const mockGetLocalStorage = vi.mocked(getLocalStorage);

describe("X402_PAYMENT_INFO", () => {
  it("has required fields", () => {
    expect(X402_PAYMENT_INFO.enabled).toBe(true);
    expect(X402_PAYMENT_INFO.network).toBeTruthy();
    expect(X402_PAYMENT_INFO.token).toBe("STX");
    expect(X402_PAYMENT_INFO.description).toBeTruthy();
  });
});

describe("isHiroWalletAvailable", () => {
  afterEach(() => {
    // Clean up window properties
    delete (window as any).StacksProvider;
    delete (window as any).HiroWalletProvider;
  });

  it("returns false when no wallet provider is present", () => {
    expect(isHiroWalletAvailable()).toBe(false);
  });

  it("returns true when StacksProvider is present", () => {
    (window as any).StacksProvider = {};
    expect(isHiroWalletAvailable()).toBe(true);
  });

  it("returns true when HiroWalletProvider is present", () => {
    (window as any).HiroWalletProvider = {};
    expect(isHiroWalletAvailable()).toBe(true);
  });
});

describe("X402PaymentError", () => {
  it("is an Error subclass with correct name", () => {
    const err = new X402PaymentError("test message");
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("X402PaymentError");
    expect(err.message).toBe("test message");
  });
});

describe("X402WalletError", () => {
  it("is an Error subclass with correct name", () => {
    const err = new X402WalletError("wallet error");
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("X402WalletError");
    expect(err.message).toBe("wallet error");
  });
});

describe("x402Fetch", () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
    mockIsConnected.mockReturnValue(false);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete (window as any).StacksProvider;
  });

  it("returns response directly for non-402 status", async () => {
    const mockResponse = { status: 200, ok: true } as Response;
    mockFetch.mockResolvedValueOnce(mockResponse);

    const result = await x402Fetch("http://test/api", { method: "POST" });
    expect(result).toBe(mockResponse);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("returns 500 response without attempting payment", async () => {
    const mockResponse = { status: 500, ok: false } as Response;
    mockFetch.mockResolvedValueOnce(mockResponse);

    const result = await x402Fetch("http://test/api");
    expect(result).toBe(mockResponse);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("throws X402PaymentError when 402 has no accepts", async () => {
    const mockResponse = {
      status: 402,
      json: vi.fn().mockResolvedValue({ x402Version: 2, accepts: [] }),
    } as unknown as Response;
    // Use mockResolvedValue (persistent) so both rejects assertions get a valid response.
    mockFetch.mockResolvedValue(mockResponse);

    await expect(x402Fetch("http://test/api")).rejects.toThrow(X402PaymentError);
    await expect(x402Fetch("http://test/api")).rejects.toThrow(
      "Server returned 402 but no payment options"
    );
  });

  it("throws X402WalletError when wallet is not available and payment required", async () => {
    const mockResponse = {
      status: 402,
      json: vi.fn().mockResolvedValueOnce({
        x402Version: 2,
        accepts: [
          {
            scheme: "exact",
            network: "stacks-testnet",
            payTo: "ST1ADDRESS",
            maxAmountRequired: "10000",
            resource: "/api/test",
            description: "Test payment",
            tokenType: "STX",
            mimeType: "application/json",
          },
        ],
      }),
    } as unknown as Response;
    mockFetch.mockResolvedValueOnce(mockResponse);
    // No StacksProvider — wallet unavailable

    await expect(x402Fetch("http://test/api")).rejects.toThrow(X402WalletError);
  });

  it("throws X402WalletError when wallet available but not connected", async () => {
    (window as any).StacksProvider = {};
    mockIsConnected.mockReturnValue(false);

    const mockResponse = {
      status: 402,
      json: vi.fn().mockResolvedValue({
        x402Version: 2,
        accepts: [
          {
            scheme: "exact",
            network: "stacks-testnet",
            payTo: "ST1ADDRESS",
            maxAmountRequired: "10000",
            resource: "/api/test",
            description: "Test",
            tokenType: "STX",
            mimeType: "application/json",
          },
        ],
      }),
    } as unknown as Response;
    // Persistent mock so both rejects assertions get a valid 402 response.
    mockFetch.mockResolvedValue(mockResponse);

    await expect(x402Fetch("http://test/api")).rejects.toThrow(X402WalletError);
    await expect(x402Fetch("http://test/api")).rejects.toThrow("No Stacks account connected");
  });

  it("retries with payment-signature header when wallet is connected", async () => {
    (window as any).StacksProvider = {};
    mockIsConnected.mockReturnValue(true);
    mockGetLocalStorage.mockReturnValue({
      addresses: {
        stx: [{ address: "ST1TESTADDRESS123" }],
      },
    } as any);

    const paymentRequiredResponse = {
      status: 402,
      json: vi.fn().mockResolvedValueOnce({
        x402Version: 2,
        accepts: [
          {
            scheme: "exact",
            network: "stacks-testnet",
            payTo: "ST1RECIPIENT",
            maxAmountRequired: "10000",
            resource: "/api/analyze/symptoms",
            description: "AI analysis",
            tokenType: "STX",
            mimeType: "application/json",
          },
        ],
      }),
    } as unknown as Response;

    const successResponse = { status: 200, ok: true } as Response;
    mockFetch
      .mockResolvedValueOnce(paymentRequiredResponse)
      .mockResolvedValueOnce(successResponse);

    const result = await x402Fetch("http://test/api/analyze/symptoms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    expect(result.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(2);

    // Second call must include payment-signature header
    const secondCallHeaders = mockFetch.mock.calls[1][1]?.headers;
    const headersObj =
      secondCallHeaders instanceof Headers
        ? Object.fromEntries(secondCallHeaders.entries())
        : secondCallHeaders;
    expect(headersObj?.["payment-signature"] ?? (headersObj as any)?.get?.("payment-signature")).toBeTruthy();
  });

  it("throws X402WalletError when wallet connected but no stx address", async () => {
    (window as any).StacksProvider = {};
    mockIsConnected.mockReturnValue(true);
    mockGetLocalStorage.mockReturnValue({
      addresses: { stx: [] },
    } as any);

    const mockResponse = {
      status: 402,
      json: vi.fn().mockResolvedValue({
        x402Version: 2,
        accepts: [
          {
            scheme: "exact",
            network: "stacks-testnet",
            payTo: "ST1",
            maxAmountRequired: "10000",
            resource: "/api/test",
            description: "Test",
            tokenType: "STX",
            mimeType: "application/json",
          },
        ],
      }),
    } as unknown as Response;
    // Persistent mock so both rejects assertions get a valid 402 response.
    mockFetch.mockResolvedValue(mockResponse);

    await expect(x402Fetch("http://test/api")).rejects.toThrow(X402WalletError);
    await expect(x402Fetch("http://test/api")).rejects.toThrow("No Stacks address found");
  });
});
