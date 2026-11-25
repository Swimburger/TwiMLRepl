import { build } from "esbuild";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const outputDirectory = path.resolve("wwwroot/assets/monaco");
await rm(outputDirectory, { force: true, recursive: true });
await mkdir(outputDirectory, { recursive: true });

const sharedOptions = {
  bundle: true,
  format: "esm",
  legalComments: "eof",
  minify: true,
  outdir: outputDirectory,
  target: ["es2022"],
  write: true,
};

const workerBuild = await build({
  ...sharedOptions,
  entryNames: "[name]-[hash]",
  entryPoints: { "editor-worker": "src/monaco-worker.ts" },
  metafile: true,
});

const workerOutput = Object.entries(workerBuild.metafile.outputs)
  .find(([, details]) => details.entryPoint?.endsWith("src/monaco-worker.ts"))?.[0];
if (!workerOutput) throw new Error("The Monaco editor worker was not emitted.");

const editorBuild = await build({
  ...sharedOptions,
  assetNames: "[name]-[hash]",
  define: { MONACO_WORKER_URL: JSON.stringify(`./${path.basename(workerOutput)}`) },
  entryNames: "[name]-[hash]",
  entryPoints: { "editor-integration": "src/monaco-editor.ts" },
  loader: { ".ttf": "file" },
  metafile: true,
});

const editorOutputs = Object.entries(editorBuild.metafile.outputs);
const editorScript = editorOutputs.find(([, details]) => details.entryPoint?.endsWith("src/monaco-editor.ts") && details.bytes > 0)?.[0];
const editorStylesheet = editorOutputs.find(([filename]) => filename.endsWith(".css"))?.[0];
if (!editorScript || !editorStylesheet) throw new Error("The Monaco editor bundle was incomplete.");

const loader = `import * as integration from "./${path.basename(editorScript)}";
const stylesheetUrl = new URL("./${path.basename(editorStylesheet)}", import.meta.url).href;
const stylesheetReady = new Promise((resolve, reject) => {
  const existing = document.querySelector(\`link[data-monaco-stylesheet="\${stylesheetUrl}"]\`);
  if (existing) { resolve(); return; }
  const link = Object.assign(document.createElement("link"), { rel: "stylesheet", href: stylesheetUrl });
  link.dataset.monacoStylesheet = stylesheetUrl;
  link.addEventListener("load", resolve, { once: true });
  link.addEventListener("error", () => reject(new Error("The Monaco stylesheet could not be loaded.")), { once: true });
  document.head.append(link);
});
export async function createEditors(...args) { await stylesheetReady; return integration.createEditors(...args); }
export const getSource = integration.getSource;
export const setSource = integration.setSource;
export const getOutput = integration.getOutput;
export const setOutput = integration.setOutput;
export const setMarkers = integration.setMarkers;
export const setTheme = integration.setTheme;
export const cancelAutoRun = integration.cancelAutoRun;
export const disposeEditors = integration.disposeEditors;
`;

await writeFile(path.join(outputDirectory, "integration.js"), loader);
