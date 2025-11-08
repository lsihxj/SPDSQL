using System.Data;
using Microsoft.Extensions.Options;
using Npgsql;
using SPDSQL.Server.Controllers;

namespace SPDSQL.Server.Services;

public class SqlExecutionService
{
    private readonly string _connectionString;
    private readonly ILogger<SqlExecutionService> _logger;

    public SqlExecutionService(IConfiguration configuration, ILogger<SqlExecutionService> logger)
    {
        _connectionString = configuration.GetConnectionString("DefaultConnection")!;
        _logger = logger;
    }

    public async Task<ExecuteResponse> ExecuteAsync(ExecuteRequest request, CancellationToken ct = default)
    {
        var stopwatch = System.Diagnostics.Stopwatch.StartNew();
        try
        {
            // 选择要执行的 SQL
            var sql = request.RunSelectedOnly && !string.IsNullOrWhiteSpace(request.SelectedText)
                ? request.SelectedText!.Trim()
                : request.SqlText.Trim();

            // 只读模式验证
            if (request.ReadOnly && !ValidateSql(sql, true))
            {
                return new ExecuteResponse
                {
                    Success = false,
                    Error = "只读模式下禁止执行修改数据的操作（INSERT/UPDATE/DELETE/DROP/TRUNCATE/ALTER）"
                };
            }

            using var conn = new NpgsqlConnection(_connectionString);
            await conn.OpenAsync(ct);

            using var cmd = new NpgsqlCommand(sql, conn)
            {
                CommandTimeout = request.TimeoutSeconds
            };

            if (request.UseTransaction)
            {
                await using var tx = await conn.BeginTransactionAsync(ct);
                cmd.Transaction = tx;
                var result = await ExecuteCommandAsync(cmd, request, ct);
                if (result.Success)
                {
                    await tx.CommitAsync(ct);
                }
                else
                {
                    await tx.RollbackAsync(ct);
                }
                stopwatch.Stop();
                result.Duration = $"{stopwatch.ElapsedMilliseconds}ms";
                return result;
            }
            else
            {
                var result = await ExecuteCommandAsync(cmd, request, ct);
                stopwatch.Stop();
                result.Duration = $"{stopwatch.ElapsedMilliseconds}ms";
                return result;
            }
        }
        catch (Exception ex)
        {
            stopwatch.Stop();
            _logger.LogError(ex, "SQL execution error");
            return new ExecuteResponse
            {
                Success = false,
                Error = ex.Message,
                Duration = $"{stopwatch.ElapsedMilliseconds}ms"
            };
        }
    }

    /// <summary>
    /// 执行多条SQL语句，返回每条语句的执行结果
    /// </summary>
    public async Task<MultiExecuteResponse> ExecuteMultipleAsync(ExecuteRequest request, CancellationToken ct = default)
    {
        var totalStopwatch = System.Diagnostics.Stopwatch.StartNew();
        var response = new MultiExecuteResponse();
        
        try
        {
            // 选择要执行的 SQL
            var sqlText = request.RunSelectedOnly && !string.IsNullOrWhiteSpace(request.SelectedText)
                ? request.SelectedText!.Trim()
                : request.SqlText.Trim();

            // 解析SQL语句
            var statements = SqlParser.ParseStatements(sqlText);
            
            if (statements.Count == 0)
            {
                response.Success = false;
                response.Results.Add(new QueryResult
                {
                    Index = 1,
                    Success = false,
                    Error = "未检测到有效的SQL语句",
                    Sql = sqlText
                });
                totalStopwatch.Stop();
                response.TotalDuration = $"{totalStopwatch.ElapsedMilliseconds}ms";
                return response;
            }

            // 只读模式验证
            if (request.ReadOnly)
            {
                foreach (var stmt in statements)
                {
                    if (!ValidateSql(stmt, true))
                    {
                        response.Success = false;
                        response.Results.Add(new QueryResult
                        {
                            Index = 1,
                            Success = false,
                            Error = "只读模式下禁止执行修改数据的操作（INSERT/UPDATE/DELETE/DROP/TRUNCATE/ALTER）",
                            Sql = stmt
                        });
                        totalStopwatch.Stop();
                        response.TotalDuration = $"{totalStopwatch.ElapsedMilliseconds}ms";
                        return response;
                    }
                }
            }

            using var conn = new NpgsqlConnection(_connectionString);
            await conn.OpenAsync(ct);

            if (request.UseTransaction)
            {
                // 事务模式：所有语句在同一事务中执行
                await using var tx = await conn.BeginTransactionAsync(ct);
                bool allSuccess = true;

                for (int i = 0; i < statements.Count; i++)
                {
                    var stmt = statements[i];
                    var result = await ExecuteSingleStatementAsync(conn, stmt, request, i + 1, tx, ct);
                    response.Results.Add(result);

                    if (!result.Success)
                    {
                        allSuccess = false;
                        break; // 事务模式下遇到错误立即停止
                    }
                }

                if (allSuccess)
                {
                    await tx.CommitAsync(ct);
                    response.Success = true;
                }
                else
                {
                    await tx.RollbackAsync(ct);
                    response.Success = false;
                }
            }
            else
            {
                // 非事务模式：每条语句独立执行
                bool anySuccess = false;
                bool anyFailure = false;

                for (int i = 0; i < statements.Count; i++)
                {
                    var stmt = statements[i];
                    var result = await ExecuteSingleStatementAsync(conn, stmt, request, i + 1, null, ct);
                    response.Results.Add(result);

                    if (result.Success)
                        anySuccess = true;
                    else
                        anyFailure = true;
                }

                // 至少有一条成功就算部分成功
                response.Success = anySuccess && !anyFailure;
                if (!anySuccess)
                    response.Success = false;
            }

            totalStopwatch.Stop();
            response.TotalDuration = $"{totalStopwatch.ElapsedMilliseconds}ms";
            return response;
        }
        catch (Exception ex)
        {
            totalStopwatch.Stop();
            _logger.LogError(ex, "Multiple SQL execution error");
            response.Success = false;
            response.Results.Add(new QueryResult
            {
                Index = 1,
                Success = false,
                Error = ex.Message,
                Sql = request.SqlText
            });
            response.TotalDuration = $"{totalStopwatch.ElapsedMilliseconds}ms";
            return response;
        }
    }

