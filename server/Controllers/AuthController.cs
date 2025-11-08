using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using SPDSQL.Server.Data;
using SPDSQL.Server.Models;

namespace SPDSQL.Server.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AuthController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IConfiguration _cfg;

    public AuthController(AppDbContext db, IConfiguration cfg)
    {
        _db = db; _cfg = cfg;
    }

    [HttpPost("login")]
    public async Task<IActionResult> Login([FromBody] LoginRequest req, CancellationToken ct)
    {
        var user = await _db.Users.FirstOrDefaultAsync(x => x.Username == req.Username, ct);
        if (user == null) return Unauthorized();
        if (!BCrypt.Net.BCrypt.Verify(req.Password, user.PasswordHash)) return Unauthorized();

        var jwtKey = _cfg["Jwt:Key"] ?? "dev-secret-key-min-32-length-please-change-1234567890";
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
        var claims = new[]
        {
            new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new Claim(ClaimTypes.Name, user.Username),
            new Claim(ClaimTypes.Role, user.Role)
        };
        var token = new JwtSecurityToken(
            claims: claims,
            expires: DateTime.UtcNow.AddHours(8),
            signingCredentials: creds
        );
        var jwt = new JwtSecurityTokenHandler().WriteToken(token);
        return Ok(new LoginResponse(jwt, user.Username, user.Role));
    }

    [HttpPost("register")]
    [AllowAnonymous]
    public async Task<IActionResult> Register([FromBody] LoginRequest req, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(req.Username) || string.IsNullOrWhiteSpace(req.Password))
            return BadRequest(new { error = "用户名与密码不能为空" });
        var exists = await _db.Users.AnyAsync(x => x.Username == req.Username, ct);
        if (exists) return Conflict(new { error = "用户名已存在" });
        var user = new UserAccount
        {
            Id = Guid.NewGuid(),
            Username = req.Username.Trim(),
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.Password),
            Role = "Reader",
            CreatedAt = DateTime.UtcNow
        };
        await _db.Users.AddAsync(user, ct);
        await _db.SaveChangesAsync(ct);
        return Ok(new { ok = true });
    }

    [HttpGet("me")]
    [Authorize]
    public IActionResult Me()
    {
        var name = User?.Identity?.Name ?? string.Empty;
        var role = User?.Claims?.FirstOrDefault(c => c.Type == ClaimTypes.Role)?.Value ?? string.Empty;
        Guid id;
        var idStr = User?.Claims?.FirstOrDefault(c => c.Type == ClaimTypes.NameIdentifier)?.Value;
        var ok = Guid.TryParse(idStr, out id);
        string avatarUrl = string.Empty;
        if (ok)
        {
            var root = Path.Combine(Directory.GetCurrentDirectory(), "wwwroot", "avatars");
            var png = Path.Combine(root, $"{id}.png");
            var jpg = Path.Combine(root, $"{id}.jpg");
            var jpeg = Path.Combine(root, $"{id}.jpeg");
            if (System.IO.File.Exists(png)) avatarUrl = $"/avatars/{id}.png";
            else if (System.IO.File.Exists(jpg)) avatarUrl = $"/avatars/{id}.jpg";
            else if (System.IO.File.Exists(jpeg)) avatarUrl = $"/avatars/{id}.jpeg";
        }
        return Ok(new { username = name, role, avatarUrl });
    }
}