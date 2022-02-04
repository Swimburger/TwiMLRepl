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
        private List<MetadataReference> references = new();
        public StringBuilder CompileLog { get; } = new();

        public CompileService(HttpClient httpClient)
        {
            this.httpClient = httpClient;
        }

        public async Task Init()
        {
            if (!references.Any())
            {
                references = new List<MetadataReference>();
                foreach (var assembly in AppDomain.CurrentDomain.GetAssemblies())
                {
                    if (assembly.IsDynamic)
                    {
                        continue;
                    }

                    var name = assembly.GetName().Name + ".dll";
                    references.Add(
                        MetadataReference.CreateFromStream(
                            await this.httpClient.GetStreamAsync($"/_framework/{name}")));
                }

                var extraAssemblies = new string[]
                {
                    "System.Private.Xml.Linq.dll",
                    "System.Xml.XDocument.dll",
                    "Twilio.dll"
                };

                foreach (var assembly in extraAssemblies)
                    references.Add(
                        MetadataReference.CreateFromStream(
                            await this.httpClient.GetStreamAsync($"/_framework/{assembly}")));
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