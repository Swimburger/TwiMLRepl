using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Reflection;
using System.Text;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Components;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.Emit;

namespace TwiMLRepl
{
    public class CompileService
    {
        private readonly HttpClient _http;
        private readonly NavigationManager _uriHelper;
        public StringBuilder CompileLog { get; set; } = new StringBuilder();
        private List<MetadataReference> references { get; set; }


        public CompileService(HttpClient http, NavigationManager uriHelper)
        {
            _http = http;
            _uriHelper = uriHelper;
        }

        public async Task Init()
        {
            if (references == null)
            {
                references = new List<MetadataReference>();
                foreach (var assembly in AppDomain.CurrentDomain.GetAssemblies())
                {
                    if (assembly.IsDynamic)
                    {
                        continue;
                    }

                    var name = assembly.GetName().Name + ".dll";
                    Console.WriteLine(name);
                    references.Add(
                        MetadataReference.CreateFromStream(
                            await this._http.GetStreamAsync($"/_framework/{name}")));
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
                            await this._http.GetStreamAsync($"/_framework/{assembly}")));
            }
        }
        
        public async Task<Assembly> Compile(string code)
        {
            CompileLog.Clear();
            await Init();

            SyntaxTree syntaxTree = CSharpSyntaxTree.ParseText(code, new CSharpParseOptions(LanguageVersion.Preview));
            foreach (var diagnostic in syntaxTree.GetDiagnostics())
            {
                CompileLog.AppendLine(diagnostic.ToString());
            }

            if (syntaxTree.GetDiagnostics().Any(i => i.Severity == DiagnosticSeverity.Error))
            {
                CompileLog.AppendLine("Parse SyntaxTree Error!");
                return null;
            }

            CompileLog.AppendLine("Parse SyntaxTree Success");

            CSharpCompilation compilation = CSharpCompilation.Create("CompileBlazorInBlazor.Demo", new[] {syntaxTree},
                references, new CSharpCompilationOptions(OutputKind.DynamicallyLinkedLibrary));

            using (MemoryStream stream = new MemoryStream())
            {
                EmitResult result = compilation.Emit(stream);

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

                Assembly assemby = AppDomain.CurrentDomain.Load(stream.ToArray());
                return assemby;
            }
        }
        
        public async Task<string> CompileAndRun(string code)
        {
            await Init();

            var assemby = await this.Compile(code);
            if (assemby != null)
            {
                var type = assemby.GetExportedTypes().Single(t => t.Name == "Program");
                var methodInfo = type.GetMethod("GetString");
                var instance = Activator.CreateInstance(type);
                return methodInfo.Invoke(instance, new object[] { })?.ToString();
            }

            return null;
        }
    }
}