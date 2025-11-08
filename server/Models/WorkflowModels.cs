using System.Collections.Generic;

namespace SPDSQL.Server.Models
{
    public class Workflow
    {
        public List<Node> Nodes { get; set; } = new();
        public List<Edge> Edges { get; set; } = new();
        public string? InitialInput { get; set; }
    }

    public class Node
    {
        public string Id { get; set; } = string.Empty;
        public string Type { get; set; } = string.Empty;
        public Dictionary<string, object> Data { get; set; } = new();
    }

    public class Edge
    {
        public string Source { get; set; } = string.Empty;
        public string Target { get; set; } = string.Empty;
    }
}
