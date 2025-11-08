using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SPDSQL.Server.Services;
using System.Collections.Generic;

namespace SPDSQL.Server.Controllers;

/// <summary>
/// SQL 执行控制器
/// </summary>
[ApiController]
[Route("api/sql")]
[Authorize]
public class SqlController : ControllerBase
{
    private readonly SqlExecutionService _sqlExecService;
    private readonly AiService _aiService;
    private readonly ILogger<SqlController> _logger;

    public SqlController(
        SqlExecutionService sqlExecService,
        AiService aiService,
        ILogger<SqlController> logger)
    {
        _sqlExecService = sqlExecService;
        _aiService = aiService;
        _logger = logger;
    }

    /// <summary>
    /// 执行 SQL 语句
    /// </summary>
    [HttpPost("execute")]
    public async Task<IActionResult> Execute([FromBody] ExecuteRequest request)
    {
        try
        {
            // 使用多查询执行，支持单条和多条SQL
            var result = await _sqlExecService.ExecuteMultipleAsync(request);
            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "SQL execution failed");
            return Ok(new MultiExecuteResponse
            {
                Success = false,
                Results = new List<QueryResult>
                {
                    new QueryResult
                    {
                        Index = 1,
                        Success = false,
                        Error = ex.Message,
                        Sql = request.SqlText
                    }
                }
            });
        }
    }

    /// <summary>
    /// AI 生成 SQL
    /// </summary>
    [HttpPost("generate")]
    public async Task<IActionResult> Generate([FromBody] GenerateRequest request)
    {
        try
        {
            var accept = Request.Headers["Accept"].ToString().ToLowerInvariant();
            var wantsSse = accept.Contains("text/event-stream");
            if (!wantsSse)
            {
                var sql = await _aiService.GenerateSqlAsync(
                    request.Instruction,
                    request.ModelConfig,
                    request.Variables,
                    HttpContext.RequestAborted
                );
                return Ok(new GenerateResponse { Sql = sql });
            }

            Response.Headers["Cache-Control"] = "no-cache";
            Response.Headers["X-Accel-Buffering"] = "no";
            Response.Headers["Connection"] = "keep-alive";
            Response.ContentType = "text/event-stream";

            string Clean(string s)
            {
                if (string.IsNullOrWhiteSpace(s)) return string.Empty;
                var cleaned = s.Trim();
                if (cleaned.StartsWith("```sql")) cleaned = cleaned.Substring(6);
                else if (cleaned.StartsWith("```")) cleaned = cleaned.Substring(3);
                if (cleaned.EndsWith("```")) cleaned = cleaned.Substring(0, cleaned.Length - 3);
                return cleaned.Trim();
            }

            async Task WriteEventAsync(string evt, string data, CancellationToken ct)
            {
                await Response.WriteAsync($"event: {evt}\n", ct);
                await Response.WriteAsync($"data: {data}\n\n", ct);
                await Response.Body.FlushAsync(ct);
            }

            var sb = new System.Text.StringBuilder();
            await _aiService.StreamGenerateSqlAsync(
                request.Instruction,
                request.ModelConfig,
                request.Variables,
                async delta =>
                {
                    sb.Append(delta);
                    var payload = System.Text.Json.JsonSerializer.Serialize(new { delta });
                    await WriteEventAsync("delta", payload, HttpContext.RequestAborted);
                },
                HttpContext.RequestAborted
            );

            var finalText = Clean(sb.ToString());
            var endPayload = System.Text.Json.JsonSerializer.Serialize(new { done = true, sql = finalText });
            await WriteEventAsync("end", endPayload, HttpContext.RequestAborted);
            return new EmptyResult();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "SQL generation failed");
            // SSE 错误也以 JSON 错误返回（非 SSE 情况）
            if (!Response.HasStarted)
            {
                return BadRequest(new { error = ex.Message });
            }
            return new EmptyResult();
        }
    }

    /// <summary>
    /// 诊断 SQL 错误并返回修正建议
    /// </summary>
    [HttpPost("diagnose")]
    public async Task<IActionResult> Diagnose([FromBody] DiagnoseRequest request)
    {
        try
        {
            var suggestion = await _aiService.DiagnoseSqlAsync(request.Sql, request.Error, request.ModelConfig, request.Variables);
            return Ok(new DiagnoseResponse { Suggestion = suggestion });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "SQL diagnosis failed");
            return BadRequest(new { error = ex.Message });
        }
    }
}

/// <summary>
/// 执行请求
/// </summary>
public class ExecuteRequest
{
    public string SqlText { get; set; } = string.Empty;
    public bool RunSelectedOnly { get; set; }
    public string? SelectedText { get; set; }
    public bool ReadOnly { get; set; } = true;
    public int MaxRows { get; set; } = 1000;
    public int TimeoutSeconds { get; set; } = 30;
    public bool UseTransaction { get; set; } = false;
}

/// <summary>
/// 执行响应（旧格式，保持向后兼容）
/// </summary>
public class ExecuteResponse
{
    public bool Success { get; set; }
    public List<Dictionary<string, object>>? Rows { get; set; }
    public int? AffectedRows { get; set; }
    public string? Duration { get; set; }
    public string? Error { get; set; }
}

/// <summary>
/// 多查询执行响应
/// </summary>
public class MultiExecuteResponse
{
    public bool Success { get; set; }
    public List<QueryResult> Results { get; set; } = new();
    public string? TotalDuration { get; set; }
}

/// <summary>
/// 单个查询结果
/// </summary>
public class QueryResult
{
    public string Sql { get; set; } = string.Empty;
    public bool Success { get; set; }
    public List<Dictionary<string, object>>? Rows { get; set; }
    public int? AffectedRows { get; set; }
    public string? Duration { get; set; }
    public string? Error { get; set; }
    public int Index { get; set; }
}

/// <summary>
/// 生成请求
/// </summary>
public class GenerateRequest
{
    public string Instruction { get; set; } = string.Empty;
    public ModelConfig? ModelConfig { get; set; }
    public Dictionary<string, string>? Variables { get; set; }
}

public class ModelConfig
{
    public string? BaseUrl { get; set; }
    public string? ApiKey { get; set; }
    public string? Model { get; set; }
    public double? Temperature { get; set; }
    public string? SystemPrompt { get; set; }
    public string? UserPrompt { get; set; }
}

/// <summary>
/// 生成响应
/// </summary>
public class GenerateResponse
{
    public string Sql { get; set; } = string.Empty;
}

/// <summary>
/// 诊断请求
/// </summary>
public class DiagnoseRequest
{
    public string Sql { get; set; } = string.Empty;
    public string Error { get; set; } = string.Empty;
    // 单独的诊断模型配置，与生成SQL的模型独立
    public ModelConfig? ModelConfig { get; set; }
    // 可选变量（如 schema、选中文本等），用于渲染诊断提示词模板
    public Dictionary<string, string>? Variables { get; set; }
}

/// <summary>
/// 诊断响应
/// </summary>
public class DiagnoseResponse
{
    public string Suggestion { get; set; } = string.Empty;
}
