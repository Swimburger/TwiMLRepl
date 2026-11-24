import { expect, test } from "@playwright/test";

async function waitForEditors(page) {
  await page.goto("/");
  await expect(page.locator("#csharp-editor .monaco-editor")).toBeVisible({ timeout: 60_000 });
  await expect(page.locator("#xml-editor .monaco-editor")).toBeVisible({ timeout: 60_000 });
}

async function setSource(page, source) {
  await page.evaluate((value) => {
    const model = globalThis.monaco.editor.getModels().find((candidate) => candidate.getLanguageId() === "csharp");
    if (!model) throw new Error("C# model not found");
    model.setValue(value);
  }, source);
}

test("runs C# in the isolated worker and exposes useful output actions", async ({ page }) => {
  const errors = [];
  const requests = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => requests.push(request.url()));
  await waitForEditors(page);
  await expect(page.locator(".twilio-badge")).toHaveAttribute("src", "assets/powered-by-twilio-red.png");
  await expect(page.locator(".twilio-badge")).toHaveAttribute("alt", "Powered by Twilio");
  expect(requests.some((url) => /library\.twilio\.com|d3cy9zhslanhfa\.cloudfront\.net/.test(url))).toBe(false);
  await expect(page.getByRole("region", { name: "TwiML code workspace" })).toBeVisible();
  expect(await page.locator("#csharp-editor .monaco-editor").evaluate((editor) => getComputedStyle(editor).backgroundColor)).toBe("rgb(30, 30, 30)");
  expect(await page.locator(".site-footer").evaluate((footer) => getComputedStyle(footer).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
  await expect(page.getByRole("textbox", { name: "C# TwiML source editor" })).toHaveCount(1);
  await expect(page.getByRole("textbox", { name: "Generated TwiML XML output" })).toHaveCount(1);
  expect(requests.some((url) => /Microsoft\.CodeAnalysis|Twilio\./.test(url))).toBe(false);
  await setSource(page, 'var response = new MessagingResponse();\nresponse.Message("Compiled by Playwright");\nreturn response;');
  await expect(page.getByRole("status")).toContainText("stale");
  await page.getByRole("button", { name: "Run" }).click();
  await expect(page.getByRole("status")).toContainText("Valid XML", { timeout: 60_000 });
  await expect(page.locator("#xml-editor .view-lines")).toContainText("Compiled by Playwright");
  expect(requests.some((url) => /Microsoft\.CodeAnalysis|Twilio\./.test(url))).toBe(true);
  await page.evaluate(() => { globalThis.twimlUi.copyText = async () => false; });
  await page.getByRole("button", { name: "Copy TwiML" }).click();
  await expect(page.locator('.run-state[data-state="runtime-error"]')).toContainText("Copy failed");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download TwiML" }).click();
  expect((await download).suggestedFilename()).toBe("twiml.xml");
  await expect(page.locator('.run-state[data-state="success"]')).toContainText("downloaded");
  expect(errors).toEqual([]);
});

test("clears stale output and reports compile and unwrapped runtime errors", async ({ page }) => {
  await waitForEditors(page);
  await page.getByRole("button", { name: "Run" }).click();
  await expect(page.getByRole("status")).toContainText("Valid XML", { timeout: 60_000 });
  await setSource(page, "this is not C sharp;");
  await expect(page.getByRole("status")).toContainText("stale");
  await page.getByRole("button", { name: "Run" }).click();
  await expect(page.locator('.run-state[data-state="compile-error"]')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator("#xml-editor .view-lines")).toBeEmpty();
  await setSource(page, 'throw new InvalidOperationException("Visible inner error");');
  await page.getByRole("button", { name: "Run" }).click();
  await expect(page.getByRole("status")).toContainText("Visible inner error", { timeout: 60_000 });
  await expect(page.locator('.run-state[data-state="runtime-error"]')).toBeVisible();
  await expect(page.locator("#xml-editor .view-lines")).toBeEmpty();
  await setSource(page, 'var response = new MessagingResponse(); response.Message(new string(\'x\', 300000)); return response;');
  await page.getByRole("button", { name: "Run" }).click();
  await expect(page.getByRole("status")).toContainText("256 KiB safety limit", { timeout: 60_000 });
  await expect(page.locator("#xml-editor .view-lines")).toBeEmpty();
});

test("can terminate runaway code and recreate the worker", async ({ page }) => {
  await waitForEditors(page);
  await setSource(page, "while (true) { }");
  await page.getByRole("button", { name: "Run" }).click();
  await expect(page.getByRole("button", { name: "Stop" })).toBeEnabled();
  await page.getByRole("button", { name: "Stop" }).click();
  await expect(page.locator('.run-state[data-state="stopped"]')).toContainText("stopped");
  await setSource(page, "while (true) { }");
  await page.getByRole("button", { name: "Run" }).click();
  await setSource(page, 'var response = new MessagingResponse(); response.Message("Recovered"); return response;');
  await page.getByRole("button", { name: "Stop" }).click();
  await expect(page.locator('.run-state[data-state="stale"]')).toContainText("discarded");
  await page.getByRole("button", { name: "Run" }).click();
  await expect(page.locator("#xml-editor .view-lines")).toContainText("Recovered", { timeout: 60_000 });
  const timeoutResult = await page.evaluate(() => globalThis.twimlCompiler.run("while (true) { }", 100));
  expect(timeoutResult.status).toBe("timeout");
  expect(timeoutResult.output).toBe("");
});

test("stacks the distinctly labelled editors on a narrow viewport", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ colorScheme: "dark" });
  await waitForEditors(page);
  const boxes = await page.locator(".editor-panel").evaluateAll((panels) => panels.map((panel) => panel.getBoundingClientRect().toJSON()));
  expect(boxes).toHaveLength(2);
  expect(boxes[1].top).toBeGreaterThan(boxes[0].bottom);
  await expect(page.getByRole("heading", { name: "C# input" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "TwiML output" })).toBeVisible();
  await expect(page.getByRole("toolbar", { name: "Editor actions" })).toBeVisible();
  await page.getByRole("button", { name: "Run" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("button", { name: "Reset" })).toBeFocused();
  await expect(page.locator(".footer-inner img[alt='Swimburger logo']")).toHaveAttribute("width", "32");
  await expect(page.locator(".site-footer")).toContainText("Privacy Policy");
  await expect(page.locator(".site-footer")).toContainText("not affiliated with or endorsed by Twilio Inc.");
  const badgeSizing = await page.locator(".twilio-badge").evaluate((badge) => {
    const badgeBox = badge.getBoundingClientRect();
    const clearspaceBox = badge.parentElement.getBoundingClientRect();
    return { badgeWidth: badgeBox.width, badgeHeight: badgeBox.height, clearspaceWidth: clearspaceBox.width, clearspaceHeight: clearspaceBox.height };
  });
  expect(badgeSizing).toEqual({ badgeWidth: 105, badgeHeight: 28, clearspaceWidth: 133, clearspaceHeight: 56 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  expect(await page.locator('meta[name="viewport"]').getAttribute("content")).not.toMatch(/maximum-scale|user-scalable/i);
  await expect(page.locator('#blazor-error-ui button[aria-label="Dismiss error message"]')).toHaveCount(1);
  expect(await page.locator("#csharp-editor .monaco-editor").evaluate((editor) => getComputedStyle(editor).backgroundColor)).toBe("rgb(30, 30, 30)");
});

test("serves Brotli framework sidecars with correct headers and preserves SPA headers", async ({ page, request }) => {
  const root = await request.get("/");
  expect(root.status()).toBe(200);
  expect(root.headers()["cache-control"]).toContain("must-revalidate");
  expect(root.headers()["x-content-type-options"]).toBe("nosniff");
  expect(root.headers()["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(await root.text()).not.toMatch(/google-analytics|googletagmanager|gtag\(/i);
  const deepLink = await request.get("/deep/link", { headers: { Accept: "text/html" } });
  expect(deepLink.status()).toBe(200);
  await waitForEditors(page);
  const frameworkUrl = await page.evaluate(() => performance.getEntriesByType("resource").map((entry) => entry.name)
    .find((url) => /\/_framework\/.*\.(wasm|dll)$/.test(url)));
  expect(frameworkUrl).toBeTruthy();
  const compressed = await request.get(frameworkUrl, { headers: { "Accept-Encoding": "br" } });
  expect(compressed.status()).toBe(200);
  expect(compressed.headers()["content-encoding"]).toBe("br");
  expect(compressed.headers().vary).toContain("Accept-Encoding");
  expect(compressed.headers()["cache-control"]).toContain("immutable");
  expect(compressed.headers()["content-type"]).toMatch(/application\/(wasm|octet-stream)/);
});

test("keeps the workspace legible and operable in forced colors", async ({ page }) => {
  await page.emulateMedia({ forcedColors: "active" });
  await waitForEditors(page);
  const run = page.getByRole("button", { name: "Run" });
  await expect(run).toBeVisible();
  await expect(run).toHaveText("Run");
  const colors = await run.evaluate((button) => {
    const style = getComputedStyle(button);
    return { color: style.color, background: style.backgroundColor, borderWidth: style.borderTopWidth };
  });
  expect(colors.color).not.toBe(colors.background);
  expect(colors.borderWidth).toBe("3px");
  expect(await page.locator("#csharp-editor .monaco-editor").evaluate((editor) => getComputedStyle(editor).backgroundColor)).toBe("rgb(0, 0, 0)");
  await page.locator("#blazor-error-ui").evaluate((error) => { error.style.display = "block"; });
  const errorColors = await page.locator("#blazor-error-ui").evaluate((error) => {
    const style = getComputedStyle(error);
    return { color: style.color, background: style.backgroundColor, borderWidth: style.borderTopWidth };
  });
  expect(errorColors.color).not.toBe(errorColors.background);
  expect(errorColors.borderWidth).toBe("2px");
});

test("declares the initial canvas theme before the app boots", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.route("**/_framework/blazor.webassembly.js", (route) => route.abort());
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".initial-loading")).toBeVisible();
  expect(await page.locator('meta[name="color-scheme"]').getAttribute("content")).toBe("light dark");
  const theme = await page.evaluate(() => ({
    rootScheme: getComputedStyle(document.documentElement).colorScheme,
    canvas: getComputedStyle(document.body).backgroundColor,
    loadingColor: getComputedStyle(document.querySelector(".initial-loading")).color,
    progressAccent: getComputedStyle(document.querySelector(".initial-loading progress")).accentColor
  }));
  expect(theme.rootScheme).toContain("light");
  expect(theme.rootScheme).toContain("dark");
  expect(theme.canvas).toBe("rgb(13, 18, 25)");
  expect(theme.loadingColor).toBe("rgb(174, 184, 198)");
  expect(theme.progressAccent).toBe("rgb(255, 107, 127)");
});

