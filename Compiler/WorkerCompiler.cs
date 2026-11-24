using System.Runtime.InteropServices.JavaScript;
using System.Runtime.Versioning;
using System.Text.Json;

namespace TwiMLRepl.Compiler;

[SupportedOSPlatform("browser")]
public static partial class WorkerCompiler
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private static CompileService? compiler;

    [JSExport]
    public static async Task<string> RunAsync(string code, string baseUri)
    {
        compiler ??= new CompileService(new HttpClient { BaseAddress = new Uri(baseUri) });
        return JsonSerializer.Serialize(await compiler.CompileAndRun(code), JsonOptions);
    }
}
