/**
 * useTxStatus hook tests
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

vi.mock("@/lib/stacks", () => ({
  fetchTxStatus: vi.fn(),
}));

import { fetchTxStatus } from "@/lib/stacks";
import { useTxStatus } from "@/hooks/useTxStatus";

const mockFetchTxStatus = vi.mocked(fetchTxStatus);

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useTxStatus", () => {
  it("starts as 'idle' when no txId is provided", () => {
    const { result } = renderHook(() => useTxStatus(null));
    expect(result.current).toBe("idle");
  });

  it("becomes 'pending' immediately when a txId is provided", async () => {
    mockFetchTxStatus.mockResolvedValue("pending");

    const { result } = renderHook(() => useTxStatus("0xTXID"));

    expect(result.current).toBe("pending");
    // Advance 100ms to flush the initial immediate poll() promise without
    // triggering the 5s interval (which would loop forever on "pending").
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(mockFetchTxStatus).toHaveBeenCalledWith("0xTXID");
  });

  it("calls onConfirmed when status becomes 'success'", async () => {
    mockFetchTxStatus.mockResolvedValue("success");
    const onConfirmed = vi.fn();
    const onFailed = vi.fn();

    renderHook(() => useTxStatus("0xTXID", onConfirmed, onFailed));

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(onConfirmed).toHaveBeenCalledTimes(1);
    expect(onFailed).not.toHaveBeenCalled();
  });

  it("calls onFailed when status becomes 'abort_by_response'", async () => {
    mockFetchTxStatus.mockResolvedValue("abort_by_response");
    const onConfirmed = vi.fn();
    const onFailed = vi.fn();

    renderHook(() => useTxStatus("0xABORT", onConfirmed, onFailed));

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(onFailed).toHaveBeenCalledTimes(1);
    expect(onConfirmed).not.toHaveBeenCalled();
  });

  it("calls onFailed when status becomes 'abort_by_post_condition'", async () => {
    mockFetchTxStatus.mockResolvedValue("abort_by_post_condition");
    const onFailed = vi.fn();

    renderHook(() => useTxStatus("0xABORT", undefined, onFailed));

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(onFailed).toHaveBeenCalledTimes(1);
  });

  it("does not fire callbacks twice for the same terminal status", async () => {
    mockFetchTxStatus.mockResolvedValue("success");
    const onConfirmed = vi.fn();

    renderHook(() => useTxStatus("0xTX", onConfirmed));

    await act(async () => {
      await vi.runAllTimersAsync();
    });
    // Advance timer again — should not fire again
    await act(async () => {
      vi.advanceTimersByTime(5000);
      await vi.runAllTimersAsync();
    });

    expect(onConfirmed).toHaveBeenCalledTimes(1);
  });

  it("resets to 'idle' when txId becomes null", async () => {
    mockFetchTxStatus.mockResolvedValue("pending");

    const { result, rerender } = renderHook(
      ({ txId }: { txId: string | null }) => useTxStatus(txId),
      { initialProps: { txId: "0xTX" as string | null } }
    );

    // Flush the initial poll without firing the 5s interval infinitely.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    rerender({ txId: null });
    expect(result.current).toBe("idle");
  });

  it("polls every 5 seconds for pending transactions", async () => {
    mockFetchTxStatus.mockResolvedValue("pending");

    renderHook(() => useTxStatus("0xTX"));

    // Initial immediate poll — advance 100ms to flush it without touching the 5s interval.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(mockFetchTxStatus).toHaveBeenCalledTimes(1);

    // Advance exactly 5 s to fire the interval once more.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(mockFetchTxStatus).toHaveBeenCalledTimes(2);
  });
});
