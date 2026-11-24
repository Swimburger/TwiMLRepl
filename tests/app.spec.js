import { expect, test } from "@playwright/test";

test("loads both editors and compiles edited TwiML", async ({ page }) => {
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "TwiML C# REPL" })).toBeVisible();
  await expect(page.locator("#csharp-editor .monaco-editor")).toBeVisible({ timeout: 60_000 });
  await expect(page.locator("#xml-editor .monaco-editor")).toBeVisible({ timeout: 60_000 });
  await expect(page.locator("#xml-editor .view-lines")).toContainText("Hello from C#!", { timeout: 60_000 });

  await page.locator("#csharp-editor .view-lines").click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.insertText(
    'var response = new MessagingResponse();\nresponse.Message("Compiled by Playwright");\nreturn response;',
  );
  await page.waitForTimeout(5_000);
  expect(errors).toEqual([]);
  await expect(page.locator("#xml-editor .view-lines")).toContainText("Compiled by Playwright", {
    timeout: 60_000,
  });

  expect(errors).toEqual([]);
});

test("serves the SPA with Cloudflare headers and immutable framework assets", async ({ page, request }) => {
  const root = await request.get("/");
  expect(root.status()).toBe(200);
  expect(root.headers()["cache-control"]).toContain("must-revalidate");
  expect(root.headers()["x-content-type-options"]).toBe("nosniff");
  expect(root.headers()["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  const rootHtml = await root.text();
  expect(rootHtml).not.toMatch(/google-analytics|googletagmanager|gtag\(/i);

  const deepLink = await request.get("/deep/link", {
    headers: { Accept: "text/html" },
  });
  expect(deepLink.status()).toBe(200);
  expect(await deepLink.text()).toBe(rootHtml);

  await page.goto("/");
  await expect(page.locator("#csharp-editor .monaco-editor")).toBeVisible({ timeout: 60_000 });
  const frameworkUrl = await page.evaluate(() =>
    performance
      .getEntriesByType("resource")
      .map((entry) => entry.name)
      .find((url) => url.includes("/_framework/") && (url.endsWith(".wasm") || url.endsWith(".dll"))),
  );
  expect(frameworkUrl).toBeTruthy();

  const frameworkAsset = await request.get(frameworkUrl);
  expect(frameworkAsset.status()).toBe(200);
  expect(frameworkAsset.headers()["cache-control"]).toContain("immutable");
});
