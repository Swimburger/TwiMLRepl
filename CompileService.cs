using System.Reflection;
using System.Text;
using System.Linq;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.Emit;

namespace TwiMLRepl
{
    public class CompileService
    {
        private readonly HttpClient httpClient;
        private readonly ILogger<CompileService> logger;
        private List<MetadataReference> references = new();
        public StringBuilder CompileLog { get; } = new();

        public CompileService(HttpClient httpClient, ILogger<CompileService> logger)
        {
            this.httpClient = httpClient;
            this.logger = logger;
        }

        public async Task Init()
        {
            if (!references.Any())
            {
                var assemblies = new[]
                {
                    "System.Private.CoreLib.dll",
                    "System.Private.Runtime.InteropServices.JavaScript.dll",
                    "System.Runtime.dll",
                    "System.Collections.dll",
                    "Microsoft.AspNetCore.Components.WebAssembly.dll",
                    "Microsoft.JSInterop.WebAssembly.dll",
                    "Microsoft.JSInterop.dll",
                    "System.Collections.Concurrent.dll",
                    "System.Text.Json.dll",
                    "Microsoft.AspNetCore.Components.dll",
                    "System.Private.Uri.dll",
                    "TwiMLRepl.dll",
                    "System.ComponentModel.dll",
                    "Microsoft.Extensions.Configuration.Abstractions.dll",
                    "Microsoft.AspNetCore.Components.Web.dll",
                    "Microsoft.Extensions.DependencyInjection.Abstractions.dll",
                    "Microsoft.Extensions.Logging.dll",
                    "System.Net.Http.dll",
                    "System.Text.Encodings.Web.dll",
                    "System.Memory.dll",
                    "System.Text.Encoding.Extensions.dll",
                    "System.Threading.dll",
                    "System.Numerics.Vectors.dll",
                    "System.Runtime.Intrinsics.dll",
                    "Microsoft.Extensions.Configuration.dll",
                    "netstandard.dll",
                    "Microsoft.Extensions.Primitives.dll",
                    "Microsoft.Extensions.Logging.Abstractions.dll",
                    "Microsoft.Extensions.Options.dll",
                    "Microsoft.Extensions.Configuration.Json.dll",
                    "BlazorMonaco.dll",
                    "System.Net.Primitives.dll",
                    "Microsoft.CodeAnalysis.dll",
                    "Microsoft.Extensions.DependencyInjection.dll",
                    "System.Diagnostics.Tracing.dll",
                    "System.Runtime.Loader.dll",
                    "System.dll",
                    "System.Runtime.InteropServices.dll",
                    "System.Reflection.Emit.Lightweight.dll",
                    "System.Reflection.Emit.ILGeneration.dll",
                    "System.Reflection.Primitives.dll",
                    "System.Security.Cryptography.X509Certificates.dll",
                    "System.Diagnostics.DiagnosticSource.dll",
                    "System.Collections.Immutable.dll",
                    "System.Linq.dll",
                    "System.Console.dll",
                    "System.Private.Xml.Linq.dll",
                    "System.Xml.XDocument.dll",
                    "Twilio.dll"
                };

                foreach (var assembly in assemblies)
                    try
                    {
                        references.Add(
                            MetadataReference.CreateFromStream(
                                await this.httpClient.GetStreamAsync($"/_framework/{assembly}")));
                    }
                    catch (Exception ex)
                    {
                        logger.LogError(ex, "Failed to load assembly");
                    }
            }
        }

        public async Task<Assembly?> Compile(string code)
        {
            CompileLog.Clear();
            await Init();

            var syntaxTree = CSharpSyntaxTree.ParseText(code, new CSharpParseOptions(LanguageVersion.Preview));
            var diagnostics = syntaxTree.GetDiagnostics().ToList();
            foreach (var diagnostic in diagnostics)
            {
                CompileLog.AppendLine(diagnostic.ToString());
            }

            if (diagnostics.Any(i => i.Severity == DiagnosticSeverity.Error))
            {
                CompileLog.AppendLine("Parse SyntaxTree Error!");
                return null;
            }

            CompileLog.AppendLine("Parse SyntaxTree Success");

            var compilation = CSharpCompilation.Create("TwiMLRepl", new[] {syntaxTree},
                references, new CSharpCompilationOptions(OutputKind.DynamicallyLinkedLibrary));

            await using var stream = new MemoryStream();
            var result = compilation.Emit(stream);

            foreach (var diagnostic in result.Diagnostics)
            {
                CompileLog.AppendLine(diagnostic.ToString());
            }

            if (!result.Success)
            {
                CompileLog.AppendLine("Compilation error");
                return null;
            }

            CompileLog.AppendLine("Compilation success!");

            stream.Seek(0, SeekOrigin.Begin);

            var assembly = AppDomain.CurrentDomain.Load(stream.ToArray());
            return assembly;
        }

        public async Task<string?> CompileAndRun(string code)
        {
            await Init();

            var assembly = await Compile(code);
            if (assembly != null)
            {
                var type = assembly.GetExportedTypes().Single(t => t.Name == "Program");
                var methodInfo = type.GetMethod("GetString");
                var instance = Activator.CreateInstance(type);
                return methodInfo.Invoke(instance, null)?.ToString();
            }

            return null;
        }
    }
}