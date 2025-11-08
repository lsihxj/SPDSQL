using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Text;

namespace SPDSQL.Server.Controllers
{
    [ApiController]
    [Route("api/config")]
    public class ConfigController : ControllerBase
    {
        private readonly IWebHostEnvironment _env;

        public ConfigController(IWebHostEnvironment env)
        {
            _env = env;
        }

        private string GetSolutionRootEnvPath()
        {
            // server content root points to /server; .env is at solution root next to /server and /client
            var serverRoot = _env.ContentRootPath; // .../SPDSQL/server
            var solutionRoot = Path.GetFullPath(Path.Combine(serverRoot, ".."));
            return Path.Combine(solutionRoot, ".env");
        }

        private static IDictionary<string, string> ParseDotEnv(string content)
        {
            var dict = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            using var reader = new StringReader(content);
            string? line;
            while ((line = reader.ReadLine()) != null)
            {
                var trimmed = line.Trim();
                if (string.IsNullOrWhiteSpace(trimmed)) continue;
                if (trimmed.StartsWith("#")) continue;
                var idx = trimmed.IndexOf('=');
                if (idx <= 0) continue;
                var key = trimmed.Substring(0, idx).Trim();
                var value = trimmed.Substring(idx + 1).Trim();
                // remove optional quotes
                if ((value.StartsWith("\"") && value.EndsWith("\"")) || (value.StartsWith("'") && value.EndsWith("'")))
                {
                    value = value.Substring(1, value.Length - 2);
                }
                dict[key] = value;
            }
            return dict;
        }

        private static string UpsertDotEnv(string original, IDictionary<string, string> kv)
        {
            var lines = (original ?? string.Empty).Split(new[] {"\r\n", "\n"}, StringSplitOptions.None).ToList();
            var indexMap = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
            for (int i = 0; i < lines.Count; i++)
            {
                var l = lines[i].Trim();
                if (l.StartsWith("#") || string.IsNullOrWhiteSpace(l)) continue;
                var eq = l.IndexOf('=');
                if (eq <= 0) continue;
                var k = l.Substring(0, eq).Trim();
                indexMap[k] = i;
            }
            foreach (var pair in kv)
            {
                var v = pair.Value ?? string.Empty;
                var escaped = v.Contains(' ') || v.Contains('"') || v.Contains('#') ? $"\"{v.Replace("\"", "\\\"")}\"" : v;
                if (indexMap.TryGetValue(pair.Key, out var idx))
                {
                    lines[idx] = $"{pair.Key}={escaped}";
                }
                else
                {
                    lines.Add($"{pair.Key}={escaped}");
                }
            }
            return string.Join("\n", lines);
        }

        public class DbConfigDto
        {
            public string? Host { get; set; }
            public int? Port { get; set; }
            public string? Database { get; set; }
            public string? Username { get; set; }
            public string? Password { get; set; }
            public bool? Ssl { get; set; }
        }

        [HttpGet("db")]
        [AllowAnonymous]
        public IActionResult GetDb()
        {
            try
            {
                var path = GetSolutionRootEnvPath();
                if (!System.IO.File.Exists(path)) return Ok(new DbConfigDto());
                var content = System.IO.File.ReadAllText(path, Encoding.UTF8);
                var dict = ParseDotEnv(content);
                var dto = new DbConfigDto
                {
                    Host = dict.TryGetValue("DB_HOST", out var h) ? h : null,
                    Port = dict.TryGetValue("DB_PORT", out var p) && int.TryParse(p, out var port) ? port : null,
                    Database = dict.TryGetValue("DB_DATABASE", out var d) ? d : null,
                    Username = dict.TryGetValue("DB_USERNAME", out var u) ? u : null,
                    Password = dict.TryGetValue("DB_PASSWORD", out var pw) ? pw : null,
                    Ssl = dict.TryGetValue("DB_SSL", out var s) && bool.TryParse(s, out var ssl) ? ssl : null,
                };
                return Ok(dto);
            }
            catch (Exception ex)
            {
                return Problem(detail: ex.Message);
            }
        }

        [HttpPost("db")]
        [Authorize(Policy = "WriterOnly")] // require Writer/Admin to modify .env
        public IActionResult SaveDb([FromBody] DbConfigDto dto)
        {
            try
            {
                var path = GetSolutionRootEnvPath();
                var original = System.IO.File.Exists(path) ? System.IO.File.ReadAllText(path, Encoding.UTF8) : string.Empty;
                var updates = new Dictionary<string, string>
                {
                    ["DB_HOST"] = dto.Host ?? string.Empty,
                    ["DB_PORT"] = (dto.Port?.ToString() ?? string.Empty),
                    ["DB_DATABASE"] = dto.Database ?? string.Empty,
                    ["DB_USERNAME"] = dto.Username ?? string.Empty,
                    ["DB_PASSWORD"] = dto.Password ?? string.Empty,
                    ["DB_SSL"] = (dto.Ssl?.ToString() ?? string.Empty)
                };
                var updated = UpsertDotEnv(original, updates);
                System.IO.File.WriteAllText(path, updated, Encoding.UTF8);
                return Ok(new { ok = true });
            }
            catch (Exception ex)
            {
                return Problem(detail: ex.Message);
            }
        }
    }
}
