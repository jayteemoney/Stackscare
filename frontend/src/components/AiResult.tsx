"use client";

import { AlertTriangle } from "lucide-react";

interface Props {
  text: string;
  disclaimer?: boolean;
}

function InlineLine({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("**") && p.endsWith("**") ? (
          <strong key={i} className="font-semibold text-white">
            {p.slice(2, -2)}
          </strong>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </>
  );
}

export function AiResult({ text, disclaimer = true }: Props) {
  const lines = text.split("\n");

  return (
    <div className="space-y-1 text-sm leading-relaxed text-slate-300">
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={i} className="h-2" />;

        if (/^\*\*[^*]+\*\*[:.]?$/.test(trimmed)) {
          return (
            <h4 key={i} className="mt-4 font-bold text-white first:mt-0">
              {trimmed.replace(/\*\*/g, "").replace(/:$/, "")}
            </h4>
          );
        }

        if (/^[-•]\s/.test(trimmed)) {
          return (
            <div key={i} className="flex items-start gap-2 pl-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-400" />
              <span>
                <InlineLine text={trimmed.replace(/^[-•]\s/, "")} />
              </span>
            </div>
          );
        }

        if (/^\d+\.\s/.test(trimmed)) {
          const num = trimmed.match(/^(\d+)\./)?.[1];
          return (
            <div key={i} className="flex items-start gap-2 pl-2">
              <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-indigo-500/20 text-[10px] font-bold text-indigo-400">
                {num}
              </span>
              <span>
                <InlineLine text={trimmed.replace(/^\d+\.\s/, "")} />
              </span>
            </div>
          );
        }

        return (
          <p key={i}>
            <InlineLine text={trimmed} />
          </p>
        );
      })}

      {disclaimer && (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          This AI summary is for information only — not a substitute for professional
          medical advice. Always consult a qualified healthcare provider.
        </div>
      )}
    </div>
  );
}
