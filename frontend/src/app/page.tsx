/**
 * Landing page — server component.
 *
 * WalletConnect is loaded via DynamicWalletConnect (a "use client" wrapper)
 * so @stacks/connect browser-only modules are never imported during SSR.
 */
import Link from "next/link";
import {
  Shield,
  Sparkles,
  Lock,
  ArrowRight,
  Zap,
  FileText,
  UserCheck,
  Globe,
  Cpu,
  Key,
} from "lucide-react";
import { DynamicWalletConnect as WalletConnect } from "@/components/DynamicWalletConnect";

/* ── Data ──────────────────────────────────────────── */

const STATS = [
  { value: "AES-256", label: "Encryption Standard" },
  { value: "On-Chain", label: "Access Control" },
  { value: "Zero", label: "Data Retained" },
  { value: "Bitcoin", label: "Settlement Layer" },
];

const FEATURES = [
  {
    icon: Shield,
    accent: "from-indigo-500 to-violet-500",
    glow: "rgba(99,102,241,0.25)",
    title: "Programmable Ownership",
    body: "Clarity smart contracts on Stacks enforce who can read or write each health record. No centralised server — just immutable code and your wallet.",
    tag: "Smart Contracts",
  },
  {
    icon: Sparkles,
    accent: "from-teal-400 to-cyan-500",
    glow: "rgba(20,184,166,0.25)",
    title: "AI-Powered Insights",
    body: "Upload a medical report and our AI analyzes it instantly — plain-language summary, risk level, and personalised recommendations. Data analyzed, never stored.",
    tag: "AI Analysis",
  },
  {
    icon: Lock,
    accent: "from-violet-500 to-fuchsia-500",
    glow: "rgba(167,139,250,0.25)",
    title: "Privacy-First Storage",
    body: "Files are encrypted with AES-256 before being pinned to IPFS. Only the content hash lives on-chain. The decryption key never leaves your control.",
    tag: "IPFS + Encryption",
  },
];

const STEPS = [
  {
    n: "01",
    icon: Key,
    title: "Connect Your Wallet",
    body: "Use Hiro Wallet to authenticate. Your Stacks address is your identity — no email or password.",
  },
  {
    n: "02",
    icon: FileText,
    title: "Upload a Record",
    body: "Select a medical document. It's encrypted client-side and pinned to IPFS before any on-chain action.",
  },
  {
    n: "03",
    icon: Cpu,
    title: "Get AI Analysis",
    body: "Receive an instant AI-generated plain-language summary, risk assessment, and recommendations.",
  },
  {
    n: "04",
    icon: UserCheck,
    title: "Manage Access",
    body: "Grant or revoke doctor access directly on-chain. The smart contract enforces your decision instantly.",
  },
];

const TRUST_BADGES = [
  "Built on Stacks",
  "Secured by Bitcoin",
  "AI by Mistral",
  "Pinned to IPFS",
  "Open Source",
];

