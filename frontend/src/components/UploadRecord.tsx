"use client";

import { useState, useRef, useCallback } from "react";
import {
  Upload,
  FileText,
  Loader2,
  CheckCircle2,
  Sparkles,
  X,
  Zap,
} from "lucide-react";
import { uploadRecord, analyzeDocument } from "@/lib/api";
import { useTxStatus } from "@/hooks/useTxStatus";
import { TxBanner } from "@/components/TxBanner";
import { AiResult } from "@/components/AiResult";
import { RECORD_TYPE_LABELS, RECORD_TYPE_ICONS, type RecordType } from "@/types";
import toast from "react-hot-toast";

const RECORD_TYPES = Object.entries(RECORD_TYPE_LABELS) as [RecordType, string][];

type Step = "idle" | "uploading" | "confirming" | "submitted" | "done";

interface Props {
  address: string;
  createRecord: (
    ipfsHash: string,
    recordType: RecordType,
    onFinish: (txId: string) => void,
    onCancel: () => void
  ) => void;
  onSuccess?: () => void;
}

export function UploadRecord({ address: _address, createRecord, onSuccess }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [recordType, setRecordType] = useState<RecordType>("consultation");
  const [step, setStep] = useState<Step>("idle");
  const [txId, setTxId] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleConfirmed = useCallback(() => {
    setStep("done");
    toast.success("Record saved to Stacks blockchain!");
    onSuccess?.();
  }, [onSuccess]);

  const handleFailed = useCallback(() => {
    setStep("idle");
    toast.error("Transaction failed — please try again.");
  }, []);

  const txStatus = useTxStatus(txId, handleConfirmed, handleFailed);

  const handleUpload = async () => {
    if (!file) { toast.error("Please select a file first"); return; }

    try {
      setStep("uploading");
      const { ipfs_hash: ipfsHash } = await uploadRecord(file, recordType);

      setAnalyzing(true);
      analyzeDocument(file)
        .then((r) => setAnalysis(r.analysis))
        .catch(() => { /* non-fatal */ })
        .finally(() => setAnalyzing(false));

      setStep("confirming");
      createRecord(
        ipfsHash,
        recordType,
        (id) => { setTxId(id); setStep("submitted"); },
        () => { setStep("idle"); toast.error("Transaction cancelled"); }
      );
    } catch (err) {
      setStep("idle");
      toast.error(err instanceof Error ? err.message : "Upload failed");
    }
  };

  const reset = () => {
    setFile(null);
    setAnalysis(null);
    setAnalyzing(false);
    setStep("idle");
    setTxId(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const isDisabled =
    !file || step === "uploading" || step === "confirming" || step === "submitted";

  return (
    <div className="glass-card rounded-2xl p-4 sm:p-6">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-linear-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-500/20">
          <FileText className="h-5 w-5 text-white" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-white">Upload Health Record</h2>
          <p className="text-sm text-slate-400">Encrypted, private, and owned by you</p>
        </div>
      </div>

      {/* Done state */}
      {step === "done" ? (
        <div className="flex flex-col items-center gap-4 py-10 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
            <CheckCircle2 className="h-8 w-8 text-emerald-400" />
          </div>
          <p className="text-lg font-bold text-white">Record saved!</p>
          <p className="max-w-xs text-sm text-slate-400">
            Your file is encrypted and permanently stored. You own it.
          </p>
          <button
            onClick={reset}
            className="rounded-xl bg-linear-to-r from-indigo-600 to-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition hover:opacity-90"
          >
            Upload Another
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Record Type */}
          <div>
            <label className="mb-2.5 block text-sm font-semibold text-slate-300">
              What type of record is this?
            </label>
            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5 sm:gap-2">
              {RECORD_TYPES.map(([type, label]) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setRecordType(type)}
                  disabled={step !== "idle"}
                  className={`flex flex-col items-center gap-1 rounded-xl border p-2 text-[10px] font-medium transition disabled:pointer-events-none disabled:opacity-40 sm:gap-1.5 sm:p-3 sm:text-xs ${
                    recordType === type
                      ? "border-indigo-500/60 bg-indigo-500/15 text-indigo-300"
                      : "border-white/8 bg-white/4 text-slate-400 hover:border-indigo-500/30 hover:bg-indigo-500/8 hover:text-slate-200"
                  }`}
                >
                  <span className="text-2xl">{RECORD_TYPE_ICONS[type]}</span>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* File Drop Zone */}
          <div>
            <label className="mb-2.5 block text-sm font-semibold text-slate-300">
              Choose your file
            </label>
            <div
              className={`relative cursor-pointer rounded-xl border-2 border-dashed p-6 transition ${
                file
                  ? "border-emerald-500/50 bg-emerald-500/8"
                  : "border-white/15 bg-white/3 hover:border-indigo-500/40 hover:bg-indigo-500/5"
              } ${step !== "idle" ? "pointer-events-none opacity-50" : ""}`}
              onClick={() => inputRef.current?.click()}
            >
              <input
                ref={inputRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.txt,.doc,.docx"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
              <div className="flex flex-col items-center gap-2 text-center">
                {file ? (
                  <>
                    <CheckCircle2 className="h-9 w-9 text-emerald-400" />
                    <p className="font-semibold text-emerald-300">{file.name}</p>
                    <p className="text-sm text-emerald-400/70">
                      {(file.size / 1024).toFixed(1)} KB
                    </p>
                  </>
                ) : (
                  <>
                    <Upload className="h-9 w-9 text-slate-500" />
                    <p className="font-medium text-slate-300">Click to upload or drag &amp; drop</p>
                    <p className="text-xs text-slate-500">PDF, JPEG, PNG, TXT, DOC · Max 10 MB</p>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Step messages */}
          {step === "uploading" && (
            <StatusPill color="indigo">
              <Loader2 className="h-4 w-4 animate-spin shrink-0" />
              Encrypting and saving your file…
            </StatusPill>
          )}
          {step === "confirming" && (
            <StatusPill color="amber">
              <Loader2 className="h-4 w-4 animate-spin shrink-0" />
              Approve the transaction in your wallet…
            </StatusPill>
          )}

          {txId && step === "submitted" && (
            <TxBanner txId={txId} status={txStatus} />
          )}

          {/* Upload button */}
          <button
            onClick={handleUpload}
            disabled={isDisabled}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-linear-to-r from-indigo-600 to-violet-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {step === "uploading" ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Uploading…</>
            ) : step === "confirming" ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Waiting for wallet…</>
            ) : step === "submitted" ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Confirming on blockchain…</>
            ) : (
              <><Sparkles className="h-4 w-4" /> Save &amp; Analyze</>
            )}
          </button>
        </div>
      )}

      {/* AI Analysis Panel */}
      {(analyzing || analysis) && (
        <div className="mt-5 rounded-xl border border-indigo-500/20 bg-indigo-500/8 p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-indigo-300">
              <Sparkles className="h-4 w-4" />
              AI Health Summary
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-400">
                <Zap className="h-2.5 w-2.5" />
                Powered by AI
              </span>
            </div>
            {analysis && !analyzing && (
              <button
                onClick={() => setAnalysis(null)}
                className="text-slate-500 transition hover:text-slate-300"
                title="Dismiss"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          {analyzing ? (
            <div className="flex items-center gap-2 text-sm text-indigo-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              Reading your document…
            </div>
          ) : analysis ? (
            <AiResult text={analysis} />
          ) : null}
        </div>
      )}
    </div>
  );
}

/* ── Small helper ── */

function StatusPill({
  color,
  children,
}: {
  color: "indigo" | "amber";
  children: React.ReactNode;
}) {
  const styles = {
    indigo: "border-indigo-500/20 bg-indigo-500/10 text-indigo-300",
    amber: "border-amber-500/20 bg-amber-500/10 text-amber-300",
  };
  return (
    <div
      className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-sm ${styles[color]}`}
    >
      {children}
    </div>
  );
}
