# TwiML C# REPL

Quickly test the C# .NET TwiML APIs and see the resulting TwiML immediately:
https://twiml.swimburger.net/

The application compiles and runs the C# snippets locally in Blazor WebAssembly;
code is not sent to a server. Production is hosted with Cloudflare Workers
Static Assets.

## Requirements

- [.NET 11 SDK](https://dotnet.microsoft.com/download/dotnet/11.0)
- [Node.js 26](https://nodejs.org/)
- [pnpm 12](https://pnpm.io/installation)

## Run locally

```bash
dotnet run
```

## Build and test

```bash
pnpm install --frozen-lockfile
pnpm run build:cloudflare
pnpm run test:e2e
```

The Cloudflare build serves `dist/wwwroot` with SPA fallback routing. The CI
workflow builds and tests but does not deploy.

## Deploy

Use `cf auth whoami` to confirm that the CLI is authenticated to the intended
personal Cloudflare account, then run:

```bash
pnpm run deploy
```
