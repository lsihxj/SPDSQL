using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SPDSQL.Server.Services;
using System.Collections.Generic;

namespace SPDSQL.Server.Controllers;

[ApiController]
[Route("api/sql")] 
[Authorize]
public class SqlOptimizeController : ControllerBase
{
    private readonly AiService _aiService;
    private readonly ILogger<SqlOptimizeController> _logger;

    public SqlOptimizeController(AiService aiService, ILogger<SqlOptimizeController> logger)
    {
        _aiService = aiService;
        _logger = logger;
    }

    /// <summary>
    /// AI 对 SQL 进行语法与性能检查并给出优化建议
    /// </summary>
    [HttpPost("optimize")]
    public async Task<IActionResult> Optimize([FromBody] OptimizeRequest request, CancellationToken ct)
    {
        try
        {
            var result = await _aiService.OptimizeSqlAsync(request.Sql, request.ModelConfig, request.Variables, ct);
            return Ok(new OptimizeResponse
            {
                SyntaxErrors = result.SyntaxErrors,
                PerformanceSuggestions = result.PerformanceSuggestions,
                OptimizedSql = result.OptimizedSql
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "SQL optimize failed");
            return BadRequest(new { error = ex.Message });
        }
    }
}

public class OptimizeRequest
{
    public string Sql { get; set; } = string.Empty;
    public ModelConfig? ModelConfig { get; set; }
    public Dictionary<string, string>? Variables { get; set; }
}

public class OptimizeResponse
{
    public List<SyntaxErrorItem> SyntaxErrors { get; set; } = new();
    public List<string> PerformanceSuggestions { get; set; } = new();
    public string? OptimizedSql { get; set; }
}

public class SyntaxErrorItem
{
    public int? Line { get; set; }
    public string Message { get; set; } = string.Empty;
}
