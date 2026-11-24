import * as integration from "./editor-integration-LFEOIPFP.js";
const stylesheetUrl = new URL("./editor-integration-IRDWKWOY.css", import.meta.url).href;
const stylesheetReady = new Promise((resolve, reject) => {
  const existing = document.querySelector(`link[data-monaco-stylesheet="${stylesheetUrl}"]`);
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
export const disposeEditors = integration.disposeEditors;
