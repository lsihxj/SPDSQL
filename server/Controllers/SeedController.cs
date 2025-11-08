using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SPDSQL.Server.Data;
using SPDSQL.Server.Models;

namespace SPDSQL.Server.Controllers;

[ApiController]
[Route("api/[controller]")]
public class SeedController : ControllerBase
{
    private readonly AppDbContext _db;
    public SeedController(AppDbContext db) { _db = db; }

    [HttpPost]
    public async Task<IActionResult> Seed()
    {
        if (!await _db.Users.AnyAsync())
        {
            _db.Users.Add(new UserAccount
            {
                Id = Guid.NewGuid(),
                Username = "admin",
                PasswordHash = BCrypt.Net.BCrypt.HashPassword("admin123"),
                Role = "Admin"
            });
            await _db.SaveChangesAsync();
        }
        if (!await _db.SchemaDocs.AnyAsync())
        {
            _db.SchemaDocs.Add(new SchemaDoc
            {
                Id = Guid.NewGuid(),
                SchemaName = "public",
                TableName = "orders",
                Document = "Table: public.orders\nColumns:\n- id uuid NOT NULL\n- order_date date NOT NULL\n- total_amount numeric(12,2) NOT NULL\n- customer_id uuid NOT NULL\n",
                UpdatedAt = DateTime.UtcNow
            });
            await _db.SaveChangesAsync();
        }
        return Ok(new { ok = true });
    }
}