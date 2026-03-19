"use client";

/**
 * useBackendHealth — polls the backend /api/health endpoint every 30 s.
 * Returns null while the first check is in flight, then true/false.
 */

import { useState, useEffect } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export function useBackendHealth(): boolean | null {
  const [healthy, setHealthy] = useState<boolean | null>(null);

  useEffect(() => {
    const check = async () => {
      try {
        const resp = await fetch(`${API_BASE}/api/health`, {
          signal: AbortSignal.timeout(4000),
        });
        setHealthy(resp.ok);
      } catch {
        setHealthy(false);
      }
    };

    check();
    const timer = setInterval(check, 30_000);
    return () => clearInterval(timer);
  }, []);

  return healthy;
}
