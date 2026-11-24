using System.Reflection;
using System.Text;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.Emit;

namespace TwiMLRepl
{
    public class CompileService
    {
        private readonly HttpClient httpClient;
        private readonly ILogger<CompileService> logger;
        private readonly List<MetadataReference> references = new();
        private Task? initializationTask;
        public StringBuilder CompileLog { get; } = new();

        public CompileService(HttpClient httpClient, ILogger<CompileService> logger)
        {
            this.httpClient = httpClient;
            this.logger = logger;
        }

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
                var type = assembly.GetExportedTypes().SingleOrDefault(t => t.Name == "Program");
                if (type is null)
                {
                    CompileLog.AppendLine("Compiled code does not export a Program type.");
                    return null;
                }

                var methodInfo = type.GetMethod("GetString");
                var instance = Activator.CreateInstance(type);
                if (methodInfo is null || instance is null)
                {
                    CompileLog.AppendLine("Compiled Program does not expose GetString().");
                    return null;
                }

                return methodInfo.Invoke(instance, null)?.ToString();
            }

            return null;
        }
    }
}
