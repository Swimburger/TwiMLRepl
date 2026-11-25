import * as monaco from "monaco-editor/editor/editor.api.js";
import "monaco-editor/languages/definitions/csharp/register.js";
import "monaco-editor/languages/definitions/xml/register.js";

declare const MONACO_WORKER_URL: string;

type DotNetReference = {
  invokeMethodAsync(method: string): Promise<unknown>;
};

const monacoEnvironment = {
  getWorker() {
    return new Worker(new URL(MONACO_WORKER_URL, import.meta.url), {
      name: "monaco-editor-worker",
      type: "module",
    });
  },
};

(globalThis as typeof globalThis & { MonacoEnvironment: typeof monacoEnvironment }).MonacoEnvironment = monacoEnvironment;

let sourceEditor: monaco.editor.IStandaloneCodeEditor | undefined;
let outputEditor: monaco.editor.IStandaloneCodeEditor | undefined;
let sourceModel: monaco.editor.ITextModel | undefined;
let outputModel: monaco.editor.ITextModel | undefined;
let sourceChangeSubscription: monaco.IDisposable | undefined;
let dotNetReference: DotNetReference | undefined;
let suppressSourceChange = false;
let autoRunTimer: ReturnType<typeof setTimeout> | undefined;
let forcedColorsQuery: MediaQueryList | undefined;
let colorSchemeQuery: MediaQueryList | undefined;

function applyTheme() {
  monaco.editor.setTheme(forcedColorsQuery?.matches ? "hc-black" : "vs-dark");
}

function commonOptions(ariaLabel: string): monaco.editor.IStandaloneEditorConstructionOptions {
  return {
    accessibilitySupport: "auto",
    ariaLabel,
    automaticLayout: true,
    minimap: { enabled: false },
    theme: "vs-dark",
  };
}

export function createEditors(
  sourceElement: HTMLElement,
  outputElement: HTMLElement,
  initialSource: string,
  reference: DotNetReference,
) {
  disposeEditors();
  dotNetReference = reference;

  sourceModel = monaco.editor.createModel(initialSource, "csharp", monaco.Uri.parse("inmemory://twiml/source.cs"));
  outputModel = monaco.editor.createModel("", "xml", monaco.Uri.parse("inmemory://twiml/output.xml"));
  sourceEditor = monaco.editor.create(sourceElement, {
    ...commonOptions("C# TwiML source editor"),
    model: sourceModel,
  });
  outputEditor = monaco.editor.create(outputElement, {
    ...commonOptions("Generated TwiML XML output"),
    domReadOnly: true,
    model: outputModel,
    readOnly: true,
  });
  outputEditor.getDomNode()?.querySelector('[role="textbox"]')?.setAttribute("aria-readonly", "true");

  sourceChangeSubscription = sourceModel.onDidChangeContent(() => {
    if (suppressSourceChange) return;
    void dotNetReference?.invokeMethodAsync("OnSourceChanged");
    cancelAutoRun();
    autoRunTimer = setTimeout(() => {
      autoRunTimer = undefined;
      document.querySelector<HTMLButtonElement>("#run-button")?.click();
    }, 600);
  });

  forcedColorsQuery = matchMedia("(forced-colors: active)");
  colorSchemeQuery = matchMedia("(prefers-color-scheme: dark)");
  forcedColorsQuery.addEventListener("change", applyTheme);
  colorSchemeQuery.addEventListener("change", applyTheme);
  applyTheme();
}

export function getSource() {
  return sourceModel?.getValue() ?? "";
}

export function setSource(value: string, notify = true) {
  if (!sourceModel) return;
  suppressSourceChange = !notify;
  try {
    sourceModel.setValue(value);
  } finally {
    suppressSourceChange = false;
  }
}

export function getOutput() {
  return outputModel?.getValue() ?? "";
}

export function setOutput(value: string) {
  outputModel?.setValue(value);
}

export function setMarkers(markers: monaco.editor.IMarkerData[]) {
  if (sourceModel) monaco.editor.setModelMarkers(sourceModel, "roslyn", markers ?? []);
}

export function setTheme(theme: "vs-dark" | "hc-black") {
  monaco.editor.setTheme(theme);
}

export function cancelAutoRun() {
  if (autoRunTimer !== undefined) clearTimeout(autoRunTimer);
  autoRunTimer = undefined;
}

export function disposeEditors() {
  cancelAutoRun();
  sourceChangeSubscription?.dispose();
  sourceChangeSubscription = undefined;
  sourceEditor?.dispose();
  sourceEditor = undefined;
  outputEditor?.dispose();
  outputEditor = undefined;
  sourceModel?.dispose();
  sourceModel = undefined;
  outputModel?.dispose();
  outputModel = undefined;
  forcedColorsQuery?.removeEventListener("change", applyTheme);
  forcedColorsQuery = undefined;
  colorSchemeQuery?.removeEventListener("change", applyTheme);
  colorSchemeQuery = undefined;
  dotNetReference = undefined;
}
