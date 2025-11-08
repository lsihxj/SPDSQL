namespace SPDSQL.Server.Models;

public class UserAccount
{
    public Guid Id { get; set; }
    public string Username { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public string Role { get; set; } = "Reader"; // Reader / Writer / Admin
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public record LoginRequest(string Username, string Password);
public record LoginResponse(string Token, string Username, string Role);
