using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using System.Text;
using SPDSQL.Server.Data;
using SPDSQL.Server.Services;
using Microsoft.Extensions.DependencyInjection;
using SPDSQL.Server.Models;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

builder.Services.AddDbContext<AppDbContext>(options =>
{
    // Prefer .env (solution root) DB_* values; fallback to appsettings.json connection string
    string? connStr = null;
    try
    {
        var serverRoot = builder.Environment.ContentRootPath; // .../SPDSQL/server
        var solutionRoot = Path.GetFullPath(Path.Combine(serverRoot, ".."));
        var envPath = Path.Combine(solutionRoot, ".env");
        if (File.Exists(envPath))
        {
            var lines = File.ReadAllLines(envPath);
            string? DB_HOST = null, DB_PORT = null, DB_DATABASE = null, DB_USERNAME = null, DB_PASSWORD = null, DB_SSL = null;
            foreach (var raw in lines)
            {
                var line = raw.Trim();
                if (string.IsNullOrWhiteSpace(line) || line.StartsWith("#")) continue;
                var idx = line.IndexOf('=');
                if (idx <= 0) continue;
                var key = line.Substring(0, idx).Trim();
                var value = line.Substring(idx + 1).Trim().Trim('"', '\'');
                switch (key)
                {
                    case "DB_HOST": DB_HOST = value; break;
                    case "DB_PORT": DB_PORT = value; break;
                    case "DB_DATABASE": DB_DATABASE = value; break;
                    case "DB_USERNAME": DB_USERNAME = value; break;
                    case "DB_PASSWORD": DB_PASSWORD = value; break;
                    case "DB_SSL": DB_SSL = value; break;
                }
            }
            if (!string.IsNullOrEmpty(DB_HOST) && !string.IsNullOrEmpty(DB_DATABASE))
            {
                var port = string.IsNullOrEmpty(DB_PORT) ? "5432" : DB_PORT;
                var sslMode = (!string.IsNullOrEmpty(DB_SSL) && bool.TryParse(DB_SSL, out var ssl) && ssl) ? "Require" : "Disable";
                // Npgsql style connection string
                connStr = $"Host={DB_HOST};Port={port};Database={DB_DATABASE};Username={DB_USERNAME};Password={DB_PASSWORD};SslMode={sslMode};";
            }
        }
    }
    catch { }

    if (string.IsNullOrWhiteSpace(connStr))
    {
        connStr = builder.Configuration.GetConnectionString("DefaultConnection");
    }

    options.UseNpgsql(connStr);
});

builder.Services.Configure<OpenAIOptions>(builder.Configuration.GetSection("OpenAI"));

builder.Services.AddHttpClient<AiService>();
builder.Services.AddScoped<SqlExecutionService>();
builder.Services.AddScoped<AiService>();

builder.Services.AddScoped<SqlExecutionService>();

builder.Services.AddControllers();

builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.AllowAnyHeader().AllowAnyMethod().AllowAnyOrigin();
    });
});

var jwtKey = builder.Configuration["Jwt:Key"] ?? "dev-secret-key-min-32-length-please-change-1234567890";
var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey));

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = false,
            ValidateAudience = false,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = key
        };
    });

builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("WriterOnly", policy => policy.RequireRole("Writer", "Admin"));
});

builder.Services.AddScoped<SqlExecutionService>();
builder.Services.AddScoped<AiService>();
builder.Services.AddScoped<WorkflowService>();

var app = builder.Build();

// Auto-migrate and ensure a default admin exists (admin/admin123)
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.Migrate();
    if (!db.Users.Any())
    {
        db.Users.Add(new UserAccount
        {
            Id = Guid.NewGuid(),
            Username = "admin",
            PasswordHash = BCrypt.Net.BCrypt.HashPassword("admin123"),
            Role = "Admin",
            CreatedAt = DateTime.UtcNow
        });
        db.SaveChanges();
    }
}

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors();
app.UseAuthentication();
app.UseAuthorization();

// 静态文件用于存放头像：/wwwroot/avatars/{userId}.(png|jpg)
app.UseStaticFiles();

app.MapControllers();

app.Run();