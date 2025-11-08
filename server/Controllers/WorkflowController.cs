using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using SPDSQL.Server.Models;
using SPDSQL.Server.Services;

using Microsoft.Extensions.Configuration;

namespace SPDSQL.Server.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class WorkflowController : ControllerBase
    {
        private readonly WorkflowService _workflowService;

        public WorkflowController(WorkflowService workflowService, AiService aiService, SqlExecutionService sqlExecutionService)
        {
            _workflowService = workflowService;
        }

        [HttpPost("execute")]
        public async Task ExecuteWorkflow([FromBody] Workflow workflow)
        {
            var accept = Request.Headers["Accept"].ToString().ToLowerInvariant();
            if (accept.Contains("text/event-stream"))
            {
                Response.Headers["Content-Type"] = "text/event-stream";
                Response.Headers["Cache-Control"] = "no-cache";
                Response.Headers["Connection"] = "keep-alive";
                await _workflowService.ExecuteWorkflowSse(workflow, Response, HttpContext.RequestAborted);
                return;
            }
            var result = await _workflowService.ExecuteWorkflow(workflow);
            Response.ContentType = "application/json";
            await HttpContext.Response.BodyWriter.WriteAsync(System.Text.Encoding.UTF8.GetBytes(System.Text.Json.JsonSerializer.Serialize(result)));
        }
    }
}
