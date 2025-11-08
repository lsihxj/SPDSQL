import React from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, MenuItem, Stack, Box, Typography, Tooltip, IconButton } from '@mui/material';
import InputIcon from '@mui/icons-material/Input';

interface LlmNodeModalProps {
  node: any;
  isOpen: boolean;
  onRequestClose: () => void;
  onSave: (data: any) => void;
}

const LlmNodeModal: React.FC<LlmNodeModalProps> = ({ node, isOpen, onRequestClose, onSave }) => {
  // 初始化时兼容旧字段（modelId），若存在则尽可能映射到新结构字段
  const initialData = React.useMemo(() => {
    const d = node.data || {}
    if (!d.providerId && !d.model && d.modelId) {
      try {
        const old = JSON.parse(localStorage.getItem('ai_models') || '[]') as any[]
        const mm = old.find(x => x.id === d.modelId)
        if (mm) {
          return {
            ...d,
            providerId: '', // 旧结构无 provider，留空由用户选择
            model: mm.model || '',
            temperature: d.temperature ?? mm.temperature ?? 0.2,
            systemPrompt: d.systemPrompt || mm.systemPrompt || '',
            userPrompt: d.userPrompt || mm.userPrompt || ''
          }
        }
      } catch {}
    }
    return d
  }, [node])

  const [data, setData] = React.useState<any>(initialData);
  const [activeField, setActiveField] = React.useState<string | null>(null);
  const selectionRef = React.useRef<{ start: number; end: number } | null>(null);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target
    setData((prev: any) => ({ ...prev, [name]: value }));
  };

  const handleFocus = (event: React.FocusEvent<HTMLInputElement>) => {
    setActiveField(event.target.name);
  };

  const handleSelect = (event: React.SyntheticEvent) => {
    const target = event.target as HTMLInputElement
    if (typeof target.selectionStart === 'number' && typeof target.selectionEnd === 'number') {
      selectionRef.current = { start: target.selectionStart, end: target.selectionEnd }
    }
  };

  const insertInputVar = () => {
    const field = activeField as keyof typeof data | null
    if (!field) return
    const original = String((data as any)[field] || '')
    const sel = selectionRef.current || { start: original.length, end: original.length }
    const next = original.slice(0, sel.start) + '{{input}}' + original.slice(sel.end)
    setData((prev: any) => ({ ...prev, [field]: next }))
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    // 仅保存新结构字段，保留其他原有数据
    const toSave = {
      ...data,
      modelId: undefined // 不再使用旧字段
    }
    onSave(toSave);
    onRequestClose();
  };
  return (
    <Dialog open={isOpen} onClose={onRequestClose} maxWidth="sm" fullWidth>
      <DialogTitle>LLM Node Configuration</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} component="form" onSubmit={handleSubmit}>
          {/* 先选择模型提供商（来自设置） */}
          <TextField select label="模型提供商（来自设置）" name="providerId" value={data.providerId || ''} onChange={handleChange} fullWidth>
            {(JSON.parse(localStorage.getItem('ai_providers') || '[]') as any[]).map((p: any) => (
              <MenuItem key={p.id} value={p.id}>{p.name || p.id}</MenuItem>
            ))}
          </TextField>

          {/* 再输入具体模型名 */}
          <TextField 
            label="模型名" 
            name="model" 
            value={data.model || ''} 
            onChange={handleChange} 
            fullWidth 
          />

          <TextField 
            label="Temperature" 
            name="temperature" 
            type="number" 
            inputProps={{ step: 0.1 }} 
            value={data.temperature ?? 0.2} 
            onChange={handleChange} 
            fullWidth 
          />

          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              可用变量：{'{{input}}'}（上一节点输出）/ {'{{output}}'}（仅输出节点固定）
            </Typography>
            <Tooltip title="引入上一节点输出" placement="left">
              <IconButton size="small" onClick={insertInputVar}>
                <InputIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>

          <TextField 
            label="System Prompt" 
            name="systemPrompt" 
            value={data.systemPrompt || ''} 
            onChange={handleChange} 
            onFocus={handleFocus} 
            onSelect={handleSelect as any}
            fullWidth 
            multiline 
            minRows={3} 
          />
          <TextField 
            label="User Prompt" 
            name="userPrompt" 
            value={data.userPrompt || ''} 
            onChange={handleChange} 
            onFocus={handleFocus} 
            onSelect={handleSelect as any}
            fullWidth 
            multiline 
            minRows={3} 
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onRequestClose}>Cancel</Button>
        <Button type="submit" variant="contained" onClick={handleSubmit as any}>Save</Button>
      </DialogActions>
    </Dialog>
  );
};

export default LlmNodeModal;
