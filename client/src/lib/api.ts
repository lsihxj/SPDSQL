import axios from 'axios'

const api = axios.create({
  baseURL: '',
  withCredentials: false
})

// 初始化时注入本地 token
const initialToken = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null
if (initialToken) {
  api.defaults.headers.common['Authorization'] = `Bearer ${initialToken}`
}

export function setAuthToken(token: string | null) {
  if (token) {
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`
    try { localStorage.setItem('token', token) } catch {}
  } else {
    delete api.defaults.headers.common['Authorization']
    try { localStorage.removeItem('token') } catch {}
  }
}

// 统一请求拦截：附加 DB 头（若本地存有连接信息）
api.interceptors.request.use((config) => {
  try {
    const db = JSON.parse(localStorage.getItem('db_connection') || 'null')
    if (db && typeof db === 'object') {
      const headers: any = (config.headers ||= {})
      if (db.host) headers['x-db-host'] = String(db.host)
      if (db.port) headers['x-db-port'] = String(db.port)
      if (db.database) headers['x-db-database'] = String(db.database)
      if (db.username) headers['x-db-username'] = String(db.username)
      if (db.password) headers['x-db-password'] = String(db.password)
      if (db.ssl != null) headers['x-db-ssl'] = String(!!db.ssl)
    }
  } catch {}
  return config
})

// 统一响应拦截：未授权自动跳登录
api.interceptors.response.use(
  (resp) => resp,
  (error) => {
    const status = error?.response?.status
    if (status === 401) {
      try {
        localStorage.removeItem('token')
        localStorage.removeItem('role')
        // 保留 username 也可以清理，这里清理以避免脏状态
        localStorage.removeItem('username')
      } catch {}
      // 使用 hash 路由跳转登录
      if (typeof window !== 'undefined') {
        window.location.hash = ''
        // 强制刷新以重置内存态（如 AppRouter.logged）
        setTimeout(() => window.location.reload(), 50)
      }
    }
    return Promise.reject(error)
  }
)

export { api }
