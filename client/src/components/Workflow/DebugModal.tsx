import React from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, Box, Stack, Chip } from '@mui/material';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github.css';
const Markdown = ({ children }: { children: any }) => {
  const RM: any = ReactMarkdown;
  let text = '';
  if (typeof children === 'string') text = children;
  else if (Array.isArray(children)) {
    text = children
      .map((x) => (typeof x === 'string' ? x : (x == null ? '' : (typeof x === 'object' ? JSON.stringify(x, null, 2) : String(x)))))
      .join('');
  } else if (children == null) text = '';
  else if (typeof children === 'object') {
    const toStr = (children as any).toString;
    if (typeof toStr === 'function' && toStr !== Object.prototype.toString) text = String(children);
    else text = JSON.stringify(children, null, 2);
  } else {
    text = String(children);
  }
  // 暂停使用 ReactMarkdown，先安全回退为纯文本展示
  return <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'Menlo,Consolas,monospace', margin: 0 }}>{String(text ?? '')}</pre>;
};

interface DebugModalProps {
  isOpen: boolean;
  onRequestClose: () => void;
  workflow: any;
}

type TraceItem = {
  nodeId: string;
  kind: string;
  input: any;
  output: any;
};

const DebugModal: React.FC<DebugModalProps> = ({ isOpen, onRequestClose, workflow }) => {
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const [initialInput, setInitialInput] = React.useState('');
  const [messages, setMessages] = React.useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const [isRunning, setIsRunning] = React.useState(false);

  React.useEffect(() => {
    if (isOpen && inputRef.current) {
      // next tick to ensure focus
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isOpen]);

  const handleRun = async () => {
    if (!initialInput.trim()) return;
    setIsRunning(true);
    setMessages([{ role: 'user', content: initialInput }]);
    try {
      // 基于所选模型ID，将设置中的 BaseUrl/ApiKey/Model 注入到 LLM 节点（运行时注入，不持久化）
      const models = JSON.parse(localStorage.getItem('ai_models') || '[]') as any[];
      const wfToRun = JSON.parse(JSON.stringify(workflow || { nodes: [], edges: [] }));
      if (Array.isArray(wfToRun.nodes)) {
        for (const n of wfToRun.nodes) {
          const kind = n?.data?.kind;
          if (kind === 'llm') {
            const mid = n?.data?.modelId;
            const m = models.find((x: any) => x.id === mid);
            if (m) {
              n.data.baseUrl = m.baseUrl || m.BaseUrl || '';
              n.data.apiKey = m.apiKey || m.ApiKey || '';
              n.data.model = m.model || m.Model || '';
            }
          }
        }
      }
      const response = await fetch('/api/workflow/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...wfToRun, InitialInput: initialInput }),
      });
      const result = await response.json();
      const trace: TraceItem[] = Array.isArray(result?.trace) ? result.trace : [];
      const finalOutput = result?.output ?? result?.context?.output ?? '';

      const assistantMsgs: Array<{ role: 'assistant'; content: string }> = [];
      for (const item of trace) {
        const title = `[${item.kind}] ${item.nodeId}`;
        const inputStr = typeof item.input === 'string' ? item.input : JSON.stringify(item.input, null, 2);
        const outputStr = typeof item.output === 'string' ? item.output : JSON.stringify(item.output, null, 2);
        assistantMsgs.push({ role: 'assistant', content: `${title}\n输入：\n${inputStr}\n\n输出：\n${outputStr}` });
      }
      assistantMsgs.push({ role: 'assistant', content: `最终输出：\n${typeof finalOutput === 'string' ? finalOutput : JSON.stringify(finalOutput, null, 2)}` });
      setMessages(prev => [...prev, ...assistantMsgs]);
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: `执行失败：${String(err)}` }]);
    } finally {
      setIsRunning(false);
    }
  };

  const handleKeyDown: React.KeyboardEventHandler<HTMLDivElement> = (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || !e.shiftKey)) {
      e.preventDefault();
      handleRun();
    }
  };

  return (
    <Dialog open={isOpen} onClose={onRequestClose} maxWidth="md" fullWidth>
      <DialogTitle>Debug Workflow</DialogTitle>
      <DialogContent dividers>
        <TextField
          inputRef={inputRef}
          label="输入你的问题"
          value={initialInput}
          onChange={(e) => setInitialInput(e.target.value)}
          onKeyDown={handleKeyDown}
          fullWidth
          multiline
          minRows={3}
        />

        <Box sx={{ mt: 2 }}>
          <Stack spacing={1}>
            {messages.map((m, idx) => (
              <Box key={idx} sx={{
                p: 1.5,
                borderRadius: 1,
                background: m.role === 'user' ? 'rgba(30,136,229,0.06)' : 'rgba(0,0,0,0.03)',
                border: '1px solid #e6eaf5',
                whiteSpace: 'pre-wrap',
                fontFamily: 'Menlo, Consolas, monospace'
              }}>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                  <Chip size="small" color={m.role === 'user' ? 'primary' : 'default'} label={m.role === 'user' ? '你' : '工作流'} />
                </Stack>
                <Markdown>{m.content}</Markdown>
              </Box>
            ))}
          </Stack>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onRequestClose}>关闭</Button>
        <Button variant="contained" onClick={handleRun} disabled={isRunning}>运行</Button>
      </DialogActions>
    </Dialog>
  );
};

export default DebugModal;
