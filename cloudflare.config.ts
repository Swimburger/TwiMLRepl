import { bindings, defineConfig } from "cf/config";

export default defineConfig({
  worker: {
    name: "twiml-repl",
    compatibilityDate: "2026-11-23",
    entrypoint: "./src/worker.ts",
    env: {
      ASSETS: bindings.assets(),
    },
    domains: ["twiml.swimburger.net"],
    assets: {
      notFoundHandling: "single-page-application",
      runWorkerFirst: ["/_framework/*"],
    },
    observability: {
      enabled: true,
      redactQueryString: true,
      logs: {
        enabled: true,
        headSamplingRate: 1,
      },
      traces: {
        enabled: true,
        headSamplingRate: 0.01,
      },
    },
  },
});
