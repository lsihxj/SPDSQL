import { useEffect, useState } from 'react'
import App from './pages/App'
import Login from './pages/Login'
import ErdNew from './pages/ErdNew'
import WorkflowEditor from './pages/WorkflowEditor'
import Settings from './pages/Settings'
import Register from './pages/Register'
import Users from './pages/Users'
import { setAuthToken } from './lib/api'

export default function AppRouter() {
  const [logged, setLogged] = useState(false)
  const [authChecked, setAuthChecked] = useState(false)
  const [route, setRoute] = useState<string>(window.location.hash || '')

  useEffect(() => {
    const token = localStorage.getItem('token') || ''
    const isValidJwt = (t: string) => {
      try {
        const parts = t.split('.')
        if (parts.length !== 3) return false
        const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
        const pad = b64.length % 4; const padStr = pad === 2 ? '==' : pad === 3 ? '=' : pad === 1 ? '' : ''
        if (pad === 1) return false
        const json = atob(b64 + padStr)
        const payload = JSON.parse(json || '{}')
        const exp = Number(payload.exp)
        if (Number.isFinite(exp)) {
          const now = Math.floor(Date.now() / 1000)
          if (now >= exp) return false
        }
        return true
      } catch { return false }
    }
    const ensureServerValid = async () => {
      const { api } = await import('./lib/api')
      // 限制最长等待，避免服务器未响应导致整页空白
      try {
        const resp = await api.get('/api/auth/me', { timeout: 2000, validateStatus: () => true })
        const ct = String(resp.headers?.['content-type'] || resp.headers?.['Content-Type'] || '').toLowerCase()
        const isJson = ct.includes('application/json')
        if (!isJson) return false
        const data = resp.data
        // 允许最小字段集通过：存在 username 或 role 即认为有效
        if (data && (typeof data.username === 'string' || typeof data.role === 'string')) return true
        return false
      } catch {
        return false
      }
    }

    (async () => {
      try {
        if (token && isValidJwt(token)) {
          setAuthToken(token)
          const ok = await ensureServerValid()
          if (ok) {
            setLogged(true)
          } else {
            try { localStorage.removeItem('token'); localStorage.removeItem('role'); localStorage.removeItem('username') } catch {}
            setAuthToken(null)
            setLogged(false)
          }
        } else {
          try { localStorage.removeItem('token'); localStorage.removeItem('role'); localStorage.removeItem('username') } catch {}
          setAuthToken(null)
          setLogged(false)
        }
      } catch {
        try { localStorage.removeItem('token'); localStorage.removeItem('role'); localStorage.removeItem('username') } catch {}
        setAuthToken(null)
        setLogged(false)
      } finally {
        setAuthChecked(true)
      }
    })()

    const onHash = () => setRoute(window.location.hash || '')
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  // 在鉴权完成前显示轻量占位，避免纯空白
  if (!authChecked) {
    return (
      <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',color:'#666',fontFamily:'system-ui,Segoe UI,Roboto'}}>
        正在加载…
      </div>
    )
  }

  if (!logged) {
    if (route === '#/register') return <Register />
    return <Login onLoggedIn={() => setLogged(true)} />
  }

  if (route === '#/erd') return <ErdNew />
  if (route === '#/workflow') return <WorkflowEditor />
  if (route === '#/settings') return <Settings />
  if (route === '#/users') return <Users />
  return <App key={route} />
}
