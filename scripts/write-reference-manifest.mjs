import { readFile, writeFile } from "node:fs/promises";

const runtimePath = new URL("../dist/wwwroot/_framework/dotnet.js", import.meta.url);
const outputPath = new URL("../dist/wwwroot/assembly-references.json", import.meta.url);
const runtime = await readFile(runtimePath, "utf8");
const startMarker = "/*json-start*/";
const endMarker = "/*json-end*/";
const start = runtime.indexOf(startMarker);
const end = runtime.indexOf(endMarker, start);

if (start < 0 || end < 0) {
  throw new Error("The .NET runtime asset manifest was not found in dotnet.js.");
}

const config = JSON.parse(runtime.slice(start + startMarker.length, end));
const requiredAssemblies = new Set([
  "System.Private.CoreLib.dll",
  "System.Runtime.InteropServices.JavaScript.dll",
  "System.Runtime.dll",
  "System.Collections.dll",
  "System.Collections.Concurrent.dll",
  "System.Collections.Immutable.dll",
  "System.ComponentModel.dll",
  "System.Console.dll",
  "System.Diagnostics.DiagnosticSource.dll",
  "System.Diagnostics.Tracing.dll",
  "System.Linq.dll",
  "System.Memory.dll",
  "System.Net.Http.dll",
  "System.Net.Primitives.dll",
  "System.Private.Uri.dll",
  "System.Private.Xml.Linq.dll",
  "System.Reflection.Primitives.dll",
  "System.Runtime.Intrinsics.dll",
  "System.Runtime.InteropServices.dll",
  "System.Runtime.Loader.dll",
  "System.Text.Encoding.Extensions.dll",
  "System.Text.Encodings.Web.dll",
  "System.Text.Json.dll",
  "System.Threading.dll",
  "System.Xml.XDocument.dll",
  "System.dll",
  "Twilio.dll",
]);
const assemblyGroups = [
  config.resources?.coreAssembly ?? [],
  config.resources?.assembly ?? [],
];
const assemblies = assemblyGroups
  .flat()
  .filter((asset) => requiredAssemblies.has(asset.virtualPath) && asset.name?.endsWith(".dll"))
  .map((asset) => asset.name)
  .sort();

if (assemblies.length !== requiredAssemblies.size) {
  const published = new Set(assemblyGroups.flat().map((asset) => asset.virtualPath));
  const missing = [...requiredAssemblies].filter((assembly) => !published.has(assembly));
  throw new Error(`Required published assemblies were not found: ${missing.join(", ")}`);
}

await writeFile(outputPath, `${JSON.stringify(assemblies, null, 2)}\n`);
