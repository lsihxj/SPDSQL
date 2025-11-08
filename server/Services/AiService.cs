using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Options;
using Microsoft.EntityFrameworkCore;
using SPDSQL.Server.Data;
using SPDSQL.Server.Models;
using System.Collections.Generic;
using SPDSQL.Server.Controllers;

namespace SPDSQL.Server.Services;

public class OpenAIOptions
{
    public string BaseUrl { get; set; } = string.Empty;
    public string ApiKey { get; set; } = string.Empty;
    public string Model { get; set; } = "gpt-4o-mini";
}

public class AiService
{
    private readonly HttpClient _http;
    private readonly OpenAIOptions _options;
    private readonly AppDbContext _db;
    private readonly ILogger<AiService> _logger;

    public AiService(
        HttpClient httpClient, 
        IOptions<OpenAIOptions> options, 
        AppDbContext db,
        ILogger<AiService> logger)
    {
        _http = httpClient;
        _options = options.Value;
        _db = db;
        _logger = logger;
        
        if (!string.IsNullOrWhiteSpace(_options.ApiKey))
        {
            _http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", _options.ApiKey);
        }
        if (!string.IsNullOrWhiteSpace(_options.BaseUrl))
        {
            try
            {
                if (!_options.BaseUrl.Contains("${") && Uri.TryCreate(_options.BaseUrl, UriKind.Absolute, out var baseUri)
                    && (baseUri.Scheme == Uri.UriSchemeHttp || baseUri.Scheme == Uri.UriSchemeHttps))
                {
                    _http.BaseAddress = new Uri(baseUri.ToString().TrimEnd('/') + "/");
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Invalid BaseUrl in OpenAI options");
            }
        }
    }

    /// <summary>
    /// 根据用户指令生成 SQL（非流式）
    /// </summary>
    public async Task<string> GenerateSqlAsync(string userInstruction, ModelConfig? modelConfig = null, Dictionary<string, string>? variables = null, CancellationToken ct = default)
    {
        var schemaContext = await GetSchemaContextAsync(ct);

        // 变量填充：内置变量
        variables ??= new Dictionary<string, string>();
        variables["instruction"] = userInstruction;
        if (!variables.ContainsKey("schema")) variables["schema"] = schemaContext;

        // 开发环境降级：当未配置且未提供模型配置时，返回示例 SQL
        var hasGlobalCreds = !string.IsNullOrWhiteSpace(_options.BaseUrl) && !string.IsNullOrWhiteSpace(_options.ApiKey);
        var hasReqCreds = !string.IsNullOrWhiteSpace(modelConfig?.BaseUrl) && !string.IsNullOrWhiteSpace(modelConfig?.ApiKey);
        if (!hasGlobalCreds && !hasReqCreds)
        {
            throw new InvalidOperationException("缺少AI凭据：请在设置中配置 BaseUrl 与 API Key，或在节点中覆盖。");
        }
        
        var systemPrompt = string.IsNullOrWhiteSpace(modelConfig?.SystemPrompt)
            ? "You are a professional PostgreSQL SQL generator. Generate SQL based on user requirements and database schema. Return ONLY executable SQL code without any explanation or markdown formatting."
            : modelConfig!.SystemPrompt!;
        
        var userPromptTemplate = string.IsNullOrWhiteSpace(modelConfig?.UserPrompt)
            ? "Database Schema:\n{{schema}}\n\nUser Requirement:\n{{instruction}}\n\nConstraints:\n- Target Database: PostgreSQL\n- Output Format: Pure SQL only (no markdown, no explanation)\n- Prefer SELECT queries unless user explicitly requests data modification\n- Use LIMIT clause for large result sets\n- Follow PostgreSQL best practices"
            : modelConfig!.UserPrompt!;
        
        // 变量替换
        string userPrompt = userPromptTemplate;
        foreach (var kv in variables)
        {
            userPrompt = userPrompt.Replace("{{" + kv.Key + "}}", kv.Value ?? string.Empty);
        }
        
        var callOptions = new OpenAIOptions
        {
            BaseUrl = !string.IsNullOrWhiteSpace(modelConfig?.BaseUrl) ? modelConfig!.BaseUrl! : _options.BaseUrl,
            ApiKey = !string.IsNullOrWhiteSpace(modelConfig?.ApiKey) ? modelConfig!.ApiKey! : _options.ApiKey,
            Model = !string.IsNullOrWhiteSpace(modelConfig?.Model) ? modelConfig!.Model! : _options.Model,
        };
        var temperature = modelConfig?.Temperature ?? 0.2;
        
        var result = await CallChatAsync(systemPrompt, userPrompt, callOptions, temperature, ct);
        return CleanSqlResponse(result);
    }

    /// <summary>
    /// 诊断 SQL 错误并返回修正建议
    /// </summary>
    public async Task<string> DiagnoseSqlAsync(string sql, string error, ModelConfig? modelConfig = null, Dictionary<string, string>? variables = null, CancellationToken ct = default)
    {
        var schemaContext = await GetSchemaContextAsync(ct);

        // 变量填充：内置变量（诊断场景）
        variables ??= new Dictionary<string, string>();
        if (!variables.ContainsKey("sqlText")) variables["sqlText"] = sql;
        if (!variables.ContainsKey("error")) variables["error"] = error;
        if (!variables.ContainsKey("schema")) variables["schema"] = schemaContext;

        // 默认诊断提示词（与生成SQL不同）
        var defaultSystemPrompt = "You are a PostgreSQL SQL diagnostics expert. Analyze SQL errors and provide corrected SQL. Return ONLY the corrected SQL code.";
        var defaultUserPrompt = "Database Schema:\n{{schema}}\n\nOriginal SQL:\n{{sqlText}}\n\nError Message:\n{{error}}\n\nTask:\n- Analyze the root cause concisely\n- Add a brief comment (-- ...) explaining the fix\n- Provide the corrected SQL only";

        var systemPrompt = string.IsNullOrWhiteSpace(modelConfig?.SystemPrompt)
            ? defaultSystemPrompt
            : modelConfig!.SystemPrompt!;
        var userPromptTemplate = string.IsNullOrWhiteSpace(modelConfig?.UserPrompt)
            ? defaultUserPrompt
            : modelConfig!.UserPrompt!;

        // 变量替换
        string userPrompt = userPromptTemplate;
        foreach (var kv in variables)
        {
            userPrompt = userPrompt.Replace("{{" + kv.Key + "}}", kv.Value ?? string.Empty);
        }

        var callOptions = new OpenAIOptions
        {
            BaseUrl = !string.IsNullOrWhiteSpace(modelConfig?.BaseUrl) ? modelConfig!.BaseUrl! : _options.BaseUrl,
            ApiKey = !string.IsNullOrWhiteSpace(modelConfig?.ApiKey) ? modelConfig!.ApiKey! : _options.ApiKey,
            Model = !string.IsNullOrWhiteSpace(modelConfig?.Model) ? modelConfig!.Model! : _options.Model,
        };
        var temperature = modelConfig?.Temperature ?? 0.2;

        var result = await CallChatAsync(systemPrompt, userPrompt, callOptions, temperature, ct);
        return CleanSqlResponse(result);
    }

    /// <summary>
    /// 获取数据库 Schema 上下文
    /// </summary>
    private async Task<string> GetSchemaContextAsync(CancellationToken ct)
    {
        var schemaDocs = await _db.SchemaDocs
            .OrderBy(s => s.TableName)
            .ToListAsync(ct);
        
        if (schemaDocs.Count == 0)
        {
            return "No schema documentation available. " +
                   "You may need to query information_schema or use generic PostgreSQL syntax.";
        }
        
        var sb = new StringBuilder();
        foreach (var doc in schemaDocs)
        {
            sb.AppendLine($"Table: {doc.SchemaName}.{doc.TableName}");
            sb.AppendLine(doc.Document);
            sb.AppendLine();
        }
        
        return sb.ToString();
    }

    /// <summary>
    /// AI 优化：语法检查与性能建议，返回结构化结果
    /// </summary>
    public async Task<(List<SyntaxErrorItem> SyntaxErrors, List<string> PerformanceSuggestions, string? OptimizedSql)> OptimizeSqlAsync(
        string sql,
        ModelConfig? modelConfig = null,
        Dictionary<string, string>? variables = null,
        CancellationToken ct = default)
    {
        var schemaContext = await GetSchemaContextAsync(ct);
        variables ??= new Dictionary<string, string>();
        if (!variables.ContainsKey("sqlText")) variables["sqlText"] = sql;
        if (!variables.ContainsKey("schema")) variables["schema"] = schemaContext;

        // 无凭据开发模式：简单返回空语法错误与示例性能建议
        var hasGlobalCreds = !string.IsNullOrWhiteSpace(_options.BaseUrl) && !string.IsNullOrWhiteSpace(_options.ApiKey);
        var hasReqCreds = !string.IsNullOrWhiteSpace(modelConfig?.BaseUrl) && !string.IsNullOrWhiteSpace(modelConfig?.ApiKey);
        if (!hasGlobalCreds && !hasReqCreds)
        {
            var demoPerf = new List<string>();
            if (sql.Contains("SELECT", StringComparison.OrdinalIgnoreCase) && !sql.Contains("LIMIT", StringComparison.OrdinalIgnoreCase))
            {
                demoPerf.Add("建议为大结果集添加 LIMIT，避免全表返回");
            }
            return (new List<SyntaxErrorItem>(), demoPerf, null);
        }

        var systemPrompt = string.IsNullOrWhiteSpace(modelConfig?.SystemPrompt)
            ? "You are a senior PostgreSQL performance engineer and SQL linter. Analyze input SQL strictly. Return a compact JSON with: syntaxErrors (array of {line,message}), performance (array of strings), optimizedSql (string or null)."
            : modelConfig!.SystemPrompt!;

        var userPromptTemplate = string.IsNullOrWhiteSpace(modelConfig?.UserPrompt)
            ? "Database Schema:\n{{schema}}\n\nInput SQL:\n{{sqlText}}\n\nTasks:\n1) List syntax errors with approximate line numbers if possible.\n2) Provide actionable performance suggestions (indexes, rewrite, LIMIT, JOIN order, WHERE predicates, avoid SELECT *).\n3) If safe, provide optimized SQL.\n\nOutput strictly in JSON with keys: syntaxErrors, performance, optimizedSql."
            : modelConfig!.UserPrompt!;

        string userPrompt = userPromptTemplate;
        foreach (var kv in variables)
            userPrompt = userPrompt.Replace("{{" + kv.Key + "}}", kv.Value ?? string.Empty);

        var callOptions = new OpenAIOptions
        {
            BaseUrl = !string.IsNullOrWhiteSpace(modelConfig?.BaseUrl) ? modelConfig!.BaseUrl! : _options.BaseUrl,
            ApiKey = !string.IsNullOrWhiteSpace(modelConfig?.ApiKey) ? modelConfig!.ApiKey! : _options.ApiKey,
            Model = !string.IsNullOrWhiteSpace(modelConfig?.Model) ? modelConfig!.Model! : _options.Model,
        };
        var temperature = modelConfig?.Temperature ?? 0.1;

        var jsonText = await CallChatAsync(systemPrompt, userPrompt, callOptions, temperature, ct);
        // 容错：如果模型外包了 ```json，先清理
        jsonText = CleanSqlResponse(jsonText);
        var syntaxErrors = new List<SyntaxErrorItem>();
        var performance = new List<string>();
        string? optimizedSql = null;
        try
        {
            using var doc = JsonDocument.Parse(jsonText);
            if (doc.RootElement.TryGetProperty("syntaxErrors", out var se) && se.ValueKind == JsonValueKind.Array)
            {
                foreach (var item in se.EnumerateArray())
                {
                    var line = item.TryGetProperty("line", out var l) && l.ValueKind == JsonValueKind.Number ? l.GetInt32() : (int?)null;
                    var msg = item.TryGetProperty("message", out var m) ? m.GetString() ?? string.Empty : string.Empty;
                    syntaxErrors.Add(new SyntaxErrorItem { Line = line, Message = msg });
                }
            }
            if (doc.RootElement.TryGetProperty("performance", out var pf) && pf.ValueKind == JsonValueKind.Array)
            {
                foreach (var s in pf.EnumerateArray())
                {
                    performance.Add(s.GetString() ?? string.Empty);
                }
            }
            if (doc.RootElement.TryGetProperty("optimizedSql", out var os))
            {
                optimizedSql = os.GetString();
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "OptimizeSqlAsync: Failed to parse JSON, returning raw text as suggestion");
            performance.Add(jsonText);
        }
        return (syntaxErrors, performance, optimizedSql);
    }

    /// <summary>
    /// 生成 SQL（流式）：构造与 GenerateSqlAsync 相同的提示词并进行流式回调
    /// </summary>
    public async Task StreamGenerateSqlAsync(
        string userInstruction,
        ModelConfig? modelConfig,
        Dictionary<string, string>? variables,
        Func<string, Task> onDelta,
        CancellationToken ct)
    {
        var schemaContext = await GetSchemaContextAsync(ct);
        variables ??= new Dictionary<string, string>();
        variables["instruction"] = userInstruction;
        if (!variables.ContainsKey("schema")) variables["schema"] = schemaContext;

        var hasGlobalCreds = !string.IsNullOrWhiteSpace(_options.BaseUrl) && !string.IsNullOrWhiteSpace(_options.ApiKey);
        var hasReqCreds = !string.IsNullOrWhiteSpace(modelConfig?.BaseUrl) && !string.IsNullOrWhiteSpace(modelConfig?.ApiKey);
        if (!hasGlobalCreds && !hasReqCreds)
        {
            throw new InvalidOperationException("缺少AI凭据：请在设置中配置 BaseUrl 与 API Key，或在节点中覆盖。");
        }

        var systemPrompt = string.IsNullOrWhiteSpace(modelConfig?.SystemPrompt)
            ? "You are a professional PostgreSQL SQL generator. Generate SQL based on user requirements and database schema. Return ONLY executable SQL code without any explanation or markdown formatting."
            : modelConfig!.SystemPrompt!;
        var userPromptTemplate = string.IsNullOrWhiteSpace(modelConfig?.UserPrompt)
            ? "Database Schema:\n{{schema}}\n\nUser Requirement:\n{{instruction}}\n\nConstraints:\n- Target Database: PostgreSQL\n- Output Format: Pure SQL only (no markdown, no explanation)\n- Prefer SELECT queries unless user explicitly requests data modification\n- Use LIMIT clause for large result sets\n- Follow PostgreSQL best practices"
            : modelConfig!.UserPrompt!;
        string userPrompt = userPromptTemplate;
        foreach (var kv in variables)
            userPrompt = userPrompt.Replace("{{" + kv.Key + "}}", kv.Value ?? string.Empty);

        var cfg = new ModelConfig
        {
            BaseUrl = !string.IsNullOrWhiteSpace(modelConfig?.BaseUrl) ? modelConfig!.BaseUrl! : _options.BaseUrl,
            ApiKey = !string.IsNullOrWhiteSpace(modelConfig?.ApiKey) ? modelConfig!.ApiKey! : _options.ApiKey,
            Model = !string.IsNullOrWhiteSpace(modelConfig?.Model) ? modelConfig!.Model! : _options.Model,
            Temperature = modelConfig?.Temperature ?? 0.2,
            SystemPrompt = systemPrompt,
            UserPrompt = userPrompt
        };

        await StreamChatAsync(cfg, onDelta, ct);
    }

    /// <summary>
    /// 调用大模型 API（支持每次调用覆盖 BaseUrl/API Key/Model/Temperature）
    /// </summary>
    private async Task<string> CallChatAsync(string systemPrompt, string userPrompt, OpenAIOptions callOptions, double temperature, CancellationToken ct)
    {
        var payload = new
        {
            model = callOptions.Model,
            messages = new object[]
            {
                new { role = "system", content = systemPrompt },
                new { role = "user", content = userPrompt }
            },
            temperature = temperature
        };
        
        var json = JsonSerializer.Serialize(payload);
        var content = new StringContent(json, Encoding.UTF8, "application/json");
        
        // 构造请求，支持按需覆盖 BaseUrl 与 ApiKey（兼容 OpenAI 官方与 Azure OpenAI 等）
        string FirstNonEmpty(params string?[] values) => values.FirstOrDefault(v => !string.IsNullOrWhiteSpace(v)) ?? string.Empty;
        var baseCandidate = FirstNonEmpty(callOptions.BaseUrl, _options.BaseUrl, _http.BaseAddress?.ToString());
        var raw = (baseCandidate ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(raw))
        {
            throw new InvalidOperationException("AI 基础地址(BaseUrl)未配置");
        }
        if (raw.Contains("${"))
        {
            throw new InvalidOperationException("AI 基础地址(BaseUrl)包含占位符，未被正确配置");
        }
        if (!Uri.TryCreate(raw, UriKind.Absolute, out var baseUri))
        {
            // 尝试自动补全 https://
            var guess = "https://" + raw.TrimStart('/');
            if (!Uri.TryCreate(guess, UriKind.Absolute, out baseUri))
            {
                throw new InvalidOperationException($"AI 基础地址无效: {raw}");
            }
        }
        var baseUrl = baseUri.ToString().TrimEnd('/') + "/";
        string path;
        if (baseUrl.Contains("openai.azure.com", StringComparison.OrdinalIgnoreCase))
        {
            // Azure OpenAI: https://{resource}.openai.azure.com/openai/deployments/{deployment}/chat/completions?api-version=...
            var apiVersion = Environment.GetEnvironmentVariable("AZURE_OPENAI_API_VERSION") ?? "2024-07-18-preview";
            var deployment = callOptions.Model; // 这里将 Model 视为 deployment 名称
            path = $"openai/deployments/{deployment}/chat/completions?api-version={apiVersion}";
        }
        else if (baseUrl.EndsWith("/v1/", StringComparison.OrdinalIgnoreCase) || baseUrl.EndsWith("/v1", StringComparison.OrdinalIgnoreCase))
        {
            // 如果 BaseUrl 已经包含 /v1，则不要再重复添加 /v1
            path = "chat/completions";
        }
        else
        {
            // OpenAI 兼容标准：{base}/v1/chat/completions
            path = "v1/chat/completions";
        }
        var request = new HttpRequestMessage(HttpMethod.Post, new Uri(new Uri(baseUrl), path))
        {
            Content = content
        };
        var token = FirstNonEmpty(callOptions.ApiKey, _options.ApiKey);
        if (string.IsNullOrWhiteSpace(token))
        {
            throw new InvalidOperationException("AI 凭据(ApiKey)未配置");
        }
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        
        var resp = await _http.SendAsync(request, ct);
        resp.EnsureSuccessStatusCode();
        
        using var stream = await resp.Content.ReadAsStreamAsync(ct);
        using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: ct);
        
        var result = doc.RootElement
            .GetProperty("choices")[0]
            .GetProperty("message")
            .GetProperty("content")
            .GetString();
        
        return result ?? string.Empty;
    }

