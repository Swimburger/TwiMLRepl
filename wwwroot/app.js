const workerUrl = new URL("compiler-worker.js", document.baseURI);
let worker;
let active;
let requestSequence = 0;

function ensureWorker() {
    if (worker) return worker;
    worker = new Worker(workerUrl, { type: "module", name: "twiml-compiler" });
    worker.addEventListener("message", ({ data }) => {
        if (!active || data?.requestId !== active.requestId || data.type !== "result") return;
        const current = active;
        active = undefined;
        clearTimeout(current.timer);
        current.resolve(data.result);
    });
    worker.addEventListener("error", (event) => {
        if (!active) return;
        const current = active;
        active = undefined;
        clearTimeout(current.timer);
        current.resolve({ status: "runtime-error", output: "", message: event.message || "The compiler worker failed.", xmlValid: false });
        worker?.terminate();
        worker = undefined;
    });
    return worker;
}

function finishStopped(status, message) {
    if (!active) return;
    const current = active;
    active = undefined;
    clearTimeout(current.timer);
    current.resolve({ status, output: "", message, xmlValid: false });
}

globalThis.twimlCompiler = {
    run(code, timeoutMilliseconds) {
        if (active) this.stop();
        const compiler = ensureWorker();
        const requestId = ++requestSequence;
        return new Promise((resolve) => {
            const timer = setTimeout(() => {
                worker?.terminate();
                worker = undefined;
                finishStopped("timeout", `Execution exceeded the ${timeoutMilliseconds / 1000}-second limit and was terminated.`);
            }, timeoutMilliseconds);
            active = { requestId, resolve, timer };
            compiler.postMessage({ type: "run", requestId, code, baseUri: document.baseURI });
        });
    },
    stop() {
        worker?.terminate();
        worker = undefined;
        finishStopped("stopped", "Execution was stopped. No output was kept.");
    },
    dispose() {
        worker?.terminate();
        worker = undefined;
        finishStopped("stopped", "Execution was stopped.");
    }
};

globalThis.twimlUi = {
    watchTheme() {
        const forcedColors = matchMedia("(forced-colors: active)");
        const apply = () => globalThis.monaco?.editor.setTheme(forcedColors.matches ? "hc-black" : "vs-dark");
        apply();
        requestAnimationFrame(() => requestAnimationFrame(apply));
        forcedColors.addEventListener("change", apply);
    },
    initToolbar() {
        const toolbar = document.querySelector('[role="toolbar"]');
        if (!toolbar || "focusgroup" in HTMLElement.prototype) return;

        const enabledButtons = () => [...toolbar.querySelectorAll("button:not(:disabled)")];
        const refresh = () => {
            const buttons = enabledButtons();
            if (!buttons.some((button) => button.tabIndex === 0)) {
                buttons.forEach((button, index) => button.tabIndex = index === 0 ? 0 : -1);
            } else {
                buttons.forEach((button) => {
                    if (button.tabIndex !== 0) button.tabIndex = -1;
                });
            }
        };

        toolbar.addEventListener("focusin", ({ target }) => {
            if (!(target instanceof HTMLButtonElement)) return;
            enabledButtons().forEach((button) => button.tabIndex = button === target ? 0 : -1);
        });
        toolbar.addEventListener("keydown", (event) => {
            if (!(event.target instanceof HTMLButtonElement)) return;
            const buttons = enabledButtons();
            const current = buttons.indexOf(event.target);
            let next = current;
            if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (current + 1) % buttons.length;
            else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (current - 1 + buttons.length) % buttons.length;
            else if (event.key === "Home") next = 0;
            else if (event.key === "End") next = buttons.length - 1;
            else return;
            event.preventDefault();
            buttons[next]?.focus();
        });
        new MutationObserver(refresh).observe(toolbar, { subtree: true, attributes: true, attributeFilter: ["disabled"] });
        refresh();
    },
    async copyText(text) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch {
            return false;
        }
    },
    downloadText(filename, text) {
        const url = URL.createObjectURL(new Blob([text], { type: "application/xml;charset=utf-8" }));
        const link = Object.assign(document.createElement("a"), { href: url, download: filename });
        link.click();
        URL.revokeObjectURL(url);
    }
};
