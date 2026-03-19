'use client';

import { useState, useEffect } from 'react';
import {
  listMolbots,
  orchestrateAnalysis,
  type MolbotAgent,
  type OrchestrationResult,
} from '@/lib/api';
import {
  ShieldCheck,
  Sparkles,
  Activity,
  ArrowRight,
  Coins,
  FileSearch,
  CheckCircle2,
  Clock,
  ExternalLink,
  ChevronRight,
  RefreshCw,
} from 'lucide-react';

/* ── Types ── */

const SERVICE_LABELS: Record<string, string> = {
  'medical-ai': 'Symptom Analyzer',
  'medical-ai-document': 'Document Analyzer',
  'report-formatter': 'Report Writer',
};

const SERVICE_COLORS: Record<string, { bg: string; text: string; glow: string }> = {
  'medical-ai': { bg: 'from-cyan-500 to-teal-500', text: 'text-cyan-300', glow: 'rgba(6,182,212,0.3)' },
  'medical-ai-document': { bg: 'from-emerald-500 to-teal-500', text: 'text-emerald-300', glow: 'rgba(16,185,129,0.3)' },
  'report-formatter': { bg: 'from-violet-500 to-purple-500', text: 'text-violet-300', glow: 'rgba(139,92,246,0.3)' },
};

/* ── Main Component ── */

