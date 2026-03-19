"use client";

import { Loader2, CheckCircle2, XCircle, ExternalLink } from "lucide-react";
import { explorerTxUrl } from "@/lib/stacks";
import type { TxStatus } from "@/hooks/useTxStatus";

interface Props {
  txId: string;
  status: TxStatus;
}

const CONFIG: Record<
  Exclude<TxStatus, "idle">,
  { icon: React.ElementType; bg: string; border: string; text: string; label: string }
> = {
  pending: {
    icon: Loader2,
    bg: "bg-indigo-500/10",
    border: "border-indigo-500/20",
    text: "text-indigo-300",
    label: "Saving to blockchain…",
  },
  success: {
    icon: CheckCircle2,
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/20",
    text: "text-emerald-300",
    label: "Saved! Your record is on the blockchain.",
  },
  abort_by_response: {
    icon: XCircle,
    bg: "bg-red-500/10",
    border: "border-red-500/20",
    text: "text-red-400",
    label: "Something went wrong. Please try again.",
  },
  abort_by_post_condition: {
    icon: XCircle,
    bg: "bg-red-500/10",
    border: "border-red-500/20",
    text: "text-red-400",
    label: "Action was blocked by a security check.",
  },
  not_found: {
    icon: Loader2,
    bg: "bg-white/5",
    border: "border-white/10",
    text: "text-slate-400",
    label: "Submitted! Waiting for the network…",
  },
};

export function TxBanner({ txId, status }: Props) {
  if (status === "idle") return null;
  const cfg = CONFIG[status];
  const Icon = cfg.icon;
  const isSpinning = status === "pending" || status === "not_found";

  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${cfg.bg} ${cfg.border} ${cfg.text}`}
    >
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 shrink-0 ${isSpinning ? "animate-spin" : ""}`} />
        <span className="font-medium">{cfg.label}</span>
      </div>
      <a
        href={explorerTxUrl(txId)}
        target="_blank"
        rel="noopener noreferrer"
        className="flex shrink-0 items-center gap-1 text-xs font-semibold opacity-70 underline-offset-2 hover:opacity-100 hover:underline"
      >
        View
        <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  );
}