    public async Task StreamChatAsync(ModelConfig modelConfig, Func<string, Task> onDelta, CancellationToken ct)
    {
        // 构造 prompts 与调用参数（与 CallChatAsync 对齐）
        var systemPrompt = string.IsNullOrWhiteSpace(modelConfig.SystemPrompt)
            ? "You are a professional assistant."
            : modelConfig.SystemPrompt!;
        var userPrompt = modelConfig.UserPrompt ?? string.Empty;
        var callOptions = new OpenAIOptions
        {
            BaseUrl = !string.IsNullOrWhiteSpace(modelConfig.BaseUrl) ? modelConfig.BaseUrl! : _options.BaseUrl,
            ApiKey = !string.IsNullOrWhiteSpace(modelConfig.ApiKey) ? modelConfig.ApiKey! : _options.ApiKey,
            Model = !string.IsNullOrWhiteSpace(modelConfig.Model) ? modelConfig.Model! : _options.Model,
        };
        var temperature = modelConfig.Temperature ?? 0.2;

        string FirstNonEmpty(params string?[] values) => values.FirstOrDefault(v => !string.IsNullOrWhiteSpace(v)) ?? string.Empty;
        var baseCandidate = FirstNonEmpty(callOptions.BaseUrl, _options.BaseUrl, _http.BaseAddress?.ToString());
        var raw = (baseCandidate ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(raw)) throw new InvalidOperationException("AI 基础地址(BaseUrl)未配置");
        if (raw.Contains("${")) throw new InvalidOperationException("AI 基础地址(BaseUrl)包含占位符，未被正确配置");
        if (!Uri.TryCreate(raw, UriKind.Absolute, out var baseUri))
        {
            var guess = "https://" + raw.TrimStart('/');
            if (!Uri.TryCreate(guess, UriKind.Absolute, out baseUri)) throw new InvalidOperationException($"AI 基础地址无效: {raw}");
        }
        var baseUrl = baseUri.ToString().TrimEnd('/') + "/";
        string path;
        if (baseUrl.Contains("openai.azure.com", StringComparison.OrdinalIgnoreCase))
        {
            var apiVersion = Environment.GetEnvironmentVariable("AZURE_OPENAI_API_VERSION") ?? "2024-07-18-preview";
            var deployment = callOptions.Model;
            path = $"openai/deployments/{deployment}/chat/completions?api-version={apiVersion}";
        }
        else if (baseUrl.EndsWith("/v1/", StringComparison.OrdinalIgnoreCase) || baseUrl.EndsWith("/v1", StringComparison.OrdinalIgnoreCase))
        {
            path = "chat/completions";
        }
        else
        {
            path = "v1/chat/completions";
        }

        var payload = new
        {
            model = callOptions.Model,
            messages = new object[]
            {
                new { role = "system", content = systemPrompt },
                new { role = "user", content = userPrompt }
            },
            temperature = temperature,
            stream = true
        };
        var json = System.Text.Json.JsonSerializer.Serialize(payload);
        var request = new HttpRequestMessage(HttpMethod.Post, new Uri(new Uri(baseUrl), path))
        {
            Content = new StringContent(json, Encoding.UTF8, "application/json")
        };
        var token = FirstNonEmpty(callOptions.ApiKey, _options.ApiKey);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

        using var resp = await _http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, ct);
        resp.EnsureSuccessStatusCode();
        using var stream = await resp.Content.ReadAsStreamAsync(ct);
        using var reader = new StreamReader(stream, Encoding.UTF8);
        string? line;
        while (!reader.EndOfStream && (line = await reader.ReadLineAsync()) != null)
        {
            ct.ThrowIfCancellationRequested();
            if (string.IsNullOrEmpty(line)) continue;
            if (!line.StartsWith("data:")) continue;
            var data = line.Substring(5).Trim();
            if (data == "[DONE]") break;
            try
            {
                using var doc = JsonDocument.Parse(data);
                var choice = doc.RootElement.GetProperty("choices")[0];
                if (choice.TryGetProperty("delta", out var delta) && delta.TryGetProperty("content", out var contentEl))
                {
                    var deltaText = contentEl.GetString();
                    if (!string.IsNullOrEmpty(deltaText)) await onDelta(deltaText!);
                }
                else if (choice.TryGetProperty("message", out var msg) && msg.TryGetProperty("content", out var whole))
                {
                    var txt = whole.GetString();
                    if (!string.IsNullOrEmpty(txt)) await onDelta(txt!);
                }
            }
            catch { /* 忽略单行解析错误 */ }
        }
    }

    /// <summary>
    /// 清理 AI 返回的 SQL，移除 markdown 格式
    /// </summary>
    private string CleanSqlResponse(string response)
    {
        if (string.IsNullOrWhiteSpace(response))
            return string.Empty;
        
        // 移除 markdown 代码块
        var cleaned = response.Trim();
        if (cleaned.StartsWith("```sql"))
        {
            cleaned = cleaned.Substring(6);
        }
        else if (cleaned.StartsWith("```"))
        {
            cleaned = cleaned.Substring(3);
        }
        
        if (cleaned.EndsWith("```"))
        {
            cleaned = cleaned.Substring(0, cleaned.Length - 3);
        }
        
        return cleaned.Trim();
    }
}