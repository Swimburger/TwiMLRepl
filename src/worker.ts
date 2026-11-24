const compressibleFrameworkAsset = /\.(?:dll|wasm|js|json|dat)$/i;

function contentType(pathname: string): string {
  if (pathname.endsWith(".wasm")) return "application/wasm";
  if (pathname.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (pathname.endsWith(".json")) return "application/json; charset=utf-8";
  return "application/octet-stream";
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const acceptsBrotli = request.headers.get("Accept-Encoding")?.split(",").some((value) => value.trim().startsWith("br"));
    if (!acceptsBrotli || request.headers.has("Range") || !compressibleFrameworkAsset.test(url.pathname)) {
      return env.ASSETS.fetch(request);
    }

    const compressedUrl = new URL(url);
    compressedUrl.pathname += ".br";
    const compressedRequest = new Request(compressedUrl, request);
    const compressed = await env.ASSETS.fetch(compressedRequest);
    if (!compressed.ok) return env.ASSETS.fetch(request);

    const headers = new Headers(compressed.headers);
    headers.set("Content-Encoding", "br");
    headers.set("Content-Type", contentType(url.pathname));
    headers.set("Vary", "Accept-Encoding");
    headers.delete("Content-Length");
    return new Response(compressed.body, {
      status: compressed.status,
      statusText: compressed.statusText,
      headers,
      encodeBody: "manual",
    });
  },
} satisfies ExportedHandler<Env>;
