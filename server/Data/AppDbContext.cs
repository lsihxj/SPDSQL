using Microsoft.EntityFrameworkCore;
using SPDSQL.Server.Models;

namespace SPDSQL.Server.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options)
    {
    }

    public DbSet<SavedQuery> SavedQueries => Set<SavedQuery>();
    public DbSet<SchemaDoc> SchemaDocs => Set<SchemaDoc>();
    public DbSet<ExecutionLog> ExecutionLogs => Set<ExecutionLog>();
    public DbSet<AiSession> AiSessions => Set<AiSession>();
    public DbSet<UserAccount> Users => Set<UserAccount>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<SavedQuery>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.Title).HasMaxLength(200).IsRequired();
            e.Property(x => x.Tags).HasColumnType("text[]");
            e.Property(x => x.SqlText).IsRequired();
        });

        modelBuilder.Entity<SchemaDoc>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.SchemaName).HasMaxLength(100).HasDefaultValue("public");
            e.Property(x => x.TableName).HasMaxLength(200).IsRequired();
        });

        modelBuilder.Entity<ExecutionLog>(e =>
        {
            e.HasKey(x => x.Id);
        });

        modelBuilder.Entity<AiSession>(e =>
        {
            e.HasKey(x => x.Id);
        });

        modelBuilder.Entity<UserAccount>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasIndex(x => x.Username).IsUnique();
            e.Property(x => x.Username).HasMaxLength(100).IsRequired();
            e.Property(x => x.PasswordHash).IsRequired();
            e.Property(x => x.Role).HasMaxLength(20).HasDefaultValue("Reader");
        });
    }
}