"use client";

import { Wallet, LogOut, Copy, Check } from "lucide-react";
import { useState } from "react";
import { useStacksAuth } from "@/hooks/useStacksAuth";

export function WalletConnect() {
  const { isSignedIn, address, isLoading, connect, disconnect } = useStacksAuth();
  const [copied, setCopied] = useState(false);

  const copyAddress = () => {
    if (!address) return;
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const short = address
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : null;

  if (isLoading) {
    return <div className="h-9 w-32 animate-pulse rounded-xl bg-white/10" />;
  }

  if (isSignedIn && address) {
    return (
      <div className="flex items-center gap-2">
        <button
          onClick={copyAddress}
          className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-slate-200 transition hover:bg-white/10 hover:border-white/20"
        >
          <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
          {short}
          {copied ? (
            <Check className="h-3.5 w-3.5 text-emerald-400" />
          ) : (
            <Copy className="h-3.5 w-3.5 text-slate-500" />
          )}
        </button>
        <button
          onClick={disconnect}
          title="Disconnect wallet"
          className="flex items-center gap-1.5 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm font-medium text-red-400 transition hover:bg-red-500/20"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={connect}
      className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition hover:shadow-indigo-500/40 hover:scale-[1.02] active:scale-[0.98]"
    >
      <Wallet className="h-4 w-4" />
      Connect Wallet
    </button>
  );
}
