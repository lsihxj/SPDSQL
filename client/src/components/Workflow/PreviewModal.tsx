import React from 'react';
import { Drawer, Toolbar, AppBar, Typography, Button, TextField, Box, Stack, Avatar, IconButton } from '@mui/material';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import CloseIcon from '@mui/icons-material/Close';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import { keyframes } from '@mui/system';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github.css';

// 安全包装：将 children 统一转为字符串，避免对象/ReactElement 导致渲染错误
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

interface PreviewModalProps {
  isOpen: boolean;
  onRequestClose: () => void;
  workflow: any;
}

type ChatMessage = { id: string; role: 'user' | 'assistant'; content: string; isTyping?: boolean };

type ExecuteResult = {
  output?: any;
  context?: { output?: any };
  trace?: Array<any>;
};

// 粗粒度处理：若检测为 SQL，尝试为 PostgreSQL 标识符加双引号
function ensureQuotedIfSQL(text: string): string {
  if (!text) return text;
  const head = text.trim().slice(0, 40).toUpperCase();
  const looksLikeSQL = /(SELECT|INSERT|UPDATE|DELETE|WITH)\b/.test(head) || /\bFROM\b|\bJOIN\b/i.test(text);
  if (!looksLikeSQL) return text;

  // 1) 处理 FROM/JOIN 后的表（可含 schema.table），保留别名/AS
  const quotePath = (p: string) => p.split('.').map(seg => {
    const s = seg.trim();
    if (!s) return s;
    if (s.startsWith('"') && s.endsWith('"')) return s; // 已有引号
    return `"${s}"`;
  }).join('.')

  let out = text
    .replace(/\b(FROM|JOIN)\s+([A-Za-z_][A-Za-z0-9_]*)(?:\.([A-Za-z_][A-Za-z0-9_]*))?(\s+AS\s+([A-Za-z_][A-Za-z0-9_]*))?/gi, (_m, kw, t1, t2, asPart, alias) => {
      const qp = t2 ? `${quotePath(`${t1}.${t2}`)}` : `${quotePath(t1)}`;
      return `${kw} ${qp}${asPart || ''}`;
    })
    // 兼容无 AS 的别名: FROM t a / JOIN t b
    .replace(/\b(FROM|JOIN)\s+([A-Za-z_][A-Za-z0-9_]*)(?:\.([A-Za-z_][A-Za-z0-9_]*))?\s+([A-Za-z_][A-Za-z0-9_]*)/gi, (_m, kw, t1, t2, alias) => {
      const qp = t2 ? `${quotePath(`${t1}.${t2}`)}` : `${quotePath(t1)}`;
      // 避免把 ON/USING 误判为 alias
      if (/^(ON|USING)$/i.test(alias)) return `${kw} ${qp} ${alias}`;
      return `${kw} ${qp} ${alias}`;
    });

  // 2) 处理 table.column、schema.table.column 的字段引用（不处理已在双引号内的）
  out = out.replace(/\b([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)(?:\.([A-Za-z_][A-Za-z0-9_]*))?\b/g, (_m, a, b, c) => {
    // 跳过已经带引号的
    if ((a.startsWith('"') && a.endsWith('"')) || (b.startsWith('"') && b.endsWith('"')) || (c && c.startsWith('"') && c.endsWith('"'))) {
      return _m;
    }
    const parts = c ? [a, b, c] : [a, b];
    return parts.map(seg => `"${seg}"`).join('.');
  });

  return out;
}

const dots = keyframes`
  0% { opacity: .2; transform: translateY(0); }
  20% { opacity: 1; transform: translateY(-2px); }
  100% { opacity: .2; transform: translateY(0); }
`;

const PreviewModal: React.FC<PreviewModalProps> = ({ isOpen, onRequestClose, workflow }) => {
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const [input, setInput] = React.useState<string>(() => {
    try { return localStorage.getItem('wf_preview_input') || '' } catch { return '' }
  });
  const [messages, setMessages] = React.useState<ChatMessage[]>(() => {
    try { return JSON.parse(localStorage.getItem('wf_preview_messages') || '[]') || [] } catch { return [] }
  });
  const [isSending, setIsSending] = React.useState(false);

  React.useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isOpen]);

  React.useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    try { localStorage.setItem('wf_preview_messages', JSON.stringify(messages)) } catch {}
  }, [messages]);

  const injectModelsToWorkflow = (wf: any) => {
    try {
      const providers = JSON.parse(localStorage.getItem('ai_providers') || '[]') as any[];
      const modelsOld = JSON.parse(localStorage.getItem('ai_models') || '[]') as any[]; // 兼容旧版
      const wfToRun = JSON.parse(JSON.stringify(wf || { nodes: [], edges: [] }));
      if (Array.isArray(wfToRun.nodes)) {
        for (const n of wfToRun.nodes) {
          const kind = n?.data?.kind;
          if (kind === 'llm') {
            const providerId = n?.data?.providerId;
            const modelName = n?.data?.model;
            if (providerId) {
              const p = providers.find((x: any) => x.id === providerId);
              if (p) {
                n.data.baseUrl = p.baseUrl || p.BaseUrl || '';
                n.data.apiKey = p.apiKey || p.ApiKey || '';
                if (modelName) n.data.model = modelName;
              }
            } else {
              // 兼容旧的 modelId 逻辑
              const mid = n?.data?.modelId;
              const m = modelsOld.find((x: any) => x.id === mid);
              if (m) {
                n.data.baseUrl = m.baseUrl || m.BaseUrl || '';
                n.data.apiKey = m.apiKey || m.ApiKey || '';
                n.data.model = m.model || m.Model || '';
              }
            }
          }
        }
      }
      return wfToRun;
    } catch {
      return wf;
    }
  };

  const runOnce = async (question: string) => {
    setIsSending(true);
    // 插入“思考中”助手气泡，占位并用于流式追加
    const typingId = `typing_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    setMessages(prev => prev.concat({ id: typingId, role: 'assistant', content: '', isTyping: true }));

    const appendToTyping = (delta: string) => {
      if (!delta) return;
      setMessages(prev => prev.map(m => (m.id === typingId ? { ...m, content: (m.content || '') + delta } : m)));
    };

    try {
      const wfToRun = injectModelsToWorkflow(workflow);
      const h: Record<string, string> = {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream, application/json;q=0.9, text/plain;q=0.8'
      };
      const t = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
      if (t) h['Authorization'] = `Bearer ${t}`;
      const response = await fetch('/api/workflow/execute', {
        method: 'POST',
        headers: h,
        body: JSON.stringify({ ...wfToRun, InitialInput: question }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const contentType = (response.headers.get('content-type') || '').toLowerCase();

      // SSE: text/event-stream 流式解析（支持 trace 与 delta 事件）
      if (contentType.includes('text/event-stream')) {
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        const flushEvent = (raw: string) => {
          // 解析一个完整的 SSE 事件块（由空行分隔）
          const lines = raw.split(/\r?\n/);
          let eventName: string | undefined;
          const dataLines: string[] = [];
          for (const line of lines) {
            if (line.startsWith('event:')) {
              eventName = line.slice(6).trim();
            } else if (line.startsWith('data:')) {
              dataLines.push(line.slice(5).trim());
            }
          }
          const dataStr = dataLines.join('\n');
          if (!dataStr) return;
          try {
            const payload = JSON.parse(dataStr);
            // 可能的事件：trace 进度、delta 增量、done 结束或包含最终 output
            if (eventName === 'trace' || payload?.event === 'trace') {
              const nid = payload?.nodeId || payload?.id;
              if (nid) {
                const progEvt = new CustomEvent('wf:execution-progress', { detail: { nodeId: String(nid) } });
                window.dispatchEvent(progEvt);
              }
              return;
            }
            if (eventName === 'start' || payload?.event === 'start') {
              window.dispatchEvent(new CustomEvent('wf:execution-start'));
              return;
            }
            if (eventName === 'end' || payload?.event === 'end' || payload?.done) {
              window.dispatchEvent(new CustomEvent('wf:execution-end'));
              // 若带有最终 output，也一并处理
              const finalOutput = payload?.output ?? payload?.context?.output;
              if (finalOutput !== undefined) {
                const contentRaw = typeof finalOutput === 'string' ? finalOutput : JSON.stringify(finalOutput, null, 2);
                const content = ensureQuotedIfSQL(contentRaw);
                setMessages(prev => prev.map(m => (m.id === typingId ? { ...m, content, isTyping: false } : m)));
              } else {
                setMessages(prev => prev.map(m => (m.id === typingId ? { ...m, isTyping: false } : m)));
              }
              return;
            }
            // 增量文本（常见字段：delta/content/text）
            const delta = payload?.delta ?? payload?.content ?? payload?.text ?? '';
            if (delta) appendToTyping(String(delta));
          } catch {
            // 非 JSON data，当作纯文本增量
            appendToTyping(dataStr);
          }
        };

        if (!reader) {
          // 无法获取 reader，则回退为文本整体读取
          const text = await response.text();
          appendToTyping(text);
          setMessages(prev => prev.map(m => (m.id === typingId ? { ...m, isTyping: false } : m)));
        } else {
          // 派发开始事件，播放前清空高亮
          window.dispatchEvent(new CustomEvent('wf:execution-start'));
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            // 按 \n\n 分割完整事件块
            const parts = buffer.split(/\n\n/);
            buffer = parts.pop() || '';
            for (const part of parts) {
              flushEvent(part);
            }
          }
          // 处理尾部剩余数据
          if (buffer.trim()) flushEvent(buffer);
          // 结束（若未收到 end 事件，也确保关闭 typing 状态）
          window.dispatchEvent(new CustomEvent('wf:execution-end'));
          setMessages(prev => prev.map(m => (m.id === typingId ? { ...m, isTyping: false } : m)));
        }
        return;
      }

      // 非 SSE：若是 JSON，一次性处理（含 trace 回放）；否则按文本流或整体文本
      if (contentType.includes('application/json')) {
        const result: ExecuteResult = await response.json();
        const trace: Array<any> = Array.isArray((result as any)?.trace) ? (result as any).trace : [];
        if (trace.length > 0) {
          const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));
          const startEvt = new CustomEvent('wf:execution-start');
          window.dispatchEvent(startEvt);
          for (const item of trace) {
            const nid = item?.nodeId;
            if (nid) {
              const progEvt = new CustomEvent('wf:execution-progress', { detail: { nodeId: String(nid) } });
              window.dispatchEvent(progEvt);
              await sleep(400);
            }
          }
          const endEvt = new CustomEvent('wf:execution-end');
          window.dispatchEvent(endEvt);
        } else {
          window.dispatchEvent(new CustomEvent('wf:execution-start'));
          window.dispatchEvent(new CustomEvent('wf:execution-end'));
        }
        const finalOutput = (result as any)?.output ?? (result as any)?.context?.output ?? '';
        const contentRaw = typeof finalOutput === 'string' ? finalOutput : JSON.stringify(finalOutput, null, 2);
        const content = ensureQuotedIfSQL(contentRaw);
        setMessages(prev => prev.map(m => (m.id === typingId ? { ...m, content, isTyping: false } : m)));
        return;
      }

      // 纯文本（分块或整体）
      if (response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        window.dispatchEvent(new CustomEvent('wf:execution-start'));
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          appendToTyping(decoder.decode(value, { stream: true }));
        }
        window.dispatchEvent(new CustomEvent('wf:execution-end'));
        setMessages(prev => prev.map(m => (m.id === typingId ? { ...m, isTyping: false } : m)));
      } else {
        const text = await response.text();
        appendToTyping(text);
        setMessages(prev => prev.map(m => (m.id === typingId ? { ...m, isTyping: false } : m)));
      }
    } catch (e) {
      setMessages(prev => prev.map(m => (m.id === typingId ? { ...m, content: `出错：${String(e)}`, isTyping: false } : m)));
    } finally {
      setIsSending(false);
    }
  };


  const handleSend = async () => {
    const q = (input || '').trim();
    if (!q || isSending) return;
    const userId = `user_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    setMessages(prev => prev.concat({ id: userId, role: 'user', content: q }));
    setInput('');
    try { localStorage.setItem('wf_preview_input', '') } catch {}
    await runOnce(q);
  };

  const handleKeyDown: React.KeyboardEventHandler<HTMLDivElement> = (e) => {
    // Enter 发送，Shift+Enter 换行
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const TypingDots = ({ light = false }: { light?: boolean }) => (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.6 }}>
      {[0, 1, 2].map(i => (
        <Box key={i} sx={{
          width: 6, height: 6, borderRadius: '50%',
          bgcolor: light ? 'rgba(255,255,255,0.9)' : '#6b7280',
          animation: `${dots} 1.4s ${i * 0.2}s infinite ease-in-out`
        }} />
      ))}
    </Box>
  );

  const renderBubble = (m: ChatMessage, idx: number) => {
    const isUser = m.role === 'user';
    const isTyping = !!m.isTyping;
    return (
      <Stack key={m.id || idx} direction="row" spacing={1.2} sx={{ width: '100%', justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
        {!isUser && (
          <Avatar sx={{ bgcolor: '#1e88e5', width: 28, height: 28 }}>
            <SmartToyIcon sx={{ fontSize: 18 }} />
          </Avatar>
        )}
        <Box
          sx={{
            maxWidth: '72%',
            px: 1.5,
            py: 1,
            borderRadius: isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
            bgcolor: isUser ? '#1e88e5' : '#f5f7fb',
            color: isUser ? '#fff' : '#1a1a1a',
            boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            fontSize: 14,
            lineHeight: 1.6,
            minHeight: 28,
            display: 'flex',
            alignItems: 'center'
          }}
        >
          {isTyping ? (
  <>
    <Box sx={{ flex: 1 }}>
      <Markdown>{m.content}</Markdown>
    </Box>
    <Box sx={{ ml: 0.5 }}><TypingDots light={isUser} /></Box>
  </>
) : (
  <Markdown>{m.content}</Markdown>
)}
        </Box>
        {isUser && (
          <Avatar sx={{ bgcolor: '#9e9e9e', width: 28, height: 28 }}>
            <PersonOutlineIcon sx={{ fontSize: 18 }} />
          </Avatar>
        )}
      </Stack>
    );
  };

  return (
    <Drawer anchor="right" open={isOpen} variant="persistent" PaperProps={{ sx: { width: '30vw', minWidth: 340, top: 64, height: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column', overflow: 'hidden' } }}>
      <AppBar position="static" color="default" elevation={0} sx={{ borderBottom: '1px solid #e6eaf5' }}>
        <Toolbar sx={{ minHeight: 56 }}>
          <Typography variant="subtitle1" sx={{ flex: 1 }}>预览对话</Typography>
          <IconButton aria-label="close" onClick={onRequestClose}>
            <CloseIcon />
          </IconButton>
        </Toolbar>
      </AppBar>
      <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        {/* 消息列表 */}
        <Box ref={scrollRef} sx={{ flex: 1, minHeight: 0, overflowY: 'auto', p: 2, background: 'linear-gradient(180deg, #fbfcff 0%, #f6f8fd 100%)' }}>
          <Stack spacing={1.5}>
            {messages.map((m, idx) => renderBubble(m, idx))}
          </Stack>
        </Box>
        {/* 底部输入区 */}
        <Box sx={{ borderTop: '1px solid #e6eaf5', p: 1.5, background: '#fff' }}>
          <Stack direction="row" spacing={1} alignItems="flex-end">
            <TextField
              inputRef={inputRef}
              placeholder="给工作流发送消息（Enter 发送，Shift+Enter 换行）"
              value={input}
              onChange={(e) => { setInput(e.target.value); try { localStorage.setItem('wf_preview_input', e.target.value) } catch {} }}
              onKeyDown={handleKeyDown}
              fullWidth
              multiline
              minRows={1}
              maxRows={6}
            />
            <Button variant="contained" onClick={handleSend} disabled={isSending}>
              发送
            </Button>
          </Stack>
        </Box>
      </Box>
    </Drawer>
  );
};

export default PreviewModal;