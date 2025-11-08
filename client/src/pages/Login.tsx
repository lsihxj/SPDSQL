import { useState } from 'react'
import { Box, Button, Container, Paper, Stack, TextField, Typography } from '@mui/material'
import { api, setAuthToken } from '@/lib/api'

export default function Login({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('admin123')
  const [err, setErr] = useState('')

  const login = async () => {
    try {
      const { data } = await api.post('/api/auth/login', { username, password })
      const token = data.token ?? data.Token
      const role = data.role ?? data.Role
      const uname = data.username ?? data.Username ?? username
      if (!token) throw new Error('无效的登录响应：缺少 token')
      localStorage.setItem('token', token)
      if (role) localStorage.setItem('role', role)
      localStorage.setItem('username', uname)
      setAuthToken(token)
      onLoggedIn()
    } catch (e: any) {
      setErr('登录失败')
    }
  }

  return (
    <Container maxWidth="xs" sx={{ display: 'flex', alignItems: 'center', minHeight: '100vh' }}>
      <Paper sx={{ p: 3, width: '100%' }}>
        <Typography variant="h6" gutterBottom>登录</Typography>
        <Stack spacing={2}>
          <TextField label="用户名" value={username} onChange={e => setUsername(e.target.value)} />
          <TextField type="password" label="密码" value={password} onChange={e => setPassword(e.target.value)} />
          {err && <Typography color="error">{err}</Typography>}
          <Stack direction="row" spacing={1}>
            <Button variant="contained" onClick={login}>登录</Button>
            <Box flex={1} />
            <Button onClick={() => { window.location.hash = '#/register' }}>注册账号</Button>
          </Stack>
        </Stack>
      </Paper>
    </Container>
  )
}
