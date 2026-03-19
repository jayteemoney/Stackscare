"use client";

/**
 * useTxStatus — polls the Stacks API every 5 s for a transaction's status.
 *
 * - Starts polling when txId is provided.
 * - Calls onConfirmed when tx reaches "success".
 * - Calls onFailed when tx aborts.
 * - Automatically stops polling once a terminal state is reached.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { fetchTxStatus } from "@/lib/stacks";

export type TxStatus =
  | "idle"
  | "pending"
  | "success"
  | "abort_by_response"
  | "abort_by_post_condition"
  | "not_found";

const TERMINAL_STATES = new Set([
  "success",
  "abort_by_response",
  "abort_by_post_condition",
]);

export function useTxStatus(
  txId: string | null,
  onConfirmed?: () => void,
  onFailed?: () => void
): TxStatus {
  const [status, setStatus] = useState<TxStatus>("idle");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const firedRef = useRef(false);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!txId) {
      setStatus("idle");
      firedRef.current = false;
      clearTimer();
      return;
    }

    firedRef.current = false;
    setStatus("pending");

    const poll = async () => {
      const s = await fetchTxStatus(txId);
      setStatus(s as TxStatus);

      if (TERMINAL_STATES.has(s) && !firedRef.current) {
        firedRef.current = true;
        clearTimer();
        if (s === "success") onConfirmed?.();
        else onFailed?.();
      }
    };

    poll(); // check immediately
    timerRef.current = setInterval(poll, 5000);

    return clearTimer;
  }, [txId, clearTimer, onConfirmed, onFailed]);

  return status;
}
