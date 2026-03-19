/**
 * useHealthRecords hook tests
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

vi.mock("@/lib/stacks", () => ({
  fetchPatientRecordIds: vi.fn(),
  fetchRecord: vi.fn(),
  callCreateRecord: vi.fn(),
  callGrantAccess: vi.fn(),
  callRevokeAccess: vi.fn(),
}));

import * as stacks from "@/lib/stacks";
import { useHealthRecords } from "@/hooks/useHealthRecords";

const mockFetchIds = vi.mocked(stacks.fetchPatientRecordIds);
const mockFetchRecord = vi.mocked(stacks.fetchRecord);
const mockCallCreate = vi.mocked(stacks.callCreateRecord);
const mockCallGrant = vi.mocked(stacks.callGrantAccess);
const mockCallRevoke = vi.mocked(stacks.callRevokeAccess);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useHealthRecords", () => {
  it("starts with empty records and no error when address is null", () => {
    const { result } = renderHook(() => useHealthRecords(null));
    expect(result.current.records).toEqual([]);
    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it("loads records when address is provided", async () => {
    mockFetchIds.mockResolvedValueOnce([1, 2]);
    mockFetchRecord
      .mockResolvedValueOnce({
        owner: "ST1OWNER",
        ipfsHash: "QmHash1",
        recordType: "consultation",
        timestamp: 100,
      })
      .mockResolvedValueOnce({
        owner: "ST1OWNER",
        ipfsHash: "QmHash2",
        recordType: "lab_result",
        timestamp: 200,
      });

    const { result } = renderHook(() => useHealthRecords("ST1OWNER"));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.records).toHaveLength(2);
    expect(result.current.records[0].recordId).toBe(1);
    expect(result.current.records[0].ipfsHash).toBe("QmHash1");
    expect(result.current.records[1].recordType).toBe("lab_result");
    expect(result.current.error).toBeNull();
  });

  it("filters out null records from fetchRecord failures", async () => {
    mockFetchIds.mockResolvedValueOnce([1, 2]);
    mockFetchRecord
      .mockResolvedValueOnce({
        owner: "ST1OWNER",
        ipfsHash: "QmHash1",
        recordType: "consultation",
        timestamp: 100,
      })
      .mockResolvedValueOnce(null); // second record not found

    const { result } = renderHook(() => useHealthRecords("ST1OWNER"));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.records).toHaveLength(1);
  });

  it("sets error when fetchPatientRecordIds throws", async () => {
    mockFetchIds.mockRejectedValueOnce(new Error("Contract not deployed"));

    const { result } = renderHook(() => useHealthRecords("ST1OWNER"));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBe("Contract not deployed");
    expect(result.current.records).toEqual([]);
  });

  it("clears records and does not load when address becomes null", async () => {
    mockFetchIds.mockResolvedValue([1]);
    mockFetchRecord.mockResolvedValue({
      owner: "ST1", ipfsHash: "Qm", recordType: "other", timestamp: 1,
    });

    const { result, rerender } = renderHook(
      ({ addr }: { addr: string | null }) => useHealthRecords(addr),
      { initialProps: { addr: "ST1OWNER" as string | null } }
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.records).toHaveLength(1);

    rerender({ addr: null });

    await waitFor(() => expect(result.current.records).toEqual([]));
  });

  it("createRecord calls callCreateRecord with correct args", async () => {
    mockFetchIds.mockResolvedValue([]);

    const { result } = renderHook(() => useHealthRecords("ST1OWNER"));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const onFinish = vi.fn();
    const onCancel = vi.fn();
    act(() => {
      result.current.createRecord("QmNewHash", "prescription", onFinish, onCancel);
    });

    expect(mockCallCreate).toHaveBeenCalledWith("QmNewHash", "prescription", onFinish, onCancel);
  });

  it("grantAccess calls callGrantAccess with correct args", async () => {
    mockFetchIds.mockResolvedValue([]);

    const { result } = renderHook(() => useHealthRecords("ST1OWNER"));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const onFinish = vi.fn();
    const onCancel = vi.fn();
    act(() => {
      result.current.grantAccess(1, "ST1DOCTOR", onFinish, onCancel);
    });

    expect(mockCallGrant).toHaveBeenCalledWith(1, "ST1DOCTOR", onFinish, onCancel);
  });

  it("revokeAccess calls callRevokeAccess with correct args", async () => {
    mockFetchIds.mockResolvedValue([]);

    const { result } = renderHook(() => useHealthRecords("ST1OWNER"));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const onFinish = vi.fn();
    const onCancel = vi.fn();
    act(() => {
      result.current.revokeAccess(1, "ST1DOCTOR", onFinish, onCancel);
    });

    expect(mockCallRevoke).toHaveBeenCalledWith(1, "ST1DOCTOR", onFinish, onCancel);
  });

  it("refresh re-fetches records", async () => {
    mockFetchIds.mockResolvedValue([]);

    const { result } = renderHook(() => useHealthRecords("ST1OWNER"));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    mockFetchIds.mockResolvedValueOnce([1]);
    mockFetchRecord.mockResolvedValueOnce({
      owner: "ST1OWNER", ipfsHash: "QmNew", recordType: "imaging", timestamp: 99,
    });

    await act(async () => {
      result.current.refresh();
    });

    await waitFor(() => expect(result.current.records).toHaveLength(1));
  });
});
