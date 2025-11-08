import { useState } from 'react'
import { Box, Button, Container, Paper, Stack, TextField, Typography, Alert } from '@mui/material'
import { api } from '@/lib/api'

export default function Register() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async () => {
    setErr(''); setMsg('')
    if (!username.trim() || !password) { setErr('请输入用户名与密码'); return }
    if (password !== confirm) { setErr('两次输入的密码不一致'); return }
    try {
      setLoading(true)
      await api.post('/api/auth/register', { username, password })
      setMsg('注册成功，请返回登录页登录')
    } catch (e: any) {
      const m = e?.response?.data?.error || '注册失败'
      setErr(m)
    } finally { setLoading(false) }
  }

  return (
    <Container maxWidth="xs" sx={{ display: 'flex', alignItems: 'center', minHeight: '100vh' }}>
      <Paper sx={{ p: 3, width: '100%' }}>
        <Typography variant="h6" gutterBottom>注册</Typography>
        <Stack spacing={2}>
          <TextField label="用户名" value={username} onChange={e => setUsername(e.target.value)} />
          <TextField type="password" label="密码" value={password} onChange={e => setPassword(e.target.value)} />
          <TextField type="password" label="确认密码" value={confirm} onChange={e => setConfirm(e.target.value)} />
          {err && <Alert severity="error">{err}</Alert>}
          {msg && <Alert severity="success">{msg}</Alert>}
          <Stack direction="row" spacing={1}>
            <Button variant="contained" onClick={submit} disabled={loading}>注册</Button>
            <Box flex={1} />
            <Button onClick={() => { window.location.hash = '' }}>返回登录</Button>
          </Stack>
        </Stack>
      </Paper>
    </Container>
  )
}
