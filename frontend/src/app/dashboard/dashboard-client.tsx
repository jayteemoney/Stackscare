"use client";

import Link from "next/link";
import {
  Shield,
  ArrowLeft,
  Activity,
  FileText,
  Brain,
  Wifi,
  WifiOff,
  ExternalLink,
} from "lucide-react";
import { WalletConnect } from "@/components/WalletConnect";
import { UploadRecord } from "@/components/UploadRecord";
import { RecordsList } from "@/components/RecordsList";
import MolbotNetwork from "@/components/MolbotNetwork";
import { useStacksAuth } from "@/hooks/useStacksAuth";
import { useHealthRecords } from "@/hooks/useHealthRecords";
import { useBackendHealth } from "@/hooks/useBackendHealth";
import { explorerAddressUrl, NETWORK_LABEL, fetchTotalRecords } from "@/lib/stacks";
import { useState, useEffect } from "react";

/* ── Stat card ── */

function StatCard({
  icon: Icon,
  label,
  value,
  accent,
  glow,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  accent: string;
  glow: string;
}) {
  return (
    <div
      className="glass-card flex items-center gap-4 rounded-2xl p-5"
      style={{ boxShadow: `0 0 24px ${glow}` }}
    >
      <div
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-linear-to-br ${accent} shadow-lg`}
      >
        <Icon className="h-5 w-5 text-white" />
      </div>
      <div>
        <p className="shimmer-text text-2xl font-extrabold">{value}</p>
        <p className="text-xs font-medium text-slate-500">{label}</p>
      </div>
    </div>
  );
}

/* ── Backend status ── */

function BackendPill({ healthy }: { healthy: boolean | null }) {
  if (healthy === null) return null;
  return (
    <div
      className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${
        healthy
          ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
          : "border-red-500/20 bg-red-500/10 text-red-400"
      }`}
    >
      {healthy ? (
        <>
          <Wifi className="h-3.5 w-3.5" /> AI Online
        </>
      ) : (
        <>
          <WifiOff className="h-3.5 w-3.5" /> AI Offline
        </>
      )}
    </div>
  );
}

/* ── Authenticated dashboard ── */

function DashboardContent({ address }: { address: string }) {
  const { records, isLoading, error, refresh, createRecord, grantAccess, revokeAccess } =
    useHealthRecords(address);

  const backendHealthy = useBackendHealth();
  const [totalRecords, setTotalRecords] = useState<number | null>(null);

  useEffect(() => {
    fetchTotalRecords(address)
      .then(setTotalRecords)
      .catch(() => setTotalRecords(null));
  }, [address]);

  return (
    <div className="space-y-8">
      {/* Welcome banner */}
      <div className="relative overflow-hidden rounded-2xl border border-indigo-500/20 bg-linear-to-br from-indigo-950/80 to-violet-950/60 p-6">
        {/* Glow orb */}
        <div
          className="pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full opacity-30"
          style={{
            background: "radial-gradient(circle, rgba(99,102,241,0.8) 0%, transparent 70%)",
            filter: "blur(40px)",
          }}
        />
        <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="mb-1 flex items-center gap-2 text-sm font-medium text-indigo-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
              Stacks {NETWORK_LABEL}
            </div>
            <h1 className="text-2xl font-extrabold text-white">Your Health Vault</h1>
            <a
              href={explorerAddressUrl(address)}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-flex items-center gap-1.5 font-mono text-sm text-indigo-300 hover:text-white transition"
            >
              {address.slice(0, 8)}…{address.slice(-6)}
              <ExternalLink className="h-3 w-3" />
            </a>
            <p className="mt-2 max-w-md text-sm text-slate-400">
              Your records are encrypted, private, and only accessible by you.
            </p>
          </div>
          <BackendPill healthy={backendHealthy} />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          icon={FileText}
          label="Your Records"
          value={isLoading ? "…" : records.length}
          accent="from-indigo-500 to-violet-600"
          glow="rgba(99,102,241,0.12)"
        />
        <StatCard
          icon={Brain}
          label="AI Agents"
          value={backendHealthy ? "Active" : backendHealthy === false ? "Offline" : "…"}
          accent="from-teal-500 to-cyan-500"
          glow="rgba(20,184,166,0.12)"
        />
        <StatCard
          icon={Activity}
          label="Total Chain Records"
          value={totalRecords === null ? "…" : totalRecords}
          accent="from-violet-500 to-fuchsia-500"
          glow="rgba(167,139,250,0.12)"
        />
      </div>

      {/* Main grid: Upload left, Records right */}
      <div className="grid gap-6 lg:grid-cols-2">
        <UploadRecord
          address={address}
          createRecord={createRecord}
          onSuccess={refresh}
        />
        <RecordsList
          address={address}
          records={records}
          isLoading={isLoading}
          error={error}
          refresh={refresh}
          grantAccess={grantAccess}
          revokeAccess={revokeAccess}
        />
      </div>

      {/* AI Agent Network */}
      <div className="glass-card rounded-2xl p-4 sm:p-6">
        <MolbotNetwork />
      </div>
    </div>
  );
}

/* ── Connect prompt ── */

function ConnectPrompt({ connect }: { connect: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-32 text-center">
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-linear-to-br from-indigo-600 to-violet-600 shadow-xl shadow-indigo-500/30">
        <Shield className="h-10 w-10 text-white" />
      </div>
      <h1 className="mb-3 text-3xl font-extrabold text-white">
        Your Health Data,{" "}
        <span className="gradient-text">Your Keys</span>
      </h1>
      <p className="mb-8 max-w-md leading-relaxed text-slate-400">
        Connect your Hiro Wallet to access your personal health vault. Your wallet
        address is your identity — no account, no password.
      </p>
      <button
        onClick={connect}
        className="flex items-center gap-2 rounded-xl bg-linear-to-r from-indigo-600 to-violet-600 px-8 py-4 text-base font-semibold text-white shadow-lg shadow-indigo-500/25 transition hover:scale-[1.02] active:scale-[0.98]"
      >
        Connect Hiro Wallet
      </button>
      <p className="mt-4 text-sm text-slate-500">
        Don&apos;t have a wallet?{" "}
        <a
          href="https://wallet.hiro.so"
          target="_blank"
          rel="noopener noreferrer"
          className="text-indigo-400 hover:text-indigo-300 hover:underline"
        >
          Get Hiro Wallet →
        </a>
      </p>
    </div>
  );
}

/* ── Page ── */

export default function DashboardPage() {
  const { isSignedIn, address, isLoading, connect } = useStacksAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#030711]">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
          <p className="text-sm text-slate-500">Loading StacksCare…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#030711] text-white">
      {/* Nav */}
      <nav className="sticky top-0 z-10 border-b border-white/5 glass">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 sm:py-3.5">
          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/"
              className="flex items-center gap-1 text-sm text-slate-500 transition hover:text-slate-200"
            >
              <ArrowLeft className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">Home</span>
            </Link>
            <span className="hidden sm:block text-white/15">|</span>
            <div className="flex items-center gap-1.5 sm:gap-2">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-linear-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-500/30">
                <Shield className="h-3.5 w-3.5 text-white" />
              </div>
              <span className="font-bold text-white">StacksCare</span>
            </div>
          </div>
          <WalletConnect />
        </div>
      </nav>

      <main className="mx-auto max-w-7xl overflow-x-hidden px-4 py-6 sm:px-6 sm:py-8">
        {!isSignedIn ? (
          <ConnectPrompt connect={connect} />
        ) : (
          <DashboardContent address={address!} />
        )}
      </main>
    </div>
  );
}
