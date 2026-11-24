using System.Net.Http.Json;
using System.Reflection;
using System.Text;
using System.Xml.Linq;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;

namespace TwiMLRepl.Compiler;

public sealed class CompileService(HttpClient httpClient)
{
    public const int MaxOutputBytes = 256 * 1024;
    private readonly List<MetadataReference> references = [];
    private Task? initializationTask;
    public Task Init() => initializationTask ??= LoadReferences();

    private async Task LoadReferences()
    {
        var assemblies = await httpClient.GetFromJsonAsync<string[]>("assembly-references.json")
            ?? throw new InvalidOperationException("The assembly reference manifest is missing.");
        foreach (var assembly in assemblies)
        {
            var image = await httpClient.GetByteArrayAsync($"_framework/{assembly}");
            references.Add(MetadataReference.CreateFromImage(image));
        }
    }

    public async Task<CompileResult> CompileAndRun(string userCode)
    {
        try
        {
            await Init();
            var syntaxTree = CSharpSyntaxTree.ParseText(Wrap(userCode), new CSharpParseOptions(LanguageVersion.Preview));
            var parseErrors = syntaxTree.GetDiagnostics().Where(d => d.Severity == DiagnosticSeverity.Error).ToArray();
            if (parseErrors.Length > 0) return CompileResult.Failure("compile-error", FormatDiagnostics(parseErrors));
            var compilation = CSharpCompilation.Create($"TwiMLRepl_{Guid.NewGuid():N}", [syntaxTree], references,
                new CSharpCompilationOptions(OutputKind.DynamicallyLinkedLibrary));
            await using var stream = new MemoryStream();
            var emit = compilation.Emit(stream);
            if (!emit.Success) return CompileResult.Failure("compile-error", FormatDiagnostics(emit.Diagnostics.Where(d => d.Severity == DiagnosticSeverity.Error)));
            stream.Position = 0;
            var type = AppDomain.CurrentDomain.Load(stream.ToArray()).GetExportedTypes().SingleOrDefault(t => t.Name == "Program")
                ?? throw new InvalidOperationException("Compiled code does not export a Program type.");
            var method = type.GetMethod("GetString") ?? throw new InvalidOperationException("Compiled Program does not expose GetString().");
            var instance = Activator.CreateInstance(type) ?? throw new InvalidOperationException("Compiled Program could not be created.");
            string xml;
            try { xml = method.Invoke(instance, null)?.ToString() ?? string.Empty; }
            catch (TargetInvocationException exception) when (exception.InnerException is not null) { throw exception.InnerException; }
            if (Encoding.UTF8.GetByteCount(xml) > MaxOutputBytes)
                return CompileResult.Failure("runtime-error", $"Output exceeded the {MaxOutputBytes / 1024} KiB safety limit and was discarded.");
            try { return CompileResult.Success(XDocument.Parse(xml).ToString(), "Valid XML"); }
            catch (Exception exception) when (exception is System.Xml.XmlException or InvalidOperationException)
            { return CompileResult.Failure("runtime-error", $"The generated TwiML is not valid XML: {exception.Message}"); }
        }
        catch (Exception exception)
        {
            return CompileResult.Failure("runtime-error", exception.Message);
        }
    }

    private static string Wrap(string userCode) => $$"""
        using System;
        using Twilio.TwiML;
        public class Program
        {
            public string GetString() => GetTwiML().ToString();
            public TwiML GetTwiML()
            {
                {{userCode}}
            }
        }
        """;

    private static string FormatDiagnostics(IEnumerable<Diagnostic> diagnostics)
    {
        var builder = new StringBuilder();
        foreach (var diagnostic in diagnostics.Take(50)) builder.AppendLine(diagnostic.ToString());
        return builder.ToString().TrimEnd();
    }
}

public sealed record CompileResult(string Status, string Output, string Message, bool XmlValid)
{
    public static CompileResult Success(string output, string message) => new("success", output, message, true);
    public static CompileResult Failure(string status, string message) => new(status, string.Empty, message, false);
}
