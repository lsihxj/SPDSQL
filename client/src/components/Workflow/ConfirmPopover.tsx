import React from 'react'
import { Button, Popover, Stack, Typography } from '@mui/material'

export default function ConfirmPopover({ anchorEl, open, onClose, onConfirm, text = '确认删除吗？' }: { anchorEl: HTMLElement | null, open: boolean, onClose: () => void, onConfirm: () => void, text?: string }) {
  return (
    <Popover open={open} anchorEl={anchorEl} onClose={onClose} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}>
      <Stack direction="row" spacing={1} sx={{ p: 1, alignItems: 'center' }}>
        <Typography variant="body2" sx={{ px: .5 }}>{text}</Typography>
        <Button size="small" onClick={onClose}>取消</Button>
        <Button size="small" color="error" variant="contained" onClick={onConfirm}>删除</Button>
      </Stack>
    </Popover>
  )
}
