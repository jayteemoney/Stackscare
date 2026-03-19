"use client";

/**
 * DashboardWrapper — client-only entry point for the full dashboard.
 *
 * next/dynamic with ssr:false must live inside a "use client" component.
 * This thin wrapper ensures @stacks/connect (and all its browser-only
 * dependencies) are never imported during Next.js SSR.
 */
import dynamic from "next/dynamic";
import { Shield } from "lucide-react";

const DashboardClient = dynamic(() => import("./dashboard-client"), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="flex flex-col items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 shadow-xl shadow-indigo-500/30">
          <Shield className="h-8 w-8 text-white" />
        </div>
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
        <p className="text-sm text-slate-400">Loading StacksCare…</p>
      </div>
    </div>
  ),
});

export function DashboardWrapper() {
  return <DashboardClient />;
}
