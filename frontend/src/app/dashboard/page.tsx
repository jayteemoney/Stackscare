/**
 * Dashboard route — server-component shell.
 *
 * The real dashboard content lives in dashboard-client.tsx and is loaded
 * via DashboardWrapper (a "use client" component with dynamic ssr:false)
 * so @stacks/connect browser-only modules never crash Next.js SSR.
 */
import { DashboardWrapper } from "./DashboardWrapper";

export default function DashboardPage() {
  return <DashboardWrapper />;
}
