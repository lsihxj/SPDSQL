using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using Npgsql;
using SPDSQL.Server.Data;
using SPDSQL.Server.Models;
using System.Text;

namespace SPDSQL.Server.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class SchemaToolsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IConfiguration _cfg;

    public SchemaToolsController(AppDbContext db, IConfiguration cfg)
    {
        _db = db; _cfg = cfg;
    }

    [HttpPost("reflect")]
    public async Task<IActionResult> Reflect(CancellationToken ct)
    {
        var connStr = _cfg.GetConnectionString("DefaultConnection")!;
        await using var conn = new NpgsqlConnection(connStr);
        await conn.OpenAsync(ct);
        var sql = @"SELECT table_schema, table_name, column_name, data_type, is_nullable
                    FROM information_schema.columns
                    WHERE table_schema NOT IN ('pg_catalog','information_schema')
                    ORDER BY table_schema, table_name, ordinal_position";
        await using var cmd = new NpgsqlCommand(sql, conn);
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        var sb = new StringBuilder();
        string? currentTable = null; string? currentSchema = null;
        var docs = new List<SchemaDoc>();
        while (await reader.ReadAsync(ct))
        {
            var schema = reader.GetString(0);
            var table = reader.GetString(1);
            var column = reader.GetString(2);
            var type = reader.GetString(3);
            var nullable = reader.GetString(4) == "YES" ? "NULL" : "NOT NULL";
            if (currentTable != table || currentSchema != schema)
            {
                if (currentTable != null)
                {
                    docs.Add(new SchemaDoc { Id = Guid.NewGuid(), SchemaName = currentSchema!, TableName = currentTable!, Document = sb.ToString(), UpdatedAt = DateTime.UtcNow });
                    sb.Clear();
                }
                currentSchema = schema; currentTable = table;
                sb.AppendLine($"Table: {schema}.{table}");
                sb.AppendLine("Columns:");
            }
            sb.AppendLine($"- {column} {type} {nullable}");
        }
        if (currentTable != null)
        {
            docs.Add(new SchemaDoc { Id = Guid.NewGuid(), SchemaName = currentSchema!, TableName = currentTable!, Document = sb.ToString(), UpdatedAt = DateTime.UtcNow });
        }
        // 清空后导入（简单策略，可扩展为增量对比）
        _db.SchemaDocs.RemoveRange(_db.SchemaDocs);
        await _db.SaveChangesAsync(ct);
        await _db.SchemaDocs.AddRangeAsync(docs, ct);
        await _db.SaveChangesAsync(ct);
        return Ok(new { count = docs.Count });
    }

    [HttpGet("export")]
    public IActionResult Export()
    {
        var list = _db.SchemaDocs.OrderBy(x=>x.SchemaName).ThenBy(x=>x.TableName).ToList();
        return Ok(list);
    }

    [HttpPost("import")]
    public async Task<IActionResult> Import([FromBody] List<SchemaDoc> docs, CancellationToken ct)
    {
        _db.SchemaDocs.RemoveRange(_db.SchemaDocs);
        await _db.SaveChangesAsync(ct);
        foreach (var d in docs)
        {
            d.Id = Guid.NewGuid();
            d.UpdatedAt = DateTime.UtcNow;
        }
        await _db.SchemaDocs.AddRangeAsync(docs, ct);
        await _db.SaveChangesAsync(ct);
        return Ok(new { count = docs.Count });
    }

    [HttpGet("erd")]
    public async Task<IActionResult> GetErd([FromQuery] string schema = "public", CancellationToken ct = default)
    {
        var connStr = _cfg.GetConnectionString("DefaultConnection")!;
        await using var conn = new NpgsqlConnection(connStr);
        await conn.OpenAsync(ct);
        var sqlTables = @"SELECT table_name FROM information_schema.tables WHERE table_schema = @schema AND table_type = 'BASE TABLE' ORDER BY table_name";
        var tables = new List<string>();
        await using (var cmd = new NpgsqlCommand(sqlTables, conn))
        {
            cmd.Parameters.AddWithValue("schema", schema);
            await using var r = await cmd.ExecuteReaderAsync(ct);
            while (await r.ReadAsync(ct)) tables.Add(r.GetString(0));
        }
        var result = new List<object>();
        foreach (var t in tables)
        {
            var sqlCols = @"SELECT column_name, data_type, is_nullable, character_maximum_length
                             FROM information_schema.columns
                             WHERE table_schema = @schema AND table_name = @table
                             ORDER BY ordinal_position";
            var cols = new List<object>();
            await using (var cmd = new NpgsqlCommand(sqlCols, conn))
            {
                cmd.Parameters.AddWithValue("schema", schema);
                cmd.Parameters.AddWithValue("table", t);
                await using var r = await cmd.ExecuteReaderAsync(ct);
                while (await r.ReadAsync(ct))
                {
                    cols.Add(new {
                        name = r.GetString(0),
                        dataType = r.GetString(1),
                        isNullable = r.GetString(2) == "YES",
                        length = r.IsDBNull(3) ? (int?)null : r.GetInt32(3)
                    });
                }
            }
            result.Add(new { tableSchema = schema, tableName = t, columns = cols });
        }
        return Ok(result);
    }
}