"use client";

/**
 * useStacksAuth — Stacks wallet authentication hook.
 *
 * Wraps @stacks/connect v8's sessionless auth model.
 * v8 stores connection state in localStorage (no redirect flow).
 */

import { useState, useEffect, useCallback } from "react";
import {
  connectWallet,
  disconnectWallet,
  isWalletConnected,
  getStacksAddress,
} from "@/lib/stacks";

export function useStacksAuth() {
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [address, setAddress] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(() => {
    const signedIn = isWalletConnected();
    setIsSignedIn(signedIn);
    setAddress(signedIn ? getStacksAddress() : null);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    // v8 has no redirect-back flow — just read current localStorage state
    refresh();
  }, [refresh]);

  const connect = useCallback(() => {
    connectWallet(refresh);
  }, [refresh]);

  const disconnect = useCallback(() => {
    disconnectWallet();
    setIsSignedIn(false);
    setAddress(null);
  }, []);

  return { isSignedIn, address, isLoading, connect, disconnect };
}
