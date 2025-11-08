using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SPDSQL.Server.Data;
using SPDSQL.Server.Models;

namespace SPDSQL.Server.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AdminController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IHostEnvironment _env;

    public AdminController(AppDbContext db, IHostEnvironment env)
    {
        _db = db;
        _env = env;
    }

    // DEV-ONLY: Reset or create admin user with default password "admin123"
    [HttpPost("reset-admin")]
    public async Task<IActionResult> ResetAdmin()
    {
        if (!_env.IsDevelopment())
        {
            return Forbid();
        }

        var user = await _db.Users.FirstOrDefaultAsync(u => u.Username == "admin");
        if (user == null)
        {
            user = new UserAccount
            {
                Id = Guid.NewGuid(),
                Username = "admin",
                Role = "Admin",
                PasswordHash = BCrypt.Net.BCrypt.HashPassword("admin123"),
                CreatedAt = DateTime.UtcNow
            };
            _db.Users.Add(user);
        }
        else
        {
            user.Role = "Admin";
            user.PasswordHash = BCrypt.Net.BCrypt.HashPassword("admin123");
        }

        await _db.SaveChangesAsync();
        return Ok(new { ok = true, username = user.Username, role = user.Role });
    }
}
