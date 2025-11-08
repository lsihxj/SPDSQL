using SPDSQL.Server.Models;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

using NCalc;
using SPDSQL.Server.Controllers;using System;
using System.Net.Http;
using Microsoft.Extensions.Configuration;

namespace SPDSQL.Server.Services
{
    public class WorkflowService
    {
        private readonly AiService _aiService;
        private readonly SqlExecutionService _sqlExecutionService;
        private readonly IConfiguration _configuration;

        public WorkflowService(AiService aiService, SqlExecutionService sqlExecutionService, IConfiguration configuration)
        {
            _aiService = aiService;
            _sqlExecutionService = sqlExecutionService;
            _configuration = configuration;
        }

        // DIFY-like execution: follow edges from Start -> ... -> Output, branch at Condition
        public async Task<object> ExecuteWorkflow(Workflow workflow)
        {
            var nodesById = workflow.Nodes.ToDictionary(n => n.Id, n => n);
            var outgoing = new Dictionary<string, List<string>>();
            var inDegree = new Dictionary<string, int>();
            foreach (var n in workflow.Nodes)
            {
                outgoing[n.Id] = new List<string>();
                inDegree[n.Id] = 0;
            }
            foreach (var e in workflow.Edges)
            {
                if (!outgoing.ContainsKey(e.Source)) outgoing[e.Source] = new List<string>();
                outgoing[e.Source].Add(e.Target);
                if (inDegree.ContainsKey(e.Target)) inDegree[e.Target]++;
                else inDegree[e.Target] = 1;
            }

            // pick start node: prefer kind==start, else any with inDegree==0
            Node? startNode = workflow.Nodes.FirstOrDefault(n => GetKind(n) == "start");
            if (startNode == null)
            {
                var id0 = inDegree.FirstOrDefault(kv => kv.Value == 0).Key;
                if (id0 != null && nodesById.TryGetValue(id0, out var node0)) startNode = node0;
            }
            if (startNode == null && workflow.Nodes.Count > 0)
            {
                startNode = workflow.Nodes[0];
            }

            var context = new Dictionary<string, object>();
            var trace = new List<Dictionary<string, object?>>();
            if (!string.IsNullOrEmpty(workflow.InitialInput))
            {
                context["input"] = workflow.InitialInput!;
            }

            object? lastOutput = context.ContainsKey("input") ? context["input"] : null;
            var current = startNode;
            object? finalOutput = null;
            var guardSteps = 0;
            var maxSteps = Math.Max(1, workflow.Nodes.Count * 2); // simple guard against cycles

            while (current != null && guardSteps++ < maxSteps)
            {
                var kind = GetKind(current);
                if (!string.Equals(kind, "start", StringComparison.OrdinalIgnoreCase))
                {
                    if (lastOutput != null) context["input"] = lastOutput;
                }

                var inputSnapshot = context.ContainsKey("input") ? context["input"] : null;
                var output = await ExecuteNode(current, context);
                lastOutput = output;
                context[current.Id] = output;

                if (string.Equals(kind, "output", StringComparison.OrdinalIgnoreCase))
                {
                    context["output"] = output;
                    finalOutput = output;
                }

                trace.Add(new Dictionary<string, object?>
                {
                    ["nodeId"] = current.Id,
                    ["kind"] = kind,
                    ["input"] = inputSnapshot,
                    ["output"] = output
                });

                // decide next
                if (string.Equals(kind, "output", StringComparison.OrdinalIgnoreCase))
                {
                    break; // reached end
                }
                var outs = outgoing.TryGetValue(current.Id, out var lst) ? lst : new List<string>();
                if (outs.Count == 0)
                {
                    break; // no next
                }

                if (string.Equals(kind, "condition", StringComparison.OrdinalIgnoreCase))
                {
                    bool isTrue = false;
                    try
                    {
                        // condition node returns truthy-like
                        var eval = output;
                        if (eval is bool b) isTrue = b;
                        else if (eval is string s)
                        {
                            isTrue = bool.TryParse(s, out var parsed) ? parsed : !string.IsNullOrWhiteSpace(s);
                        }
                        else if (eval is IConvertible conv)
                        {
                            isTrue = Convert.ToDouble(conv) != 0.0;
                        }
                    }
                    catch { isTrue = false; }

                    // choose branch: first for true, second for false (if exists)
                    var nextId = isTrue ? outs[0] : (outs.Count > 1 ? outs[1] : outs[0]);
                    current = nodesById.TryGetValue(nextId, out var nn) ? nn : null;
                }
                else
                {
                    var nextId = outs[0];
                    current = nodesById.TryGetValue(nextId, out var nn) ? nn : null;
                }
            }

            if (finalOutput == null)
            {
                if (context.ContainsKey("output")) finalOutput = context["output"];
                else if (lastOutput != null) finalOutput = lastOutput;
            }

            return await Task.FromResult(new { status = "success", output = finalOutput, context, trace });
        }

