"use client";

import {
  RefreshCw,
  ExternalLink,
  Shield,
  ShieldCheck,
  ShieldOff,
  Loader2,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  FileX,
  Link2,
} from "lucide-react";
import { useState, useCallback } from "react";
import {
  RECORD_TYPE_LABELS,
  RECORD_TYPE_ICONS,
  type HealthRecord,
  type RecordType,
} from "@/types";
import { explorerAddressUrl, checkIsAuthorized } from "@/lib/stacks";
import { useTxStatus } from "@/hooks/useTxStatus";
import { TxBanner } from "@/components/TxBanner";
import toast from "react-hot-toast";

interface Props {
  address: string;
  records: HealthRecord[];
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
  grantAccess: (
    recordId: number,
    doctorAddress: string,
    onFinish: (txId: string) => void,
    onCancel: () => void
  ) => void;
  revokeAccess: (
    recordId: number,
    doctorAddress: string,
    onFinish: (txId: string) => void,
    onCancel: () => void
  ) => void;
}

export function RecordsList({
  address,
  records,
  isLoading,
  error,
  refresh,
  grantAccess,
  revokeAccess,
}: Props) {
  const [expandedId, setExpandedId] = useState<number | null>(null);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-xl bg-white/5" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-500/20 bg-red-500/8 p-6">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
          <div>
            <p className="font-semibold text-red-300">Could not load your records</p>
            <p className="mt-1 text-sm text-red-400/70">
              Make sure your wallet is connected and the network is correct.
            </p>
          </div>
        </div>
        <button
          onClick={refresh}
          className="mt-4 flex items-center gap-1.5 rounded-lg border border-red-500/20 bg-white/5 px-3 py-1.5 text-sm text-red-400 transition hover:bg-red-500/10"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Try again
        </button>
      </div>
    );
  }

  return (
    <div className="glass-card rounded-2xl p-4 sm:p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-bold text-white">
          My Records
          <span className="rounded-full bg-indigo-500/20 px-2 py-0.5 text-sm font-semibold text-indigo-300">
            {records.length}
          </span>
        </h2>
        <button
          onClick={refresh}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-slate-400 transition hover:bg-white/5 hover:text-slate-200"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {records.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-14 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/5">
            <FileX className="h-7 w-7 text-slate-600" />
          </div>
          <p className="font-semibold text-slate-400">No records yet</p>
          <p className="text-sm text-slate-500">Upload your first medical document on the left</p>
        </div>
      ) : (
        <div className="space-y-3">
          {records.map((record) => (
            <RecordCard
              key={record.recordId}
              address={address}
              record={record}
              expanded={expandedId === record.recordId}
              onToggle={() =>
                setExpandedId(expandedId === record.recordId ? null : record.recordId)
              }
              grantAccess={grantAccess}
              revokeAccess={revokeAccess}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Record Card ── */

interface CardProps {
  address: string;
  record: HealthRecord;
  expanded: boolean;
  onToggle: () => void;
  grantAccess: Props["grantAccess"];
  revokeAccess: Props["revokeAccess"];
}

function RecordCard({ address, record, expanded, onToggle, grantAccess, revokeAccess }: CardProps) {
  const type = record.recordType as RecordType;
  const label = RECORD_TYPE_LABELS[type] || record.recordType;
  const icon = RECORD_TYPE_ICONS[type] || "📋";

  const [doctorInput, setDoctorInput] = useState("");
  const [pendingTxId, setPendingTxId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<"grant" | "revoke" | null>(null);
  const [accessStatus, setAccessStatus] = useState<
    "idle" | "checking" | "authorized" | "unauthorized"
  >("idle");

  const handleTxConfirmed = useCallback(() => {
    toast.success(pendingAction === "grant" ? "Access granted!" : "Access revoked!");
    setPendingTxId(null);
    setPendingAction(null);
    setDoctorInput("");
  }, [pendingAction]);

  const handleTxFailed = useCallback(() => {
    toast.error("Transaction failed");
    setPendingTxId(null);
    setPendingAction(null);
  }, []);

  const accessTxStatus = useTxStatus(pendingTxId, handleTxConfirmed, handleTxFailed);

  const handleCheckAccess = async () => {
    const addr = doctorInput.trim();
    if (!addr) { toast.error("Enter a wallet address to check"); return; }
    setAccessStatus("checking");
    try {
      const ok = await checkIsAuthorized(record.recordId, addr, address);
      setAccessStatus(ok ? "authorized" : "unauthorized");
    } catch {
      setAccessStatus("idle");
      toast.error("Could not verify — is the contract deployed?");
    }
  };

  const handleGrant = () => {
    const addr = doctorInput.trim();
    if (!addr) { toast.error("Enter a wallet address first"); return; }
    setPendingAction("grant");
    grantAccess(
      record.recordId,
      addr,
      (txId) => { setPendingTxId(txId); toast.success("Submitted — waiting for confirmation…"); },
      () => { toast.error("Cancelled"); setPendingAction(null); }
    );
  };

  const handleRevoke = () => {
    const addr = doctorInput.trim();
    if (!addr) { toast.error("Enter the wallet address to remove"); return; }
    setPendingAction("revoke");
    revokeAccess(
      record.recordId,
      addr,
      (txId) => { setPendingTxId(txId); toast.success("Submitted — waiting for confirmation…"); },
      () => { toast.error("Cancelled"); setPendingAction(null); }
    );
  };

  const txPending = pendingAction !== null;

  return (
    <div className="rounded-xl border border-white/8 bg-white/3 transition-all">
      {/* Row */}
      <button
        className="flex w-full items-center gap-3 p-3 text-left sm:p-4"
        onClick={onToggle}
      >
        <span className="shrink-0 text-xl sm:text-2xl">{icon}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-white">{label}</p>
          <p className="text-xs text-slate-500">Block #{record.timestamp}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="hidden rounded-full bg-indigo-500/15 px-2 py-0.5 text-xs font-semibold text-indigo-400 sm:inline">
            #{record.recordId}
          </span>
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-slate-500" />
          ) : (
            <ChevronDown className="h-4 w-4 text-slate-500" />
          )}
        </div>
      </button>

      {/* Expanded */}
      {expanded && (
        <div className="border-t border-white/8 p-4 space-y-5">
          {/* Secure file link */}
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Secure File
            </p>
            <a
              href={`https://gateway.pinata.cloud/ipfs/${record.ipfsHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-500/20 bg-indigo-500/8 px-3 py-1.5 text-xs font-medium text-indigo-400 transition hover:bg-indigo-500/15"
            >
              <Link2 className="h-3.5 w-3.5" />
              View encrypted file
              <ExternalLink className="h-3 w-3 opacity-60" />
            </a>
            <p className="mt-1.5 text-xs text-slate-600">
              File is AES-256 encrypted — unreadable without your key.
            </p>
          </div>

          {/* Owner */}
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Your Wallet
            </p>
            <a
              href={explorerAddressUrl(record.owner)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 font-mono text-xs text-slate-400 transition hover:text-indigo-400"
            >
              {record.owner.slice(0, 10)}…{record.owner.slice(-6)}
              <ExternalLink className="h-3 w-3 opacity-60" />
            </a>
          </div>

          {/* Access management */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Share with a Doctor
            </p>
            <input
              type="text"
              value={doctorInput}
              onChange={(e) => { setDoctorInput(e.target.value); setAccessStatus("idle"); }}
              placeholder="Doctor's wallet address (SP… or ST…)"
              disabled={txPending}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/10 disabled:opacity-40"
            />

            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <button
                onClick={handleGrant}
                disabled={txPending}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/25 px-3 py-2 text-xs font-semibold text-emerald-400 transition hover:bg-emerald-500/25 disabled:opacity-40 sm:flex-1"
              >
                {txPending && pendingAction === "grant" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Shield className="h-3.5 w-3.5" />
                )}
                Give Access
              </button>

              <button
                onClick={handleRevoke}
                disabled={txPending}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-red-500/20 bg-red-500/8 px-3 py-2 text-xs font-semibold text-red-400 transition hover:bg-red-500/15 disabled:opacity-40 sm:flex-1"
              >
                {txPending && pendingAction === "revoke" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ShieldOff className="h-3.5 w-3.5" />
                )}
                Remove Access
              </button>

              <button
                onClick={handleCheckAccess}
                disabled={txPending || accessStatus === "checking"}
                title="Check current access on-chain"
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-400 transition hover:border-indigo-500/30 hover:bg-indigo-500/8 hover:text-indigo-400 disabled:opacity-40 sm:w-auto"
              >
                {accessStatus === "checking" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ShieldCheck className="h-3.5 w-3.5" />
                )}
                Verify
              </button>
            </div>

            {/* Access badge */}
            {accessStatus !== "idle" && accessStatus !== "checking" && (
              <div
                className={`mt-2 flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium ${
                  accessStatus === "authorized"
                    ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                    : "border-red-500/20 bg-red-500/8 text-red-400"
                }`}
              >
                {accessStatus === "authorized" ? (
                  <>
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Doctor has access to this record
                  </>
                ) : (
                  <>
                    <ShieldOff className="h-3.5 w-3.5" />
                    No access granted yet
                  </>
                )}
              </div>
            )}

            {pendingTxId && (
              <div className="mt-3">
                <TxBanner txId={pendingTxId} status={accessTxStatus} />
              </div>
            )}

            <p className="mt-2 text-xs text-slate-600">
              Access is enforced by a smart contract — you stay in control.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