test("keeps the code surface dark while page and forced-color preferences change at runtime", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light", forcedColors: "none" });
  await waitForEditors(page);
  const schemeBoundary = await page.locator(".workspace-shell").evaluate((workspace) => {
    const style = getComputedStyle(workspace);
    const selectStyle = getComputedStyle(workspace.querySelector("select"));
    return {
      scheme: style.colorScheme,
      background: style.backgroundColor,
      color: style.color,
      accent: style.accentColor,
      caret: style.caretColor,
      selectScheme: selectStyle.colorScheme
    };
  });
  expect(schemeBoundary.scheme).toContain("dark");
  expect(schemeBoundary.background).not.toBe("rgba(0, 0, 0, 0)");
  expect(schemeBoundary.color).toBe("rgb(237, 241, 246)");
  expect(schemeBoundary.accent).toBe("rgb(217, 31, 58)");
  expect(schemeBoundary.caret).toBe("rgb(237, 241, 246)");
  expect(schemeBoundary.selectScheme).toContain("dark");

  await page.emulateMedia({ colorScheme: "dark", forcedColors: "none" });
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgb(13, 18, 25)");
  expect(await page.locator("#csharp-editor .monaco-editor").evaluate((editor) => getComputedStyle(editor).backgroundColor)).toBe("rgb(30, 30, 30)");
  await page.getByRole("button", { name: "Run" }).focus();
  expect(await page.getByRole("button", { name: "Run" }).evaluate((button) => getComputedStyle(button).outlineColor)).toBe("rgb(255, 107, 127)");

  await page.emulateMedia({ colorScheme: "dark", forcedColors: "active" });
  await expect.poll(() => page.locator("#csharp-editor .monaco-editor").evaluate((editor) => getComputedStyle(editor).backgroundColor)).toBe("rgb(0, 0, 0)");
  await page.emulateMedia({ colorScheme: "light", forcedColors: "none" });
  await expect.poll(() => page.locator("#csharp-editor .monaco-editor").evaluate((editor) => getComputedStyle(editor).backgroundColor)).toBe("rgb(30, 30, 30)");
});