        public async Task ExecuteWorkflowSse(Workflow workflow, Microsoft.AspNetCore.Http.HttpResponse response, CancellationToken ct)
        {
            static async Task WriteEvent(Microsoft.AspNetCore.Http.HttpResponse resp, string? evtName, string dataJson, CancellationToken ct)
            {
                if (!string.IsNullOrEmpty(evtName)) await resp.WriteAsync($"event: {evtName}\n", ct);
                foreach (var line in dataJson.Split('\n'))
                {
                    await resp.WriteAsync($"data: {line}\n", ct);
                }
                await resp.WriteAsync("\n", ct);
                await resp.Body.FlushAsync(ct);
            }

            var nodesById = workflow.Nodes.ToDictionary(n => n.Id, n => n);
            var outgoing = new Dictionary<string, List<string>>();
            var inDegree = new Dictionary<string, int>();
            foreach (var n in workflow.Nodes)
            {
                outgoing[n.Id] = new List<string>();
                inDegree[n.Id] = 0;
            }
            foreach (var e in workflow.Edges)
            {
                if (!outgoing.ContainsKey(e.Source)) outgoing[e.Source] = new List<string>();
                outgoing[e.Source].Add(e.Target);
                if (inDegree.ContainsKey(e.Target)) inDegree[e.Target]++;
                else inDegree[e.Target] = 1;
            }
            Node? startNode = workflow.Nodes.FirstOrDefault(n => GetKind(n) == "start");
            if (startNode == null)
            {
                var id0 = inDegree.FirstOrDefault(kv => kv.Value == 0).Key;
                if (id0 != null && nodesById.TryGetValue(id0, out var node0)) startNode = node0;
            }
            if (startNode == null && workflow.Nodes.Count > 0)
            {
                startNode = workflow.Nodes[0];
            }

            var context = new Dictionary<string, object>();
            if (!string.IsNullOrEmpty(workflow.InitialInput)) context["input"] = workflow.InitialInput!;
            object? lastOutput = context.ContainsKey("input") ? context["input"] : null;
            var current = startNode;
            object? finalOutput = null;
            var guardSteps = 0;
            var maxSteps = Math.Max(1, workflow.Nodes.Count * 2);

            await WriteEvent(response, "start", "{}", ct);

            while (current != null && guardSteps++ < maxSteps && !ct.IsCancellationRequested)
            {
                var kind = GetKind(current);
                if (!string.Equals(kind, "start", StringComparison.OrdinalIgnoreCase))
                {
                    if (lastOutput != null) context["input"] = lastOutput;
                }
                await WriteEvent(response, "trace", System.Text.Json.JsonSerializer.Serialize(new { nodeId = current.Id }), ct);

                if (string.Equals(kind, "llm", StringComparison.OrdinalIgnoreCase))
                {
                    var systemPrompt = Interpolate(current.Data.ContainsKey("systemPrompt") ? current.Data["systemPrompt"]?.ToString() : string.Empty, context);
                    var userPrompt = Interpolate(current.Data.ContainsKey("userPrompt") ? current.Data["userPrompt"]?.ToString() : string.Empty, context);
                    string? ovBaseUrl = current.Data.ContainsKey("baseUrl") ? current.Data["baseUrl"]?.ToString() : null;
                    string? ovApiKey = current.Data.ContainsKey("apiKey") ? current.Data["apiKey"]?.ToString() : null;
                    string? ovModel = current.Data.ContainsKey("model") ? current.Data["model"]?.ToString() : null;
                    var modelConfig = new ModelConfig
                    {
                        SystemPrompt = systemPrompt,
                        UserPrompt = userPrompt,
                        BaseUrl = string.IsNullOrWhiteSpace(ovBaseUrl) ? null : ovBaseUrl,
                        ApiKey = string.IsNullOrWhiteSpace(ovApiKey) ? null : ovApiKey,
                        Model = string.IsNullOrWhiteSpace(ovModel) ? null : ovModel,
                        Temperature = current.Data.ContainsKey("temperature") && double.TryParse(current.Data["temperature"]?.ToString(), out var t) ? t : (double?)null,
                    };

                    var sb = new System.Text.StringBuilder();
                    await _aiService.StreamChatAsync(modelConfig, async delta =>
                    {
                        sb.Append(delta);
                        await WriteEvent(response, null, System.Text.Json.JsonSerializer.Serialize(new { delta }), ct);
                    }, ct);
                    lastOutput = sb.ToString();
                    context[current.Id] = lastOutput!;
                }
                else
                {
                    var output = await ExecuteNode(current, context);
                    lastOutput = output;
                    context[current.Id] = output;
                }

                if (string.Equals(kind, "output", StringComparison.OrdinalIgnoreCase))
                {
                    context["output"] = lastOutput!;
                    finalOutput = lastOutput!;
                    break;
                }
                var outs = outgoing.TryGetValue(current.Id, out var lst) ? lst : new List<string>();
                if (outs.Count == 0) break;
                if (string.Equals(kind, "condition", StringComparison.OrdinalIgnoreCase))
                {
                    bool isTrue = false;
                    var eval = lastOutput;
                    if (eval is bool b) isTrue = b;
                    else if (eval is string s)
                        isTrue = bool.TryParse(s, out var parsed) ? parsed : !string.IsNullOrWhiteSpace(s);
                    else if (eval is IConvertible conv) isTrue = Convert.ToDouble(conv) != 0.0;
                    var nextId = isTrue ? outs[0] : (outs.Count > 1 ? outs[1] : outs[0]);
                    current = nodesById.TryGetValue(nextId, out var nn) ? nn : null;
                }
                else
                {
                    var nextId = outs[0];
                    current = nodesById.TryGetValue(nextId, out var nn) ? nn : null;
                }
            }

            if (finalOutput == null)
            {
                if (context.ContainsKey("output")) finalOutput = context["output"];
                else if (lastOutput != null) finalOutput = lastOutput;
            }

            await WriteEvent(response, "end", System.Text.Json.JsonSerializer.Serialize(new { output = finalOutput }), ct);
        }

