using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SPDSQL.Server.Data;
using SPDSQL.Server.Models;

namespace SPDSQL.Server.Controllers;

/// <summary>
/// 查询管理控制器
/// </summary>
[ApiController]
[Route("api/[controller]")]
[Authorize]
public class QueriesController : ControllerBase
{
    private readonly AppDbContext _db;

    public QueriesController(AppDbContext db)
    {
        _db = db;
    }

    [HttpGet]
    public async Task<IActionResult> List([FromQuery] string? keyword, CancellationToken ct)
    {
        var q = _db.SavedQueries.AsQueryable();
        if (!string.IsNullOrWhiteSpace(keyword))
        {
            q = q.Where(x => x.Title.Contains(keyword) || (x.Description != null && x.Description.Contains(keyword)));
        }
        var list = await q.OrderByDescending(x => x.UpdatedAt).Take(200).ToListAsync(ct);
        return Ok(list);
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> Get(Guid id, CancellationToken ct)
    {
        var item = await _db.SavedQueries.FindAsync([id], ct);
        return item == null ? NotFound() : Ok(item);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] SavedQuery model, CancellationToken ct)
    {
        model.Id = Guid.NewGuid();
        model.CreatedAt = DateTime.UtcNow;
        model.UpdatedAt = DateTime.UtcNow;
        await _db.SavedQueries.AddAsync(model, ct);
        await _db.SaveChangesAsync(ct);
        return Ok(model);
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] SavedQuery model, CancellationToken ct)
    {
        var item = await _db.SavedQueries.FindAsync([id], ct);
        if (item == null) return NotFound();
        item.Title = model.Title;
        item.Description = model.Description;
        item.SqlText = model.SqlText;
        item.Tags = model.Tags;
        item.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);
        return Ok(item);
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        var item = await _db.SavedQueries.FindAsync([id], ct);
        if (item == null) return NotFound();
        _db.SavedQueries.Remove(item);
        await _db.SaveChangesAsync(ct);
        return Ok();
    }
}