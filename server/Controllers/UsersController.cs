using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SPDSQL.Server.Data;
using SPDSQL.Server.Models;

namespace SPDSQL.Server.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize(Roles = "Admin")]
public class UsersController : ControllerBase
{
    private readonly AppDbContext _db;

    public UsersController(AppDbContext db)
    {
        _db = db;
    }

    public class CreateUserRequest
    {
        public string Username { get; set; } = string.Empty;
        public string Password { get; set; } = string.Empty;
        public string Role { get; set; } = "Reader";
    }

    public class UpdateUserRequest
    {
        public string Username { get; set; } = string.Empty;
        public string Role { get; set; } = "Reader";
    }

    public class ResetPasswordRequest
    {
        public string NewPassword { get; set; } = string.Empty;
    }

    private string GetAvatarUrl(Guid id)
    {
        var root = Path.Combine(Directory.GetCurrentDirectory(), "wwwroot", "avatars");
        var png = Path.Combine(root, $"{id}.png");
        var jpg = Path.Combine(root, $"{id}.jpg");
        var jpeg = Path.Combine(root, $"{id}.jpeg");
        if (System.IO.File.Exists(png)) return $"/avatars/{id}.png";
        if (System.IO.File.Exists(jpg)) return $"/avatars/{id}.jpg";
        if (System.IO.File.Exists(jpeg)) return $"/avatars/{id}.jpeg";
        return string.Empty;
    }

    [HttpGet]
    public async Task<IActionResult> List(CancellationToken ct)
    {
        var users = await _db.Users
            .OrderByDescending(u => u.CreatedAt)
            .ToListAsync(ct);
        var list = users.Select(u => new { u.Id, u.Username, u.Role, u.CreatedAt, AvatarUrl = GetAvatarUrl(u.Id) });
        return Ok(list);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateUserRequest req, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(req.Username) || string.IsNullOrWhiteSpace(req.Password))
            return BadRequest(new { error = "用户名与密码不能为空" });
        var exists = await _db.Users.AnyAsync(x => x.Username == req.Username, ct);
        if (exists) return Conflict(new { error = "用户名已存在" });
        var entity = new UserAccount
        {
            Id = Guid.NewGuid(),
            Username = req.Username.Trim(),
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.Password),
            Role = string.IsNullOrWhiteSpace(req.Role) ? "Reader" : req.Role,
            CreatedAt = DateTime.UtcNow
        };
        await _db.Users.AddAsync(entity, ct);
        await _db.SaveChangesAsync(ct);
        return Ok(new { entity.Id, entity.Username, entity.Role, entity.CreatedAt });
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateUserRequest req, CancellationToken ct)
    {
        var user = await _db.Users.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (user == null) return NotFound();
        if (!string.IsNullOrWhiteSpace(req.Username))
        {
            var exists = await _db.Users.AnyAsync(x => x.Username == req.Username && x.Id != id, ct);
            if (exists) return Conflict(new { error = "该用户名已被占用" });
            user.Username = req.Username.Trim();
        }
        if (!string.IsNullOrWhiteSpace(req.Role))
        {
            user.Role = req.Role.Trim();
        }
        await _db.SaveChangesAsync(ct);
        return Ok(new { user.Id, user.Username, user.Role, user.CreatedAt });
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        var user = await _db.Users.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (user == null) return NotFound();
        _db.Users.Remove(user);
        await _db.SaveChangesAsync(ct);
        return Ok();
    }

    [HttpPost("{id}/reset-password")]
    public async Task<IActionResult> ResetPassword(Guid id, [FromBody] ResetPasswordRequest req, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(req.NewPassword)) return BadRequest(new { error = "新密码不能为空" });
        var user = await _db.Users.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (user == null) return NotFound();
        user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.NewPassword);
        await _db.SaveChangesAsync(ct);
        return Ok(new { ok = true });
    }

    [HttpPost("{id}/avatar")]
    [RequestSizeLimit(5_000_000)] // 5MB
    public async Task<IActionResult> UploadAvatar(Guid id, IFormFile? file, CancellationToken ct)
    {
        if (file == null || file.Length == 0) return BadRequest(new { error = "未选择文件" });
        if (!file.ContentType.StartsWith("image/")) return BadRequest(new { error = "仅支持图片文件" });
        var root = Path.Combine(Directory.GetCurrentDirectory(), "wwwroot", "avatars");
        Directory.CreateDirectory(root);
        // 统一保存为 .png 或保留扩展
        var ext = Path.GetExtension(file.FileName);
        if (string.IsNullOrWhiteSpace(ext)) ext = ".png";
        ext = ext.ToLowerInvariant();
        if (ext != ".png" && ext != ".jpg" && ext != ".jpeg") ext = ".png";
        // 清理旧文件
        foreach (var f in new[] { Path.Combine(root, $"{id}.png"), Path.Combine(root, $"{id}.jpg"), Path.Combine(root, $"{id}.jpeg") })
        {
            try { if (System.IO.File.Exists(f)) System.IO.File.Delete(f); } catch { }
        }
        var path = Path.Combine(root, $"{id}{ext}");
        using (var stream = System.IO.File.Create(path))
        {
            await file.CopyToAsync(stream, ct);
        }
        var url = $"/avatars/{id}{ext}";
        return Ok(new { avatarUrl = url });
    }

    [HttpDelete("{id}/avatar")]
    public IActionResult DeleteAvatar(Guid id)
    {
        var root = Path.Combine(Directory.GetCurrentDirectory(), "wwwroot", "avatars");
        var deleted = false;
        foreach (var f in new[] { Path.Combine(root, $"{id}.png"), Path.Combine(root, $"{id}.jpg"), Path.Combine(root, $"{id}.jpeg") })
        {
            try { if (System.IO.File.Exists(f)) { System.IO.File.Delete(f); deleted = true; } } catch { }
        }
        return Ok(new { ok = deleted });
    }
}