/* ── Component ──────────────────────────────────────── */

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#030711] text-white overflow-x-hidden">

      {/* ── Navbar ─────────────────────────────────── */}
      <nav className="fixed top-0 inset-x-0 z-50 glass border-b border-white/5">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-500/30">
              <Shield className="h-4 w-4 text-white" aria-hidden="true" />
            </div>
            <span className="text-base font-bold tracking-tight">StacksCare</span>
          </div>

          <div className="hidden items-center gap-8 text-sm font-medium text-slate-400 sm:flex">
            <a href="#features" className="transition hover:text-white">Features</a>
            <a href="#how-it-works" className="transition hover:text-white">How It Works</a>
            <a href="#security" className="transition hover:text-white">Security</a>
          </div>

          <WalletConnect />
        </div>
      </nav>

      {/* ── Hero ───────────────────────────────────── */}
      <section className="relative min-h-screen hero-gradient grid-mesh flex flex-col items-center justify-center px-6 pt-20">

        {/* Animated orbs */}
        <div
          className="animate-float animate-glow-pulse pointer-events-none absolute left-[10%] top-[18%] h-72 w-72 rounded-full"
          style={{ background: "radial-gradient(circle, rgba(99,102,241,0.4) 0%, transparent 70%)", filter: "blur(40px)" }}
        />
        <div
          className="animate-float-delayed animate-glow-pulse pointer-events-none absolute right-[12%] top-[30%] h-56 w-56 rounded-full"
          style={{ background: "radial-gradient(circle, rgba(20,184,166,0.35) 0%, transparent 70%)", filter: "blur(35px)" }}
        />
        <div
          className="animate-float pointer-events-none absolute bottom-[20%] left-[35%] h-40 w-40 rounded-full"
          style={{ background: "radial-gradient(circle, rgba(167,139,250,0.3) 0%, transparent 70%)", filter: "blur(30px)" }}
        />

        {/* Headline */}
        <h1 className="animate-fade-up relative z-10 max-w-4xl text-center text-5xl font-extrabold leading-[1.1] tracking-tight sm:text-6xl lg:text-7xl">
          Own Your{" "}
          <span className="gradient-text">Health Data.</span>
          <br />
          Forever.
        </h1>

        <p className="animate-fade-up-2 relative z-10 mx-auto mt-6 max-w-2xl text-center text-lg leading-relaxed text-slate-400">
          StacksCare puts you in control of your medical records with Clarity smart
          contracts on Stacks. AI-powered analysis. Granular permission sharing.
          Full patient sovereignty — no middlemen.
        </p>

        {/* CTAs */}
        <div className="animate-fade-up-3 relative z-10 mt-10 flex flex-col items-center gap-3 sm:flex-row">
          <Link
            href="/dashboard"
            className="group flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-7 py-3.5 text-base font-semibold text-white shadow-lg shadow-indigo-500/25 transition hover:shadow-indigo-500/40 hover:scale-[1.02] active:scale-[0.98]"
          >
            Launch App
            <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
          </Link>
          <a
            href="https://docs.stacks.co/clarity/overview"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-7 py-3.5 text-base font-medium text-slate-300 transition hover:border-white/20 hover:bg-white/10"
          >
            Read the Docs
            <Globe className="h-4 w-4 opacity-60" />
          </a>
        </div>

        {/* Trust badges */}
        <div className="relative z-10 mt-14 flex flex-wrap items-center justify-center gap-3">
          {TRUST_BADGES.map((b) => (
            <span
              key={b}
              className="rounded-full border border-white/8 bg-white/5 px-3.5 py-1 text-xs font-medium text-slate-400"
            >
              {b}
            </span>
          ))}
        </div>

        {/* Scroll cue */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 opacity-40">
          <span className="text-xs text-slate-500">Scroll to explore</span>
          <div className="h-6 w-px bg-gradient-to-b from-slate-500 to-transparent" />
        </div>
      </section>

      {/* ── Stats Bar ──────────────────────────────── */}
      <section className="border-y border-white/5 bg-white/[0.02]">
        <div className="mx-auto grid max-w-5xl grid-cols-2 divide-x divide-y divide-white/5 sm:grid-cols-4 sm:divide-y-0">
          {STATS.map((s) => (
            <div key={s.label} className="flex flex-col items-center gap-1 px-6 py-8">
              <span className="shimmer-text text-2xl font-extrabold sm:text-3xl">{s.value}</span>
              <span className="text-xs font-medium uppercase tracking-widest text-slate-500">{s.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ───────────────────────────────── */}
      <section id="features" className="mx-auto max-w-7xl px-6 py-28">
        <div className="mb-4 text-center">
          <span className="rounded-full border border-teal-500/30 bg-teal-500/10 px-3.5 py-1 text-xs font-semibold uppercase tracking-widest text-teal-400">
            Core Features
          </span>
        </div>
        <h2 className="mb-4 text-center text-3xl font-extrabold tracking-tight sm:text-4xl">
          Built different. Built for you.
        </h2>
        <p className="mx-auto mb-14 max-w-xl text-center text-slate-400">
          Every layer — storage, ownership, analysis — is designed to keep you in
          control and your data private.
        </p>

        <div className="grid gap-6 md:grid-cols-3">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="glass-card group relative overflow-hidden rounded-2xl p-8"
              style={{ boxShadow: `0 0 40px ${f.glow}` }}
            >
              {/* Top accent line */}
              <div className={`absolute inset-x-0 top-0 h-px bg-gradient-to-r ${f.accent} opacity-60`} />

              <div className={`mb-5 inline-flex rounded-xl bg-gradient-to-br ${f.accent} p-3 shadow-lg`}>
                <f.icon className="h-6 w-6 text-white" aria-hidden="true" />
              </div>

              <span className="mb-3 block text-xs font-semibold uppercase tracking-widest text-slate-500">
                {f.tag}
              </span>
              <h3 className="mb-3 text-xl font-bold text-white">{f.title}</h3>
              <p className="text-sm leading-relaxed text-slate-400">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ───────────────────────────── */}
      <section id="how-it-works" className="border-y border-white/5 bg-white/[0.015] py-28">
        <div className="mx-auto max-w-7xl px-6">
          <div className="mb-4 text-center">
            <span className="rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3.5 py-1 text-xs font-semibold uppercase tracking-widest text-indigo-400">
              How It Works
            </span>
          </div>
          <h2 className="mb-4 text-center text-3xl font-extrabold tracking-tight sm:text-4xl">
            From wallet to record in four steps.
          </h2>
          <p className="mx-auto mb-16 max-w-xl text-center text-slate-400">
            Designed for non-technical patients — every action is transparent and
            reversible on the Stacks blockchain.
          </p>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <div key={s.n} className="relative flex flex-col">
                {/* Connector line (between cards on large screens) */}
                {i < STEPS.length - 1 && (
                  <div className="absolute right-0 top-8 hidden h-px w-6 bg-gradient-to-r from-indigo-500/50 to-transparent lg:block translate-x-full" />
                )}

                <div className="glass-card flex flex-col gap-4 rounded-2xl p-6 h-full">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl font-black text-white/10 leading-none">{s.n}</span>
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600/20 border border-indigo-500/30">
                      <s.icon className="h-5 w-5 text-indigo-400" aria-hidden="true" />
                    </div>
                  </div>
                  <div>
                    <h3 className="mb-2 font-bold text-white">{s.title}</h3>
                    <p className="text-sm leading-relaxed text-slate-400">{s.body}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Security Section ───────────────────────── */}
      <section id="security" className="mx-auto max-w-7xl px-6 py-28">
        <div className="relative overflow-hidden rounded-3xl border border-white/8 bg-gradient-to-br from-indigo-950/80 to-violet-950/60 p-10 sm:p-16">
          {/* Background glow */}
          <div
            className="pointer-events-none absolute -right-20 -top-20 h-80 w-80 rounded-full opacity-30"
            style={{ background: "radial-gradient(circle, rgba(99,102,241,0.6) 0%, transparent 70%)", filter: "blur(60px)" }}
          />

          <div className="relative grid gap-10 lg:grid-cols-2 lg:items-center">
            <div>
              <span className="mb-4 block text-xs font-semibold uppercase tracking-widest text-indigo-400">
                Security Architecture
              </span>
              <h2 className="mb-5 text-3xl font-extrabold tracking-tight sm:text-4xl">
                Military-grade encryption meets blockchain permanence.
              </h2>
              <p className="mb-8 text-slate-400 leading-relaxed">
                Every file is encrypted with AES-256 before it ever leaves your browser.
                The ciphertext is pinned to IPFS — a decentralised, content-addressed
                network. Only the hash is stored on Stacks. The decryption key lives
                with you alone.
              </p>
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-indigo-500"
              >
                <Zap className="h-4 w-4" />
                Start Protecting Your Records
              </Link>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {[
                { label: "End-to-End Encryption", desc: "AES-256 before IPFS upload" },
                { label: "On-Chain Permissions", desc: "Clarity enforces access control" },
                { label: "Content Addressing", desc: "IPFS CIDs are tamper-proof" },
                { label: "Bitcoin Finality", desc: "Stacks settles on Bitcoin L1" },
              ].map((item) => (
                <div key={item.label} className="rounded-xl border border-white/8 bg-white/5 p-5">
                  <div className="mb-1.5 flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-500/20">
                    <Shield className="h-3.5 w-3.5 text-indigo-400" aria-hidden="true" />
                  </div>
                  <p className="text-sm font-semibold text-white">{item.label}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA Banner ─────────────────────────────── */}
      <section className="border-t border-white/5 bg-gradient-to-b from-indigo-950/30 to-[#030711] py-24">
        <div className="mx-auto max-w-2xl px-6 text-center">
          <h2 className="mb-4 text-4xl font-extrabold tracking-tight">
            Ready to own your{" "}
            <span className="gradient-text">health data?</span>
          </h2>
          <p className="mb-10 text-lg text-slate-400">
            Connect your Hiro Wallet in seconds. No sign-up. No email. Just sovereignty.
          </p>
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/dashboard"
              className="group flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-8 py-4 text-base font-semibold text-white shadow-lg shadow-indigo-500/25 transition hover:scale-[1.02]"
            >
              Open Dashboard
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
            </Link>
            <a
              href="https://wallet.hiro.so"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-xl border border-white/10 px-8 py-4 text-base font-medium text-slate-300 transition hover:bg-white/5"
            >
              Get Hiro Wallet →
            </a>
          </div>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────── */}
      <footer className="border-t border-white/5 bg-[#030711]">
        <div className="mx-auto max-w-7xl px-6 py-10">
          <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600">
                <Shield className="h-3.5 w-3.5 text-white" aria-hidden="true" />
              </div>
              <span className="font-bold text-sm text-slate-300">StacksCare</span>
            </div>

            <p className="text-xs text-slate-600 text-center">
              Clarity · Stacks · Mistral AI · IPFS · Next.js
            </p>

            <a
              href="https://docs.stacks.co"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-slate-500 transition hover:text-slate-300"
            >
              Stacks Docs
            </a>
          </div>
        </div>
      </footer>

    </div>
  );
}
