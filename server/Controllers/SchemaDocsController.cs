using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SPDSQL.Server.Data;
using SPDSQL.Server.Models;
using Npgsql;

namespace SPDSQL.Server.Controllers;

/// <summary>
/// Schema文档管理控制器
/// </summary>
[ApiController]
[Route("api/schema")]
[Authorize]
public class SchemaDocsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IConfiguration _config;
    private readonly ILogger<SchemaDocsController> _logger;

    public SchemaDocsController(
        AppDbContext db, 
        IConfiguration config,
        ILogger<SchemaDocsController> logger)
    {
        _db = db;
        _config = config;
        _logger = logger;
    }

    /// <summary>
    /// 获取所有Schema文档
    /// </summary>
    [HttpGet]
    public async Task<IActionResult> List(CancellationToken ct)
    {
        var docs = await _db.SchemaDocs
            .OrderBy(s => s.SchemaName)
            .ThenBy(s => s.TableName)
            .ToListAsync(ct);
        return Ok(docs);
    }

    /// <summary>
    /// 更新特定表的Schema文档
    /// </summary>
    [HttpPost]
    public async Task<IActionResult> Update([FromBody] SchemaDoc model, CancellationToken ct)
    {
        var existing = await _db.SchemaDocs
            .FirstOrDefaultAsync(s => s.SchemaName == model.SchemaName && s.TableName == model.TableName, ct);

        if (existing != null)
        {
            existing.Document = model.Document;
            existing.UpdatedAt = DateTime.UtcNow;
        }
        else
        {
            model.Id = Guid.NewGuid();
            model.UpdatedAt = DateTime.UtcNow;
            await _db.SchemaDocs.AddAsync(model, ct);
        }

        await _db.SaveChangesAsync(ct);
        return Ok(existing ?? model);
    }

    /// <summary>
    /// 从数据库自动生成Schema文档
    /// </summary>
    [HttpPost("auto-generate")]
    public async Task<IActionResult> AutoGenerate([FromQuery] string schemaName = "public", CancellationToken ct = default)
    {
        try
        {
            var connectionString = _config.GetConnectionString("DefaultConnection");
            using var conn = new NpgsqlConnection(connectionString);
            await conn.OpenAsync(ct);

            // 查询表信息
            var tablesQuery = @"
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = @schema 
                  AND table_type = 'BASE TABLE'
                ORDER BY table_name";

            var tableNames = new List<string>();
            using (var cmd = new NpgsqlCommand(tablesQuery, conn))
            {
                cmd.Parameters.AddWithValue("schema", schemaName);
                using var reader = await cmd.ExecuteReaderAsync(ct);
                while (await reader.ReadAsync(ct))
                {
                    tableNames.Add(reader.GetString(0));
                }
            }

            var generatedDocs = new List<SchemaDoc>();

            foreach (var tableName in tableNames)
            {
                // 查询列信息
                var columnsQuery = @"
                    SELECT 
                        column_name,
                        data_type,
                        is_nullable,
                        column_default,
                        character_maximum_length
                    FROM information_schema.columns
                    WHERE table_schema = @schema 
                      AND table_name = @table
                    ORDER BY ordinal_position";

                var columns = new List<string>();
                using (var cmd = new NpgsqlCommand(columnsQuery, conn))
                {
                    cmd.Parameters.AddWithValue("schema", schemaName);
                    cmd.Parameters.AddWithValue("table", tableName);
                    using var reader = await cmd.ExecuteReaderAsync(ct);
                    while (await reader.ReadAsync(ct))
                    {
                        var columnName = reader.GetString(0);
                        var dataType = reader.GetString(1);
                        var nullable = reader.GetString(2) == "YES" ? "NULL" : "NOT NULL";
                        var defaultValue = reader.IsDBNull(3) ? "" : $" DEFAULT {reader.GetString(3)}";
                        var maxLength = reader.IsDBNull(4) ? "" : $"({reader.GetInt32(4)})";

                        columns.Add($"  - {columnName}: {dataType}{maxLength} {nullable}{defaultValue}");
                    }
                }

                var document = $"Columns:\n{string.Join("\n", columns)}";

                var existing = await _db.SchemaDocs
                    .FirstOrDefaultAsync(s => s.SchemaName == schemaName && s.TableName == tableName, ct);

                if (existing != null)
                {
                    existing.Document = document;
                    existing.UpdatedAt = DateTime.UtcNow;
                    generatedDocs.Add(existing);
                }
                else
                {
                    var newDoc = new SchemaDoc
                    {
                        Id = Guid.NewGuid(),
                        SchemaName = schemaName,
                        TableName = tableName,
                        Document = document,
                        UpdatedAt = DateTime.UtcNow
                    };
                    await _db.SchemaDocs.AddAsync(newDoc, ct);
                    generatedDocs.Add(newDoc);
                }
            }

            await _db.SaveChangesAsync(ct);
            return Ok(new { message = $"Generated {generatedDocs.Count} schema documents", docs = generatedDocs });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to auto-generate schema docs");
            return BadRequest(new { error = ex.Message });
        }
    }

    /// <summary>
    /// 删除Schema文档
    /// </summary>
    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        var doc = await _db.SchemaDocs.FindAsync(new object[] { id }, ct);
        if (doc == null) return NotFound();

        _db.SchemaDocs.Remove(doc);
        await _db.SaveChangesAsync(ct);
        return Ok();
    }
}