export default function MolbotNetwork() {
  const [agents, setAgents] = useState<MolbotAgent[]>([]);
  const [network, setNetwork] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [symptoms, setSymptoms] = useState('');
  const [orchestrating, setOrchestrating] = useState(false);
  const [result, setResult] = useState<OrchestrationResult | null>(null);
  const [orchError, setOrchError] = useState<string | null>(null);

  useEffect(() => { fetchAgents(); }, []);

  async function fetchAgents() {
    try {
      setLoading(true);
      const data = await listMolbots();
      setAgents(data.agents);
      setNetwork(data.network);
    } catch (e: any) {
      setError(e.message || 'Could not load AI agents');
    } finally {
      setLoading(false);
    }
  }

  async function handleOrchestrate() {
    if (!symptoms.trim() || symptoms.trim().length < 5) return;
    try {
      setOrchestrating(true);
      setResult(null);
      setOrchError(null);
      const res = await orchestrateAnalysis(symptoms);
      setResult(res);
    } catch (e: any) {
      setOrchError(e.message || 'Analysis failed — please try again');
    } finally {
      setOrchestrating(false);
    }
  }

  return (
    <div className="space-y-6 animate-fade-up">
      {/* Section header */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-indigo-400">
            AI Health Agents
          </span>
          <h2 className="text-2xl font-extrabold tracking-tight text-white">
            Multi-Agent Analysis Network
          </h2>
          <p className="mt-1 max-w-xl text-sm text-slate-400">
            Specialist AI agents work together to analyze your symptoms and produce a
            structured health report — on{' '}
            <span className="font-semibold text-indigo-400">{network || 'Stacks Testnet'}</span>.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-2 rounded-full border border-white/8 bg-white/4 px-3 py-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)] animate-pulse" />
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Agents Online</span>
          </div>
          <button
            onClick={fetchAgents}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-400 transition hover:border-indigo-500/30 hover:text-indigo-400"
            title="Refresh"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left: Input + Results */}
        <div className="lg:col-span-8 space-y-5">
          {/* Input panel */}
          <div className="glass-card relative overflow-hidden rounded-2xl p-4 sm:p-6">
            <div className="pointer-events-none absolute -top-16 -right-16 h-48 w-48 rounded-full opacity-10"
              style={{ background: 'radial-gradient(circle, rgba(99,102,241,1) 0%, transparent 70%)', filter: 'blur(30px)' }}
            />
            <div className="relative">
              <div className="mb-5 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-linear-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-500/20">
                  <Sparkles className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-white">Describe Your Symptoms</h3>
                  <p className="text-xs text-slate-400">Our AI agents will analyze and explain them for you</p>
                </div>
              </div>

              <textarea
                value={symptoms}
                onChange={(e) => setSymptoms(e.target.value)}
                placeholder="e.g. I've had a headache for 2 days, feel tired, and have a slight fever…"
                className="w-full min-h-30 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200 placeholder:text-slate-600 outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/10 leading-relaxed resize-none"
              />

              <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                  <span className="flex items-center gap-1.5">
                    <ShieldCheck size={13} className="text-indigo-400" />
                    Privacy-first AI
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Coins size={13} className="text-amber-400" />
                    ~0.015 STX micro-payment
                  </span>
                </div>
                <button
                  onClick={handleOrchestrate}
                  disabled={orchestrating || symptoms.trim().length < 5}
                  className="flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-linear-to-r from-indigo-600 to-violet-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition hover:opacity-90 hover:-translate-y-0.5 active:translate-y-0 disabled:translate-y-0 disabled:opacity-40 disabled:shadow-none"
                >
                  {orchestrating ? (
                    <>
                      <div className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                      Analyzing…
                    </>
                  ) : (
                    <>
                      Analyze My Symptoms
                      <ArrowRight size={16} />
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Error */}
          {orchError && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/8 px-4 py-3 text-sm text-red-400">
              {orchError}
            </div>
          )}

          {/* Results */}
          {result && (
            <div className="space-y-5 animate-fade-up">
              {/* Payment summary */}
              <div className="glass-card rounded-2xl p-4 sm:p-5">
                <div className="mb-4 flex items-center justify-between">
                  <h4 className="font-bold text-white flex items-center gap-2">
                    <Coins size={16} className="text-amber-400" />
                    How Your Analysis Was Processed
                  </h4>
                  <span className="rounded-full border border-indigo-500/20 bg-indigo-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-indigo-400">
                    AI Work Summary
                  </span>
                </div>

                <div className="space-y-3 relative">
                  <div className="absolute left-4.5 top-5 bottom-5 w-px bg-linear-to-b from-indigo-500/30 to-transparent" />
                  {result.paymentTrail.map((step, idx) => (
                    <div key={idx} className="flex gap-4 items-start relative z-10">
                      <div
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                          step.status === 'paid' || step.status === 'free'
                            ? 'bg-emerald-500/15 text-emerald-400'
                            : 'bg-white/8 text-slate-500'
                        }`}
                      >
                        {step.status === 'paid' || step.status === 'free' ? (
                          <CheckCircle2 size={18} />
                        ) : (
                          <Clock size={18} />
                        )}
                      </div>
                      <div className="flex-1 pt-1">
                        <div className="flex items-center justify-between">
                          <span className="truncate font-semibold text-white text-sm max-w-[120px] sm:max-w-none">{step.molbotName}</span>
                          <span
                            className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                              step.status === 'paid'
                                ? 'bg-emerald-500/15 text-emerald-400'
                                : step.status === 'free'
                                ? 'bg-indigo-500/15 text-indigo-400'
                                : 'bg-white/8 text-slate-500'
                            }`}
                          >
                            {step.status === 'free' ? 'Completed' : step.status}
                          </span>
                        </div>
                        <div className="mt-0.5 flex items-center gap-3 text-xs text-slate-500">
                          <span className="flex items-center gap-1">
                            <Coins size={10} className="text-amber-400" />
                            {(step.amountUstx / 1_000_000).toFixed(4)} STX
                          </span>
                          {step.durationMs && (
                            <span className="flex items-center gap-1">
                              <Clock size={10} />
                              {step.durationMs}ms
                            </span>
                          )}
                          {step.txId && (
                            <a
                              href={`https://explorer.hiro.so/txid/${step.txId}?chain=testnet`}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center gap-0.5 text-indigo-400 hover:underline"
                            >
                              Transaction <ExternalLink size={9} />
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-white/8 pt-4">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Total cost
                  </span>
                  <div className="flex items-baseline gap-1">
                    <span className="text-xl font-black text-white">
                      {(result.totalCostUstx / 1_000_000).toFixed(4)}
                    </span>
                    <span className="text-sm font-bold text-indigo-400">STX</span>
                  </div>
                </div>
              </div>

              {/* Health report */}
              {result.formattedReport && (
                <div className="glass-card rounded-2xl overflow-hidden">
                  <div className="border-b border-white/8 bg-white/3 px-4 py-3 flex items-center gap-3 sm:px-6 sm:py-4">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-linear-to-br from-teal-500 to-cyan-500 shadow-lg shadow-teal-500/20">
                      <FileSearch size={18} className="text-white" />
                    </div>
                    <div>
                      <h4 className="font-bold text-white">Your Health Report</h4>
                      <p className="text-xs text-slate-500">Generated by AI — not a medical diagnosis</p>
                    </div>
                  </div>

                  <div className="p-4 space-y-5 sm:p-6 sm:space-y-6">
                    {result.formattedReport.sections ? (
                      result.formattedReport.sections.map((section: any, idx: number) => (
                        <div key={idx} className="relative pl-7">
                          <div className="absolute left-0 top-0.5 text-lg">{section.icon}</div>
                          <h5 className="font-bold text-white mb-2">{section.title}</h5>
                          {Array.isArray(section.content) ? (
                            <ul className="space-y-1.5">
                              {section.content.map((item: string, i: number) => (
                                <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                                  <ChevronRight size={13} className="mt-0.5 shrink-0 text-indigo-400" />
                                  {item}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-sm text-slate-300 leading-relaxed">{section.content}</p>
                          )}
                        </div>
                      ))
                    ) : (
                      <pre className="rounded-xl bg-black/40 p-4 text-xs font-mono text-emerald-400 overflow-auto">
                        {JSON.stringify(result.formattedReport, null, 2)}
                      </pre>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: Agent cards */}
        <div className="lg:col-span-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500">
              Available AI Agents
            </h3>
            <span className="rounded-full bg-indigo-500/15 px-2 py-0.5 text-[10px] font-bold text-indigo-400">
              {agents.length} online
            </span>
          </div>

          {loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-28 rounded-2xl bg-white/5 animate-pulse" />
            ))
          ) : error ? (
            <div className="rounded-xl border border-red-500/20 bg-red-500/8 p-4 text-sm text-red-400">
              {error}
            </div>
          ) : (
            agents.map((agent) => (
              <AgentCard key={agent.agentId} agent={agent} />
            ))
          )}

          {/* Trust card */}
          <div className="relative overflow-hidden rounded-2xl bg-linear-to-br from-indigo-950 to-violet-950 border border-indigo-500/20 p-5">
            <div className="pointer-events-none absolute -right-6 -top-6 opacity-10">
              <ShieldCheck size={80} className="text-indigo-400" />
            </div>
            <div className="relative">
              <div className="mb-2 flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                <span className="text-xs font-bold uppercase tracking-widest text-slate-400">
                  Privacy Guarantee
                </span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Your data is analyzed and never stored. All agent payments are
                verified on-chain before any work is performed.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Agent Card ── */

function AgentCard({ agent }: { agent: MolbotAgent }) {
  const priceSTX = (agent.priceUstx / 1_000_000).toFixed(4);
  const label = SERVICE_LABELS[agent.serviceType] ?? agent.serviceType;
  const colors = SERVICE_COLORS[agent.serviceType] ?? {
    bg: 'from-indigo-500 to-violet-500',
    text: 'text-indigo-300',
    glow: 'rgba(99,102,241,0.3)',
  };

  return (
    <div
      className="glass-card rounded-2xl p-4 cursor-default"
      style={{ boxShadow: `0 0 20px ${colors.glow}` }}
    >
      <div className="flex items-center gap-3 mb-3">
        <div
          className={`flex h-9 w-9 items-center justify-center rounded-xl bg-linear-to-br ${colors.bg} shadow-lg`}
        >
          <Activity size={16} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-white text-sm truncate">{agent.name}</p>
          <p className={`text-[10px] font-semibold uppercase tracking-wide ${colors.text}`}>
            {label}
          </p>
        </div>
        <div className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)] animate-pulse shrink-0" />
      </div>

      <div className="flex items-center justify-between border-t border-white/8 pt-3">
        <span className="text-xs text-slate-500">Per request</span>
        <div className="flex items-baseline gap-1">
          <span className="font-black text-white">{priceSTX}</span>
          <span className="text-xs font-bold text-indigo-400">{agent.tokenType}</span>
        </div>
      </div>
    </div>
  );
}
