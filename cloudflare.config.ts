import { defineConfig } from "cf/config";

export default defineConfig({
  worker: {
    name: "twiml-repl",
    compatibilityDate: "2026-11-23",
    domains: ["twiml.swimburger.net"],
    assets: {
      notFoundHandling: "single-page-application",
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