    /// <summary>
    /// 执行单条SQL语句
    /// </summary>
    private async Task<QueryResult> ExecuteSingleStatementAsync(
        NpgsqlConnection conn, 
        string sql, 
        ExecuteRequest request, 
        int index,
        NpgsqlTransaction? transaction,
        CancellationToken ct)
    {
        var stopwatch = System.Diagnostics.Stopwatch.StartNew();
        var result = new QueryResult
        {
            Index = index,
            Sql = sql.Length > 100 ? sql.Substring(0, 100) + "..." : sql
        };

        try
        {
            using var cmd = new NpgsqlCommand(sql, conn)
            {
                CommandTimeout = request.TimeoutSeconds,
                Transaction = transaction
            };

            var executeResult = await ExecuteCommandAsync(cmd, request, ct);
            result.Success = executeResult.Success;
            result.Rows = executeResult.Rows;
            result.AffectedRows = executeResult.AffectedRows;
            result.Error = executeResult.Error;
            
            stopwatch.Stop();
            result.Duration = $"{stopwatch.ElapsedMilliseconds}ms";
        }
        catch (Exception ex)
        {
            stopwatch.Stop();
            result.Success = false;
            result.Error = ex.Message;
            result.Duration = $"{stopwatch.ElapsedMilliseconds}ms";
            _logger.LogError(ex, "Single statement execution error");
        }

        return result;
    }

    /// <summary>
    /// 验证 SQL 是否符合只读模式限制
    /// </summary>
    private bool ValidateSql(string sql, bool readOnly)
    {
        if (!readOnly) return true;
        
        var upperSql = sql.ToUpperInvariant();
        var dangerousKeywords = new[] { "INSERT", "UPDATE", "DELETE", "DROP", "TRUNCATE", "ALTER", "CREATE" };
        
        foreach (var keyword in dangerousKeywords)
        {
            if (upperSql.Contains(keyword))
            {
                return false;
            }
        }
        
        return true;
    }

    private static async Task<ExecuteResponse> ExecuteCommandAsync(NpgsqlCommand cmd, ExecuteRequest request, CancellationToken ct)
    {
        // 检测是否为查询语句
        string sqlForDetect = cmd.CommandText.TrimStart();
        
        // 去除注释
        while (true)
        {
            if (sqlForDetect.StartsWith("--"))
            {
                int idx = sqlForDetect.IndexOf('\n');
                sqlForDetect = idx >= 0 ? sqlForDetect[(idx + 1)..].TrimStart() : string.Empty;
                continue;
            }
            if (sqlForDetect.StartsWith("/*"))
            {
                int idx = sqlForDetect.IndexOf("*/");
                sqlForDetect = idx >= 0 ? sqlForDetect[(idx + 2)..].TrimStart() : string.Empty;
                continue;
            }
            break;
        }
        
        var firstToken = sqlForDetect.Split(new[] { ' ', '\n', '\r', '\t' }, StringSplitOptions.RemoveEmptyEntries)
            .FirstOrDefault()?.ToUpperInvariant();
        var isQuery = firstToken is "SELECT" or "WITH" or "SHOW" or "EXPLAIN";

        if (isQuery)
        {
            var rows = new List<Dictionary<string, object>>();
            await using var reader = await cmd.ExecuteReaderAsync(ct);
            int rowCount = 0;
            
            while (await reader.ReadAsync(ct))
            {
                var dict = new Dictionary<string, object>();
                for (int i = 0; i < reader.FieldCount; i++)
                {
                    var name = reader.GetName(i);
                    var value = await reader.IsDBNullAsync(i, ct) ? null : reader.GetValue(i);
                    dict[name] = value ?? DBNull.Value;
                }
                rows.Add(dict);
                rowCount++;
                
                if (request.MaxRows > 0 && rowCount >= request.MaxRows)
                {
                    break;
                }
            }
            
            return new ExecuteResponse
            {
                Success = true,
                Rows = rows
            };
        }
        else
        {
            var affected = await cmd.ExecuteNonQueryAsync(ct);
            return new ExecuteResponse
            {
                Success = true,
                AffectedRows = affected
            };
        }
    }
}