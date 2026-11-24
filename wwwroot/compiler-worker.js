let runCompiler;

async function initialize() {
    if (runCompiler) return runCompiler;
    const { dotnet } = await import("./_framework/dotnet.js");
    const runtime = await dotnet.create();
    const lazyAssemblies = runtime.getConfig().resources?.lazyAssembly ?? [];
    await Promise.all(lazyAssemblies.map((assembly) => runtime.INTERNAL.loadLazyAssembly(assembly.virtualPath)));
    const exports = await runtime.getAssemblyExports("TwiMLRepl.Compiler");
    runCompiler = exports.TwiMLRepl.Compiler.WorkerCompiler.RunAsync;
    return runCompiler;
}

self.addEventListener("message", async ({ data }) => {
    if (data?.type !== "run") return;
    const { requestId, code, baseUri } = data;
    try {
        self.postMessage({ type: "progress", requestId, stage: "loading" });
        const compile = await initialize();
        self.postMessage({ type: "progress", requestId, stage: "running" });
        const json = await compile(code, baseUri);
        const result = JSON.parse(json);
        if (typeof result.output === "string" && new TextEncoder().encode(result.output).byteLength > 256 * 1024) {
            self.postMessage({
                type: "result",
                requestId,
                result: { status: "runtime-error", output: "", message: "Output exceeded the 256 KiB safety limit and was discarded.", xmlValid: false }
            });
            return;
        }
        self.postMessage({ type: "result", requestId, result });
    } catch (error) {
        self.postMessage({
            type: "result",
            requestId,
            result: { status: "runtime-error", output: "", message: error instanceof Error ? error.message : String(error), xmlValid: false }
        });
    }
});