        private static string GetKind(Node node)
        {
            var nodeKind = node.Type;
            if (node.Data != null && node.Data.TryGetValue("kind", out var kindObj) && kindObj != null)
            {
                nodeKind = kindObj.ToString();
            }
            return string.IsNullOrWhiteSpace(nodeKind) ? "custom" : nodeKind;
        }

        private async Task<object> ExecuteNode(Node node, Dictionary<string, object> context)
        {
            var nodeKind = GetKind(node);
            switch (nodeKind)
            {
                case "start":
                    return context.ContainsKey("input") ? context["input"] : string.Empty;
                case "output":
                    return context.ContainsKey("input") ? context["input"] : string.Empty;
                case "llm":
                    return await ExecuteLlmNode(node, context);
                case "dbQuery":
                    return await ExecuteDbQueryNode(node, context);
                case "apiCall":
                    return await ExecuteApiCallNode(node, context);
                case "condition":
                    return ExecuteConditionNode(node, context);
                default:
                    return new { error = $"Unsupported node type: {nodeKind}", nodeId = node.Id };
            }
        }

        private async Task<object> ExecuteLlmNode(Node node, Dictionary<string, object> context)
        {
            var systemPrompt = Interpolate(node.Data.ContainsKey("systemPrompt") ? node.Data["systemPrompt"]?.ToString() : string.Empty, context);
            var userPrompt = Interpolate(node.Data.ContainsKey("userPrompt") ? node.Data["userPrompt"]?.ToString() : string.Empty, context);

            // 与主界面一致：优先使用“设置中选定模型”（前端在运行前注入到节点 data），否则回退全局
            string? ovBaseUrl = node.Data.ContainsKey("baseUrl") ? node.Data["baseUrl"]?.ToString() : null;
            string? ovApiKey = node.Data.ContainsKey("apiKey") ? node.Data["apiKey"]?.ToString() : null;
            string? ovModel = node.Data.ContainsKey("model") ? node.Data["model"]?.ToString() : null;
            var modelConfig = new ModelConfig
            {
                SystemPrompt = systemPrompt,
                UserPrompt = userPrompt,
                BaseUrl = string.IsNullOrWhiteSpace(ovBaseUrl) ? null : ovBaseUrl,
                ApiKey = string.IsNullOrWhiteSpace(ovApiKey) ? null : ovApiKey,
                Model = string.IsNullOrWhiteSpace(ovModel) ? null : ovModel,
                Temperature = node.Data.ContainsKey("temperature") && double.TryParse(node.Data["temperature"]?.ToString(), out var t) ? t : (double?)null,
            };

            try
            {
                var result = await _aiService.GenerateSqlAsync(userPrompt ?? string.Empty, modelConfig, null);
                return result;
            }
            catch (Exception ex)
            {
                return new { error = ex.Message };
            }
        }

