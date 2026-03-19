/**
 * Custom Clarinet vitest environment for Vitest 4 + vmThreads.
 *
 * Root causes addressed:
 *  1. EventTarget/Event/CustomEvent are not in Node.js VM contexts — chai needs them
 *     before any module is evaluated (before setup() would be called).
 *  2. Timer globals (setTimeout, clearTimeout, etc.) are not in empty VM contexts —
 *     Vitest's setSafeTimers() reads them from the VM globalThis at startup.
 *  3. AbortController and other Node 18+ globals are absent in empty VM contexts.
 *  4. In the vmThreads pool, Vitest only calls setupVM(), never environment.setup().
 *     This means simnet, options, coverageReports, etc. are never injected.
 *     We must call clarinetEnv.setup() ourselves inside setupVM() so that simnet
 *     is available at module-evaluation time (top-level `const accounts = simnet...`).
 */
import clarinetEnv from "vitest-environment-clarinet";
import { createContext } from "node:vm";
import fs from "node:fs";
import { initSimnet } from "@stacks/clarinet-sdk";

export default {
  ...clarinetEnv,
  name: "clarinet-patched",

  async setupVM(options) {
    // Build the VM context with all globals that Node.js VM contexts lack.
    const context = createContext({
      // Browser-compat globals required by chai (vitest's assertion library).
      EventTarget: globalThis.EventTarget ?? class EventTarget {},
      Event: globalThis.Event ?? class Event { constructor(t) { this.type = t; } },
      CustomEvent:
        globalThis.CustomEvent ??
        class CustomEvent extends (globalThis.Event ?? class Event { constructor(t) { this.type = t; } }) {},

      // Timer globals: setSafeTimers() reads these from the VM globalThis at startup.
      // Vitest only injects setImmediate/clearImmediate — not the full timer set.
      setTimeout:      globalThis.setTimeout,
      clearTimeout:    globalThis.clearTimeout,
      setInterval:     globalThis.setInterval,
      clearInterval:   globalThis.clearInterval,
      queueMicrotask:  globalThis.queueMicrotask,
      performance:     globalThis.performance,

      // Common Node 18+ globals absent from empty VM contexts.
      AbortController: globalThis.AbortController,
      AbortSignal:     globalThis.AbortSignal,
      URL:             globalThis.URL,
      URLSearchParams: globalThis.URLSearchParams,
      TextEncoder:     globalThis.TextEncoder,
      TextDecoder:     globalThis.TextDecoder,
      structuredClone: globalThis.structuredClone,
      crypto:          globalThis.crypto,
      Blob:            globalThis.Blob,
      Buffer:          globalThis.Buffer,
      process:         globalThis.process,
    });

    // In the vmThreads pool, Vitest ONLY calls setupVM() — environment.setup() is
    // never invoked. We must initialize simnet here so it is present at the time
    // test-file top-level code runs (e.g. `const accounts = simnet.getAccounts()`).
    const clarinetOptions = (options && options.clarinet) ? options.clarinet : {};
    const manifestPath     = clarinetOptions.manifestPath    ?? "./Clarinet.toml";
    const trackCoverage    = clarinetOptions.coverage        ?? false;
    const trackCosts       = clarinetOptions.costs           ?? false;
    const covFilename      = clarinetOptions.coverageFilename ?? "lcov.info";
    const costsFilename    = clarinetOptions.costsFilename    ?? "costs-reports.json";

    if (trackCoverage && fs.existsSync(covFilename)) fs.rmSync(covFilename);
    if (trackCosts    && fs.existsSync(costsFilename)) fs.rmSync(costsFilename);

    const simnet = await initSimnet(manifestPath, false, {
      trackCosts,
      trackCoverage,
    });

    context.simnet          = simnet;
    context.testEnvironment = "clarinet";
    context.coverageReports = [];
    context.costsReports    = [];
    context.options         = options ?? {};

    return {
      getVmContext() {
        return context;
      },
      async teardown() {
        if (trackCoverage && context.coverageReports.length > 0) {
          fs.writeFileSync(covFilename, context.coverageReports.join("\n"));
        }
        if (trackCosts && context.costsReports.length > 0) {
          try {
            const costs = context.costsReports.map((r) => JSON.parse(r)).flat();
            fs.writeFileSync(costsFilename, JSON.stringify(costs, null, 2));
          } catch {}
        }
      },
    };
  },

  // setup() is only called by the non-vmThreads pool path. Keep it here
  // for compatibility if someone switches pool modes.
  async setup(global, options) {
    return clarinetEnv.setup(global, options);
  },
};
