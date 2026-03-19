/**
 * API client unit tests
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock x402Client before importing api
vi.mock("@/lib/x402Client", () => ({
  x402Fetch: vi.fn(),
  X402_PAYMENT_INFO: {
    enabled: true,
    network: "Stacks Testnet",
    token: "STX",
    description: "Test payment info",
  },
}));

import { x402Fetch } from "@/lib/x402Client";
import {
  uploadRecord,
  analyzeDocument,
  analyzeSymptoms,
  orchestrateAnalysis,
  listMolbots,
  discoverMolbot,
  X402_PAYMENT_INFO,
} from "@/lib/api";

const mockX402Fetch = vi.mocked(x402Fetch);
let mockFetch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockFetch = vi.fn();
  vi.stubGlobal("fetch", mockFetch);
  vi.clearAllMocks();
});

describe("uploadRecord", () => {
  it("sends multipart POST to /api/upload and returns result", async () => {
    const mockResult = { success: true, ipfs_hash: "QmTestHash", message: "Pinned" };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValueOnce(mockResult),
    });

    const file = new File([new Uint8Array([1, 2, 3])], "test.pdf", { type: "application/pdf" });
    const result = await uploadRecord(file, "consultation");

    expect(result.ipfs_hash).toBe("QmTestHash");
    expect(result.success).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/upload"),
      expect.objectContaining({ method: "POST" })
    );
  });

  it("uses 'other' as default record type", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValueOnce({ success: true, ipfs_hash: "Qm", message: "ok" }),
    });

    const file = new File([], "test.txt");
    await uploadRecord(file);

    const formData = mockFetch.mock.calls[0][1]?.body as FormData;
    expect(formData.get("record_type")).toBe("other");
  });

  it("throws on non-ok response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      statusText: "Bad Request",
      json: vi.fn().mockResolvedValueOnce({ detail: "File type not supported" }),
    });

    const file = new File([], "bad.exe");
    await expect(uploadRecord(file)).rejects.toThrow("File type not supported");
  });

  it("falls back to statusText when no detail in error body", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      statusText: "Server Error",
      json: vi.fn().mockRejectedValueOnce(new Error("not json")),
    });

    await expect(uploadRecord(new File([], "f.pdf"))).rejects.toThrow("Server Error");
  });
});

describe("analyzeDocument", () => {
  it("calls x402Fetch and returns analysis", async () => {
    const mockResult = { success: true, analysis: "Patient has hypertension", model: "mistral" };
    mockX402Fetch.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValueOnce(mockResult),
    } as unknown as Response);

    const file = new File([new Uint8Array([1])], "doc.pdf");
    const result = await analyzeDocument(file);

    expect(result.success).toBe(true);
    expect(result.analysis).toBe("Patient has hypertension");
    expect(mockX402Fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/analyze/document"),
      expect.objectContaining({ method: "POST" })
    );
  });

  it("throws on non-ok response", async () => {
    mockX402Fetch.mockResolvedValueOnce({
      ok: false,
      statusText: "Payment Required",
      json: vi.fn().mockResolvedValueOnce({ detail: "Document analysis failed" }),
    } as unknown as Response);

    await expect(analyzeDocument(new File([], "f.pdf"))).rejects.toThrow(
      "Document analysis failed"
    );
  });
});

describe("analyzeSymptoms", () => {
  it("sends symptoms JSON and returns analysis", async () => {
    const mockResult = { success: true, analysis: "Possible flu", model: "mistral" };
    mockX402Fetch.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValueOnce(mockResult),
    } as unknown as Response);

    const result = await analyzeSymptoms("fever and headache");

    expect(result.analysis).toBe("Possible flu");
    expect(mockX402Fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/analyze/symptoms"),
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symptoms: "fever and headache" }),
      })
    );
  });

  it("throws on error response", async () => {
    mockX402Fetch.mockResolvedValueOnce({
      ok: false,
      statusText: "error",
      json: vi.fn().mockResolvedValueOnce({ detail: "Symptom analysis failed" }),
    } as unknown as Response);

    await expect(analyzeSymptoms("pain")).rejects.toThrow("Symptom analysis failed");
  });
});

describe("orchestrateAnalysis", () => {
  it("calls /api/molbot/orchestrate and returns orchestration result", async () => {
    const mockResult = {
      success: true,
      rawAnalysis: "raw text",
      formattedReport: { sections: [] },
      paymentTrail: [],
      totalCostUstx: 15000,
      error: null,
    };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValueOnce(mockResult),
    });

    const result = await orchestrateAnalysis("chest pain");

    expect(result.success).toBe(true);
    expect(result.totalCostUstx).toBe(15000);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/molbot/orchestrate"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ symptoms: "chest pain" }),
      })
    );
  });

  it("throws on error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      statusText: "error",
      json: vi.fn().mockResolvedValueOnce({ detail: "Orchestration failed" }),
    });

    await expect(orchestrateAnalysis("symptoms")).rejects.toThrow("Orchestration failed");
  });
});

describe("listMolbots", () => {
  it("fetches and returns agent list", async () => {
    const mockAgents = [
      { agentId: 1, name: "MedAnalyzer", endpointUrl: "http://localhost:8000/api/analyze/symptoms", serviceType: "medical-ai", priceUstx: 10000, tokenType: "STX", active: true },
    ];
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValueOnce({ agents: mockAgents, count: 1, network: "stacks-testnet" }),
    });

    const result = await listMolbots();

    expect(result.count).toBe(1);
    expect(result.agents[0].name).toBe("MedAnalyzer");
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/molbot/registry")
    );
  });

  it("throws on error", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false });
    await expect(listMolbots()).rejects.toThrow("Failed to fetch molbot registry");
  });
});

describe("discoverMolbot", () => {
  it("fetches agents by service type", async () => {
    const mockAgents = [
      { agentId: 1, name: "MedAnalyzer", endpointUrl: "http://localhost/api", serviceType: "medical-ai", priceUstx: 10000, tokenType: "STX" },
    ];
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValueOnce({ agents: mockAgents }),
    });

    const result = await discoverMolbot("medical-ai");

    expect(result.agents[0].serviceType).toBe("medical-ai");
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/molbot/registry/medical-ai")
    );
  });

  it("throws on 404", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false });
    await expect(discoverMolbot("unknown-type")).rejects.toThrow(
      "No molbot found for service type: unknown-type"
    );
  });
});

describe("X402_PAYMENT_INFO re-export", () => {
  it("is re-exported from api module", () => {
    expect(X402_PAYMENT_INFO).toBeDefined();
    expect(X402_PAYMENT_INFO.token).toBe("STX");
  });
});
