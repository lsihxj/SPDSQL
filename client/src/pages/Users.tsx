import { useEffect, useMemo, useState } from 'react'
import { Alert, Box, Button, Container, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Tooltip, Typography, Slider } from '@mui/material'
import AddIcon from '@mui/icons-material/PersonAdd'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import LockResetIcon from '@mui/icons-material/LockReset'
import HideImageIcon from '@mui/icons-material/HideImage'
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera'
import { api } from '@/lib/api'

interface UserRow { id: string; username: string; role: string; createdAt: string; avatarUrl?: string }

export default function Users() {
  const [rows, setRows] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [avatarTs, setAvatarTs] = useState<number>(0)
  const load = async (tsOverride?: number) => {
    try {
      setLoading(true); setError('')
      const { data } = await api.get('/api/users')
      const ts = typeof tsOverride === 'number' ? tsOverride : avatarTs
      const list = (data || []).map((u: UserRow) => ({ ...u, avatarUrl: u.avatarUrl ? `${u.avatarUrl}${ts ? `?t=${ts}` : ''}` : undefined }))
      setRows(list)
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || '加载失败')
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const [editOpen, setEditOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newConfirm, setNewConfirm] = useState('')
  const [editErr, setEditErr] = useState('')

  const openCreate = () => { setEditId(null); setUsername(''); setPassword(''); setConfirm(''); setNewPassword(''); setNewConfirm(''); setEditErr(''); setEditOpen(true) }
  const openEdit = (u: UserRow) => { setEditId(u.id); setUsername(u.username); setPassword(''); setConfirm(''); setNewPassword(''); setNewConfirm(''); setEditErr(''); setEditOpen(true) }

  const saveEdit = async () => {
    try {
      setEditErr('')
      if (!username.trim()) { setEditErr('用户名不能为空'); return }
      if (editId) {
        await api.put(`/api/users/${editId}`, { username })
        if (newPassword || newConfirm) {
          if (newPassword !== newConfirm) { setEditErr('两次新密码不一致'); return }
          if (newPassword.length < 6) { setEditErr('新密码长度至少6位'); return }
          await api.post(`/api/users/${editId}/reset-password`, { newPassword })
        }
      } else {
        if (!password || password.length < 6) { setEditErr('密码长度至少6位'); return }
        if (password !== confirm) { setEditErr('两次密码不一致'); return }
        await api.post('/api/users', { username, password, role: 'Reader' })
      }
      setEditOpen(false)
      load()
    } catch (e: any) {
      setEditErr(e?.response?.data?.error || e?.message || '保存失败')
    }
  }

  const del = async (id: string) => {
    if (!confirm('确认删除该用户？')) return
    await api.delete(`/api/users/${id}`)
    load()
  }

  const resetPwd = async (id: string) => {
    const pwd = prompt('请输入新密码（不少于6位）：') || ''
    if (!pwd || pwd.length < 6) return
    await api.post(`/api/users/${id}/reset-password`, { newPassword: pwd })
    alert('密码已重置')
  }

  // 头像裁剪/压缩对话框状态
  const [avatarDialogOpen, setAvatarDialogOpen] = useState(false)
  const [avatarUserId, setAvatarUserId] = useState<string>('')
  const [imageSrc, setImageSrc] = useState<string>('')
  const [scale, setScale] = useState<number>(1)
  const [offsetX, setOffsetX] = useState<number>(0)
  const [offsetY, setOffsetY] = useState<number>(0)
  const canvasSize = 256
  const imgRef = useState<HTMLImageElement | null>(null)[0]

  const openAvatarDialog = (userId: string, file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      setImageSrc(String(reader.result || ''))
      setAvatarUserId(userId)
      setScale(1); setOffsetX(0); setOffsetY(0)
      setAvatarDialogOpen(true)
    }
    reader.readAsDataURL(file)
  }

  const renderToCanvas = async (): Promise<Blob | null> => {
    if (!imageSrc) return null
    return new Promise<Blob | null>((resolve) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')!
        canvas.width = canvasSize
        canvas.height = canvasSize
        // 计算绘制尺寸与偏移：基础等比缩放 + 偏移百分比
        const baseScale = Math.max(canvasSize / img.width, canvasSize / img.height)
        const s = baseScale * scale
        const drawW = img.width * s
        const drawH = img.height * s
        const dx = (canvasSize - drawW) / 2 + (offsetX / 100) * (canvasSize / 2)
        const dy = (canvasSize - drawH) / 2 + (offsetY / 100) * (canvasSize / 2)
        ctx.clearRect(0, 0, canvasSize, canvasSize)
        ctx.drawImage(img, dx, dy, drawW, drawH)
        canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.9)
      }
      img.onerror = () => resolve(null)
      img.src = imageSrc
    })
  }

  const uploadCropped = async () => {
    const blob = await renderToCanvas()
    if (!blob) { alert('裁剪失败'); return }
    const form = new FormData()
    form.append('file', new File([blob], 'avatar.jpg', { type: 'image/jpeg' }))
    await api.post(`/api/users/${avatarUserId}/avatar`, form, { headers: { 'Content-Type': 'multipart/form-data' } })
    try { localStorage.setItem('avatar_updated_ts', String(Date.now())); window.dispatchEvent(new Event('avatar-updated')) } catch {}
    setAvatarDialogOpen(false)
    setImageSrc('')
    const ts = Date.now()
    setAvatarTs(ts)
    await load(ts)
  }

  return (
    <Container maxWidth="md" sx={{ py: 2 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" mb={2}>
        <Typography variant="h6">用户管理</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>新增用户</Button>
      </Stack>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>头像</TableCell>
              <TableCell>用户名</TableCell>
              <TableCell>角色</TableCell>
              <TableCell>创建时间</TableCell>
              <TableCell align="right">操作</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map(r => (
              <TableRow key={r.id}>
                <TableCell>
                  <img src={r.avatarUrl || '/default-avatar.svg'} alt="avatar" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }} onError={(e) => { const img = e.currentTarget as HTMLImageElement; if (img.dataset.fallback !== '1') { img.dataset.fallback = '1'; img.onerror = null; img.src = '/default-avatar.svg' } }} />
                </TableCell>
                <TableCell>{r.username}</TableCell>
                <TableCell>{r.role}</TableCell>
                <TableCell>{new Date(r.createdAt).toLocaleString()}</TableCell>
                <TableCell align="right">
                  <Tooltip title="上传头像/裁剪">
                    <IconButton component="label" size="small">
                      <PhotoCameraIcon />
                      <input hidden type="file" accept="image/*" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; openAvatarDialog(r.id, f); (e.target as HTMLInputElement).value = '' }} />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="编辑用户"><IconButton onClick={() => openEdit(r)} size="small"><EditIcon /></IconButton></Tooltip>
                  <Tooltip title="移除头像"><IconButton onClick={async () => { await api.delete(`/api/users/${r.id}/avatar`); try { localStorage.setItem('avatar_updated_ts', String(Date.now())); window.dispatchEvent(new Event('avatar-updated')) } catch {} const ts = Date.now(); setAvatarTs(ts); load(ts) }} size="small"><HideImageIcon /></IconButton></Tooltip>
                  <Tooltip title="重置密码"><IconButton onClick={() => resetPwd(r.id)} size="small"><LockResetIcon /></IconButton></Tooltip>
                  <Tooltip title="删除用户"><IconButton onClick={() => del(r.id)} size="small" color="error"><DeleteIcon /></IconButton></Tooltip>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={editOpen} onClose={() => setEditOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>{editId ? '编辑用户' : '新增用户'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="用户名" value={username} onChange={e => setUsername(e.target.value)} />
            {editId ? (
              <>
                <TextField type="password" label="新密码（可选）" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
                <TextField type="password" label="确认新密码" value={newConfirm} onChange={e => setNewConfirm(e.target.value)} />
                <Stack direction="row" spacing={1} alignItems="center">
                  <Button component="label" variant="outlined">
                    上传头像/裁剪
                    <input hidden type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f && editId) { openAvatarDialog(editId, f); (e.target as HTMLInputElement).value = '' } }} />
                  </Button>
                </Stack>
              </>
            ) : (
              <>
                <TextField type="password" label="密码" value={password} onChange={e => setPassword(e.target.value)} />
                <TextField type="password" label="确认密码" value={confirm} onChange={e => setConfirm(e.target.value)} />
              </>
            )}
            {editErr && <Alert severity="error">{editErr}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditOpen(false)}>取消</Button>
          <Button onClick={saveEdit} variant="contained">保存</Button>
        </DialogActions>
      </Dialog>

      {/* 头像裁剪对话框 */}
      <Dialog open={avatarDialogOpen} onClose={() => setAvatarDialogOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>裁剪头像</DialogTitle>
        <DialogContent>
          {imageSrc ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <Box sx={{ width: 256, height: 256, borderRadius: '50%', overflow: 'hidden', border: '1px solid #ddd' }}>
                {/* 简易预览：实时渲染到 <img> 由 canvas 逻辑负责导出 */}
                <img src={imageSrc} alt="preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </Box>
              <Stack spacing={1} sx={{ width: '100%', mt: 1 }}>
                <Typography variant="body2">缩放</Typography>
                <Slider min={1} max={3} step={0.01} value={scale} onChange={(_, v) => setScale(v as number)} />
                <Typography variant="body2">水平偏移</Typography>
                <Slider min={-100} max={100} step={1} value={offsetX} onChange={(_, v) => setOffsetX(v as number)} />
                <Typography variant="body2">垂直偏移</Typography>
                <Slider min={-100} max={100} step={1} value={offsetY} onChange={(_, v) => setOffsetY(v as number)} />
              </Stack>
            </Box>
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAvatarDialogOpen(false)}>取消</Button>
          <Button variant="contained" onClick={uploadCropped}>裁剪并上传</Button>
        </DialogActions>
      </Dialog>
    </Container>
  )
}