        private async Task<object> ExecuteDbQueryNode(Node node, Dictionary<string, object> context)
        {
            var sqlQuery = Interpolate(node.Data.ContainsKey("sqlQuery") ? node.Data["sqlQuery"]?.ToString() : string.Empty, context);
            var request = new SPDSQL.Server.Controllers.ExecuteRequest
            {
                SqlText = sqlQuery ?? string.Empty,
                ReadOnly = true,
                MaxRows = 1000,
                TimeoutSeconds = 30,
                UseTransaction = false
            };
            var result = await _sqlExecutionService.ExecuteAsync(request);
            return result;
        }

        private async Task<object> ExecuteApiCallNode(Node node, Dictionary<string, object> context)
        {
            using var client = new HttpClient();
            var rawUrl = node.Data.ContainsKey("url") ? node.Data["url"]?.ToString() : null;
            var url = Interpolate(rawUrl ?? string.Empty, context);
            if (string.IsNullOrWhiteSpace(url))
            {
                return new { error = "Invalid URL", nodeId = node.Id };
            }

            var rawMethod = node.Data.ContainsKey("method") ? node.Data["method"]?.ToString() : null;
            var methodName = string.IsNullOrWhiteSpace(rawMethod) ? "GET" : rawMethod!.ToUpperInvariant();
            var method = new HttpMethod(methodName);

            var request = new HttpRequestMessage(method, url);

            if (node.Data.ContainsKey("headers"))
            {
                var headersString = Interpolate(node.Data["headers"]?.ToString() ?? string.Empty, context);
                var headers = headersString.Split(new[] { "\r\n", "\n" }, StringSplitOptions.RemoveEmptyEntries);
                foreach (var header in headers)
                {
                    var parts = header.Split(new[] { ':' }, 2);
                    if (parts.Length == 2)
                    {
                        request.Headers.TryAddWithoutValidation(parts[0].Trim(), parts[1].Trim());
                    }
                }
            }

            if (node.Data.ContainsKey("body"))
            {
                var body = Interpolate(node.Data["body"]?.ToString() ?? string.Empty, context);
                if (!string.IsNullOrEmpty(body))
                {
                    request.Content = new StringContent(body, System.Text.Encoding.UTF8, "application/json");
                }
            }

            var response = await client.SendAsync(request);
            var content = await response.Content.ReadAsStringAsync();
            return new { statusCode = (int)response.StatusCode, content };
        }

        private object ExecuteConditionNode(Node node, Dictionary<string, object> context)
        {
            var expression = Interpolate(node.Data.ContainsKey("expression") ? node.Data["expression"]?.ToString() : string.Empty, context);
            var expr = new Expression(expression);
            return expr.Evaluate();
        }

        private string Interpolate(string? template, Dictionary<string, object> context)
        {
            if (string.IsNullOrEmpty(template)) return string.Empty;
            return System.Text.RegularExpressions.Regex.Replace(template, @"{{\s*(\w+)\s*}}", match =>
            {
                var key = match.Groups[1].Value;
                return context.ContainsKey(key) ? context[key]?.ToString() ?? string.Empty : match.Value;
            });
        }
    }
}
