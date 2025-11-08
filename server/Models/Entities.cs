namespace SPDSQL.Server.Models;

public class SavedQuery
{
    public Guid Id { get; set; }
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string SqlText { get; set; } = string.Empty;
    public string[] Tags { get; set; } = Array.Empty<string>();
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

public class SchemaDoc
{
    public Guid Id { get; set; }
    public string SchemaName { get; set; } = "public";
    public string TableName { get; set; } = string.Empty;
    public string Document { get; set; } = string.Empty; // Markdown or JSON
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

public class ExecutionLog
{
    public Guid Id { get; set; }
    public string SqlText { get; set; } = string.Empty;
    public bool IsReadOnly { get; set; }
    public bool Success { get; set; }
    public string? Error { get; set; }
    public int AffectedRows { get; set; }
    public DateTime ExecutedAt { get; set; } = DateTime.UtcNow;
}

public class AiSession
{
    public Guid Id { get; set; }
    public string Topic { get; set; } = string.Empty;
    public string MessagesJson { get; set; } = string.Empty; // chat history
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}