"use client";

/**
 * DynamicWalletConnect — client-only wrapper around WalletConnect.
 *
 * next/dynamic with ssr:false must live inside a "use client" component.
 * This wrapper is imported by server pages so @stacks/connect is never
 * loaded during SSR.
 */
import dynamic from "next/dynamic";

const WalletConnect = dynamic(
  () =>
    import("@/components/WalletConnect").then((m) => ({
      default: m.WalletConnect,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="h-10 w-36 animate-pulse rounded-xl bg-white/10" />
    ),
  }
);

export function DynamicWalletConnect() {
  return <WalletConnect />;
}
