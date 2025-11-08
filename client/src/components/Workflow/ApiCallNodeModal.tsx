import React from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, MenuItem, Stack, Box, Typography, Tooltip, IconButton } from '@mui/material';
import InputIcon from '@mui/icons-material/Input';

interface ApiCallNodeModalProps {
  node: any;
  isOpen: boolean;
  onRequestClose: () => void;
  onSave: (data: any) => void;
}

const ApiCallNodeModal: React.FC<ApiCallNodeModalProps> = ({ node, isOpen, onRequestClose, onSave }) => {
  const [data, setData] = React.useState(node.data || {});
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
    onSave(data);
    onRequestClose();
  };

  return (
    <Dialog open={isOpen} onClose={onRequestClose} maxWidth="sm" fullWidth>
      <DialogTitle>API Call Node Configuration</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} component="form" onSubmit={handleSubmit}>
          <TextField label="URL" name="url" value={data.url || ''} onChange={handleChange} fullWidth />
          <TextField select label="Method" name="method" value={data.method || 'GET'} onChange={handleChange} fullWidth>
            <MenuItem value="GET">GET</MenuItem>
            <MenuItem value="POST">POST</MenuItem>
            <MenuItem value="PUT">PUT</MenuItem>
            <MenuItem value="DELETE">DELETE</MenuItem>
          </TextField>

          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              可用变量：{'{{input}}'}（上一节点输出）
            </Typography>
            <Tooltip title="引入上一节点输出" placement="left">
              <IconButton size="small" onClick={insertInputVar}>
                <InputIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>

          <TextField 
            label="Headers" 
            name="headers" 
            value={data.headers || ''} 
            onChange={handleChange} 
            onFocus={handleFocus} 
            onSelect={handleSelect as any}
            fullWidth 
            multiline 
            minRows={3} 
          />
          <TextField 
            label="Body" 
            name="body" 
            value={data.body || ''} 
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

export default ApiCallNodeModal;
