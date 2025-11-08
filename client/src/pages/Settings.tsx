import { useEffect, useMemo, useRef, useState } from 'react'
import { Box, Button, Container, FormControlLabel, Switch, TextField, Typography, MenuItem, Dialog, DialogTitle, DialogContent, DialogActions, AppBar, Toolbar, Menu, Divider } from '@mui/material'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import { api } from '@/lib/api'

interface ProviderConfig {
  id: string
  name: string
  baseUrl: string
  apiKey: string
}

interface ModelV2Config {
  id: string
  name: string
  providerId: string
  model: string
  temperature: number
  systemPrompt: string
  userPrompt: string
}

interface ExecOptions { readOnly: boolean; useTransaction: boolean; maxRows: number; timeoutSeconds: number }

export default function Settings({ onOptions = () => {} }: { onOptions?: (opts: ExecOptions) => void }) {
  // 执行选项
  const [readOnly, setReadOnly] = useState(true)
  const [useTx, setUseTx] = useState(false)
  const [maxRows, setMaxRows] = useState(1000)
  const [timeoutSeconds, setTimeoutSeconds] = useState(30)

  // 数据库连接（从 .env 读取并可写回）
  const [dbConn, setDbConn] = useState<any>(() => {
    try { return JSON.parse(localStorage.getItem('db_connection') || '{}') || {} } catch { return {} }
  })

  const [serverStatus, setServerStatus] = useState<{ ok: boolean; message?: string }>({ ok: false })
  const [errorDialogOpen, setErrorDialogOpen] = useState(false)
  const [errorDialogText, setErrorDialogText] = useState('')
  const backendBase = useMemo(() => `${window.location.origin}/api`, [])
  const backendTarget = useMemo(() => `${window.location.protocol}//${window.location.hostname}:5129`, [])

  // 提供商与模型（新结构）
  const [providers, setProviders] = useState<ProviderConfig[]>([])
  const [modelsV2, setModelsV2] = useState<ModelV2Config[]>([])
  const [editingProvider, setEditingProvider] = useState<ProviderConfig | null>(null)
  const [editingModel, setEditingModel] = useState<ModelV2Config | null>(null)

  // 编辑模型对话框：插入变量支持
  const [activeField, setActiveField] = useState<'system' | 'user'>('system')
  const systemInputRef = useRef<HTMLTextAreaElement | null>(null)
  const userInputRef = useRef<HTMLTextAreaElement | null>(null)
  const [varMenuAnchor, setVarMenuAnchor] = useState<null | HTMLElement>(null)
  const varMenuOpen = Boolean(varMenuAnchor)
  const variableOptions = [
    { value: '{{instruction}}', label: 'instruction（优化目标/说明）' },
    { value: '{{selectedText}}', label: 'selectedText（选中 SQL/文本）' },
    { value: '{{sqlText}}', label: 'sqlText（全部 SQL）' },
    { value: '{{schema}}', label: 'schema（数据库结构 JSON）' },
    { value: '{{error}}', label: 'error（最近一次执行错误）' },
  ] as const
  const openVarMenu = (e: React.MouseEvent<HTMLButtonElement>) => setVarMenuAnchor(e.currentTarget)
  const closeVarMenu = () => setVarMenuAnchor(null)
  const insertVariableAtCursor = (token: string) => {
    if (!editingModel) return
    const isSystem = activeField === 'system'
    const ref = isSystem ? systemInputRef.current : userInputRef.current
    const text = isSystem ? editingModel.systemPrompt : editingModel.userPrompt
    if (!ref) {
      const nt = `${text || ''}${token}`
      const next = isSystem ? { ...editingModel, systemPrompt: nt } : { ...editingModel, userPrompt: nt }
      setEditingModel(next)
      return
    }
    const start = (ref.selectionStart ?? text.length)
    const end = (ref.selectionEnd ?? text.length)
    const nt = `${text?.slice(0, start) || ''}${token}${text?.slice(end) || ''}`
    const next = isSystem ? { ...editingModel, systemPrompt: nt } : { ...editingModel, userPrompt: nt }
    setEditingModel(next)
    queueMicrotask(() => {
      try {
        const pos = start + token.length
        ref.focus()
        ref.setSelectionRange(pos, pos)
      } catch {}
    })
  }

  // 兼容读取旧 ai_models（单条含 baseUrl/apiKey）并迁移为 provider + modelV2
  useEffect(() => {
    // 初始化：加载 .env 中的 DB_* 到前端状态
    (async () => {
      try {
        const res = await api.get('/api/config/db')
        const envDb = res.data || {}
        const merged = { ...dbConn }
        if (envDb.host != null) merged.host = envDb.host
        if (envDb.port != null) merged.port = envDb.port
        if (envDb.database != null) merged.database = envDb.database
        if (envDb.username != null) merged.username = envDb.username
        if (envDb.password != null) merged.password = envDb.password
        if (envDb.ssl != null) merged.ssl = envDb.ssl
        setDbConn(merged)
        localStorage.setItem('db_connection', JSON.stringify(merged))
        setServerStatus({ ok: true })
      } catch (e: any) {
        const status = e?.response?.status
        const statusText = e?.response?.statusText
        const data = e?.response?.data
        const msg = e?.message
        setServerStatus({ ok: false, message: `GET /api/config/db 失败：${status || ''} ${statusText || ''} ${msg || ''}` })
      }
    })();

    try {
      const s = localStorage.getItem('exec_options')
      if (s) {
        const o = JSON.parse(s)
        setReadOnly(!!o.readOnly); setUseTx(!!o.useTransaction); setMaxRows(Number(o.maxRows) || 1000); setTimeoutSeconds(Number(o.timeoutSeconds) || 30)
      }
    } catch {}

    try {
      const p = JSON.parse(localStorage.getItem('ai_providers') || '[]') as ProviderConfig[]
      const m2 = JSON.parse(localStorage.getItem('ai_models_v2') || '[]') as ModelV2Config[]
      if (Array.isArray(p) && p.length > 0) setProviders(p)
      if (Array.isArray(m2) && m2.length > 0) setModelsV2(m2)

      // 若新结构为空，尝试从旧结构迁移
      if ((p?.length || 0) === 0 && (m2?.length || 0) === 0) {
        const old = JSON.parse(localStorage.getItem('ai_models') || '[]') as any[]
        if (Array.isArray(old) && old.length > 0) {
          const migratedProviders: ProviderConfig[] = []
          const migratedModels: ModelV2Config[] = []
          for (const om of old) {
            const provId = `prov_${Math.random().toString(36).slice(2, 8)}_${Date.now()}`
            const pv: ProviderConfig = {
              id: provId,
              name: om.name ? `${om.name}-provider` : 'migrated-provider',
              baseUrl: om.baseUrl || om.BaseUrl || '',
              apiKey: om.apiKey || om.ApiKey || ''
            }
            migratedProviders.push(pv)
            const mv: ModelV2Config = {
              id: om.id || `model_${Math.random().toString(36).slice(2, 8)}_${Date.now()}`,
              name: om.name || om.model || 'migrated-model',
              providerId: provId,
              model: om.model || om.Model || 'gpt-4o-mini',
              temperature: Number(om.temperature ?? 0.2),
              systemPrompt: String(om.systemPrompt || ''),
              userPrompt: String(om.userPrompt || '')
            }
            migratedModels.push(mv)
          }
          setProviders(migratedProviders)
          setModelsV2(migratedModels)
          localStorage.setItem('ai_providers', JSON.stringify(migratedProviders))
          localStorage.setItem('ai_models_v2', JSON.stringify(migratedModels))
        }
      }
    } catch {}
  }, [])

  const saveExec = () => {
    const o: ExecOptions = { readOnly, useTransaction: useTx, maxRows, timeoutSeconds }
    localStorage.setItem('exec_options', JSON.stringify(o))
    onOptions(o)
  }

  // 提供商 CRUD
  const newProvider = () => {
    setEditingProvider({ id: `prov_${Date.now()}`, name: '', baseUrl: '', apiKey: '' })
  }
  const saveProvider = () => {
    if (!editingProvider) return
    const next = [...providers]
    const idx = next.findIndex(x => x.id === editingProvider.id)
    if (idx >= 0) next[idx] = editingProvider; else next.push(editingProvider)
    setProviders(next)
    localStorage.setItem('ai_providers', JSON.stringify(next))
    setEditingProvider(null)
  }
  const removeProvider = (id: string) => {
    const used = modelsV2.some(m => m.providerId === id)
    if (used) { alert('该提供商已被某些模型引用，请先修改或删除相关模型。'); return }
    const next = providers.filter(x => x.id !== id)
    setProviders(next)
    localStorage.setItem('ai_providers', JSON.stringify(next))
  }

  // 模型 CRUD（V2）
  const newModel = () => {
    const firstProviderId = providers[0]?.id || ''
    setEditingModel({
      id: `model_${Date.now()}`,
      name: '', providerId: firstProviderId, model: '', temperature: 0.2,
      systemPrompt: '', userPrompt: ''
    })
  }
  const saveModel = () => {
    if (!editingModel) return
    const next = [...modelsV2]
    const idx = next.findIndex(m => m.id === editingModel.id)
    if (idx >= 0) next[idx] = editingModel; else next.push(editingModel)
    setModelsV2(next)
    localStorage.setItem('ai_models_v2', JSON.stringify(next))
    setEditingModel(null)
  }
  const removeModel = (id: string) => {
    const next = modelsV2.filter(m => m.id !== id)
    setModelsV2(next)
    localStorage.setItem('ai_models_v2', JSON.stringify(next))
  }

  // 下拉显示名
  const providerNameMap = useMemo(() => {
    const mp: Record<string, string> = {}
    for (const p of providers) mp[p.id] = p.name || p.id
    return mp
  }, [providers])

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', overflowY: 'hidden' }}>
      <AppBar position="fixed">
        <Toolbar>
          <Button color="inherit" startIcon={<ArrowBackIcon />} onClick={() => { window.location.hash = '' }}>
            返回编辑器
          </Button>
          <Typography variant="h6" sx={{ ml: 2, flex: 1 }}>设置</Typography>
          <Typography variant="body2" sx={{ ml: 2, opacity: 0.85 }}>
            通过代理: {backendBase}（目标: {backendTarget}）
          </Typography>
          <Typography variant="body2" sx={{ ml: 2, color: serverStatus.ok ? 'lightgreen' : '#ffd6d6' }}>
            {serverStatus.ok ? '已连接' : `未连接${serverStatus.message ? `（${serverStatus.message}）` : ''}`}
          </Typography>
        </Toolbar>
      </AppBar>
      <Box sx={{ mt: '64px', flex: 1, overflowY: 'auto' }}>
      <Container maxWidth="md" sx={{ py: 2, flex: 1 }}>


      {/* 顶部区域：数据库设置 + 执行选项 */}
      <Box sx={{ my: 2, p: 2, border: '1px solid #e6eaf5', borderRadius: 1 }}>
        <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 600 }}>数据库连接设置</Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
          <TextField label="Host" value={dbConn.host || ''} onChange={(e) => { const v = e.target.value; const next = { ...dbConn, host: v }; setDbConn(next); localStorage.setItem('db_connection', JSON.stringify(next)) }} />
          <TextField label="Port" type="number" value={dbConn.port ?? ''} onChange={(e) => { const v = Number(e.target.value)||0; const next = { ...dbConn, port: v }; setDbConn(next); localStorage.setItem('db_connection', JSON.stringify(next)) }} />
          <TextField label="Database" value={dbConn.database || ''} onChange={(e) => { const v = e.target.value; const next = { ...dbConn, database: v }; setDbConn(next); localStorage.setItem('db_connection', JSON.stringify(next)) }} />
          <TextField label="Username" value={dbConn.username || ''} onChange={(e) => { const v = e.target.value; const next = { ...dbConn, username: v }; setDbConn(next); localStorage.setItem('db_connection', JSON.stringify(next)) }} />
          <TextField label="Password" type="password" value={dbConn.password || ''} onChange={(e) => { const v = e.target.value; const next = { ...dbConn, password: v }; setDbConn(next); localStorage.setItem('db_connection', JSON.stringify(next)) }} />
          <TextField label="SSL(T/F)" value={String(dbConn.ssl ?? false)} onChange={(e) => { const v = e.target.value.toLowerCase(); const val = v === 'true' || v === '1' || v === 'yes'; const next = { ...dbConn, ssl: val }; setDbConn(next); localStorage.setItem('db_connection', JSON.stringify(next)) }} />
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>保存后将自动随请求附带到请求头，服务端可据此连接数据库。</Typography>
        <Box sx={{ mt: 1, display: 'flex', gap: 1 }}>
          <Button variant="outlined" onClick={async () => {
            try {
              const res = await api.get('/api/config/db')
              const envDb = res.data || {}
              const merged = { ...dbConn }
              if (envDb.host != null) merged.host = envDb.host
              if (envDb.port != null) merged.port = envDb.port
              if (envDb.database != null) merged.database = envDb.database
              if (envDb.username != null) merged.username = envDb.username
              if (envDb.password != null) merged.password = envDb.password
              if (envDb.ssl != null) merged.ssl = envDb.ssl
              setDbConn(merged); localStorage.setItem('db_connection', JSON.stringify(merged))
              setServerStatus({ ok: true })
            } catch (e: any) {
              const status = e?.response?.status
              const statusText = e?.response?.statusText
              const data = e?.response?.data
              const msg = e?.message
              setErrorDialogText(`请求: GET /api/config/db\n状态: ${status || ''} ${statusText || ''}\n错误: ${msg || ''}\n响应: ${typeof data === 'string' ? data : JSON.stringify(data || {}, null, 2)}`)
              setErrorDialogOpen(true)
              setServerStatus({ ok: false, message: msg || '请求失败' })
            }
          }}>从 .env 读取</Button>
          <Button variant="contained" onClick={async () => {
            try {
              await api.post('/api/config/db', {
                host: dbConn.host || '',
                port: dbConn.port || null,
                database: dbConn.database || '',
                username: dbConn.username || '',
                password: dbConn.password || '',
                ssl: !!dbConn.ssl,
              })
              alert('已保存到 .env')
              setServerStatus({ ok: true })
            } catch (e: any) {
              const status = e?.response?.status
              const statusText = e?.response?.statusText
              const data = e?.response?.data
              const msg = e?.message
              setErrorDialogText(`请求: POST /api/config/db\n状态: ${status || ''} ${statusText || ''}\n错误: ${msg || ''}\n响应: ${typeof data === 'string' ? data : JSON.stringify(data || {}, null, 2)}`)
              setErrorDialogOpen(true)
              setServerStatus({ ok: false, message: msg || '请求失败' })
            }
          }}>保存到 .env</Button>
        </Box>

        <Box sx={{ mt: 2 }}>
          <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 600 }}>执行选项</Typography>
          <Box sx={{ my: 1 }}>
            <FormControlLabel control={<Switch checked={readOnly} onChange={(e)=> setReadOnly(e.target.checked)} />} label="只读执行" />
          </Box>
          <Box sx={{ my: 1 }}>
            <FormControlLabel control={<Switch checked={useTx} onChange={(e)=> setUseTx(e.target.checked)} />} label="开启事务" />
          </Box>
          <Box sx={{ my: 1, display: 'flex', gap: 2 }}>
            <TextField label="最大行数" type="number" value={maxRows} onChange={e => setMaxRows(Number(e.target.value))} />
            <TextField label="超时(秒)" type="number" value={timeoutSeconds} onChange={e => setTimeoutSeconds(Number(e.target.value))} />
          </Box>
          <Button variant="contained" onClick={saveExec}>保存执行设置</Button>
        </Box>
      </Box>

      {/* 中部区域：模型提供商设置 */}
      <Box sx={{ my: 3, p: 2, border: '1px solid #e6eaf5', borderRadius: 1 }}>
        <Typography variant="h6">模型提供商</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          可配置多个提供商，包含 Base URL 与 API Key。
        </Typography>
        <Button variant="outlined" onClick={newProvider}>新增提供商</Button>

        <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
          {providers.map(p => (
            <Box key={p.id} sx={{ border: '1px solid #ddd', borderRadius: 1, p: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography sx={{ flex: 1 }}>{p.name || '(未命名)'}（{p.id}）</Typography>
              <Button size="small" onClick={() => setEditingProvider({ ...p })}>编辑</Button>
              <Button size="small" color="error" onClick={() => removeProvider(p.id)}>删除</Button>
            </Box>
          ))}
        </Box>

        <Dialog open={!!editingProvider} onClose={() => setEditingProvider(null)} maxWidth="sm" fullWidth>
          <DialogTitle>编辑模型提供商</DialogTitle>
          <DialogContent dividers>
            {editingProvider && (
              <Box sx={{ mt: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                <TextField label="唯一ID" value={editingProvider.id} onChange={e => setEditingProvider({ ...editingProvider, id: e.target.value })} />
                <TextField label="名称" value={editingProvider.name} onChange={e => setEditingProvider({ ...editingProvider, name: e.target.value })} />
                <TextField label="Base URL" value={editingProvider.baseUrl} onChange={e => setEditingProvider({ ...editingProvider, baseUrl: e.target.value })} />
                <TextField label="API Key" type="password" value={editingProvider.apiKey} onChange={e => setEditingProvider({ ...editingProvider, apiKey: e.target.value })} />
              </Box>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setEditingProvider(null)}>取消</Button>
            <Button variant="contained" onClick={saveProvider}>保存</Button>
          </DialogActions>
        </Dialog>
      </Box>

      {/* 底部区域：模型设置 */}
      <Box sx={{ my: 3, p: 2, border: '1px solid #e6eaf5', borderRadius: 1 }}>
        <Typography variant="h6">大模型设置</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          先选择模型提供商，再输入模型名称、系统提示词、用户提示词与温度。支持变量：{'{{instruction}}、{{selectedText}}、{{sqlText}}、{{schema}}'}。
        </Typography>
        <Button variant="outlined" onClick={newModel}>新增模型</Button>

        {/* 默认诊断与优化模型下拉，沿用 v2 模型 ID */}
        <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
            <TextField
              label="默认诊断模型"
              select size="small" sx={{ minWidth: 260 }}
              value={localStorage.getItem('ai_selected_diagnose_model_id') || ''}
              onChange={(e) => localStorage.setItem('ai_selected_diagnose_model_id', String(e.target.value))}
              SelectProps={{ native: true }} InputLabelProps={{ shrink: true }}
              helperText="用于“信息”页签中的“AI诊断并修正”"
            >
              <option value="">（使用后端默认）</option>
              {modelsV2.map(m => (
                <option key={m.id} value={m.id}>{m.name || m.model || m.id}</option>
              ))}
            </TextField>
          </Box>
          <Typography variant="caption" color="text.secondary">
            变量说明（诊断）：{'{{selectedText}}'}（编辑器当前选中 SQL/文本）、{'{{sqlText}}'}（编辑器全部 SQL）、{'{{schema}}'}（数据库结构 JSON）、{'{{error}}'}（最近一次执行的错误信息，若有）。
          </Typography>
          <Divider sx={{ mt: 1 }} />
        </Box>
        <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
            <TextField
              label="默认优化模型"
              select size="small" sx={{ minWidth: 260 }}
              value={localStorage.getItem('ai_selected_optimize_model_id') || ''}
              onChange={(e) => localStorage.setItem('ai_selected_optimize_model_id', String(e.target.value))}
              SelectProps={{ native: true }} InputLabelProps={{ shrink: true }}
              helperText="用于“AI性能优化”按钮调用"
            >
              <option value="">（使用后端默认）</option>
              {modelsV2.map(m => (
                <option key={m.id} value={m.id}>{m.name || m.model || m.id}</option>
              ))}
            </TextField>
          </Box>
          <Typography variant="caption" color="text.secondary">
            变量说明（优化）：{'{{instruction}}'}（用户输入的优化目标/说明）、{'{{selectedText}}'}（选中 SQL/文本）、{'{{sqlText}}'}（全部 SQL）、{'{{schema}}'}（数据库结构 JSON）。
          </Typography>
          <Divider sx={{ mt: 1 }} />
        </Box>

        <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
          {modelsV2.map(m => (
            <Box key={m.id} sx={{ border: '1px solid #ddd', borderRadius: 1, p: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography sx={{ flex: 1 }}>{m.name || m.model}（{m.id}）｜提供商：{providerNameMap[m.providerId] || m.providerId}</Typography>
              <Button size="small" onClick={() => setEditingModel({ ...m })}>编辑</Button>
              <Button size="small" color="error" onClick={() => removeModel(m.id)}>删除</Button>
            </Box>
          ))}
        </Box>

        <Dialog open={!!editingModel} onClose={() => setEditingModel(null)} maxWidth="md" fullWidth>
          <DialogTitle>编辑模型</DialogTitle>
          <DialogContent dividers sx={{ height: '70vh', display: 'flex', flexDirection: 'column' }}>
            {editingModel && (
              <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 2, height: '100%' }}>
                {/* 顶部：基础字段两列 */}
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                  <TextField label="唯一ID" value={editingModel.id} onChange={e => setEditingModel({ ...editingModel, id: e.target.value })} />
                  <TextField label="名称" value={editingModel.name} onChange={e => setEditingModel({ ...editingModel, name: e.target.value })} />
                  <TextField label="模型提供商" select value={editingModel.providerId} onChange={e => setEditingModel({ ...editingModel, providerId: String(e.target.value) })}>
                    {providers.map(p => (
                      <MenuItem key={p.id} value={p.id}>{p.name || p.id}</MenuItem>
                    ))}
                  </TextField>
                  <TextField label="模型名" value={editingModel.model} onChange={e => setEditingModel({ ...editingModel, model: e.target.value })} />
                  <TextField label="温度" type="number" value={editingModel.temperature} onChange={e => setEditingModel({ ...editingModel, temperature: Number(e.target.value) })} />
                </Box>
                {/* 插入变量按钮 */}
                <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <Button size="small" variant="outlined" onClick={openVarMenu}>插入变量</Button>
                  <Menu anchorEl={varMenuAnchor} open={varMenuOpen} onClose={closeVarMenu} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}>
                    {variableOptions.map(v => (
                      <MenuItem key={v.value} onClick={() => { insertVariableAtCursor(v.value); closeVarMenu() }}>{v.value} — {v.label}</MenuItem>
                    ))}
                  </Menu>
                </Box>
                {/* 底部：系统/用户提示词左右分栏，占满剩余高度 */}
                <Box sx={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, minHeight: 0 }}>
                  <TextField
                    label="系统提示词"
                    multiline
                    minRows={6}
                    value={editingModel.systemPrompt}
                    onFocus={() => setActiveField('system')}
                    inputRef={(el) => { systemInputRef.current = el as HTMLTextAreaElement | null }}
                    onChange={e => setEditingModel({ ...editingModel, systemPrompt: e.target.value })}
                    sx={{
                      height: '100%',
                      '& .MuiInputBase-root': { height: '100%', alignItems: 'stretch' },
                      '& .MuiInputBase-inputMultiline': { height: '100% !important', overflowY: 'auto' },
                      '& textarea': { height: '100% !important', overflowY: 'auto', resize: 'vertical' }
                    }}
                  />
                  <TextField
                    label="用户提示词"
                    multiline
                    minRows={6}
                    value={editingModel.userPrompt}
                    onFocus={() => setActiveField('user')}
                    inputRef={(el) => { userInputRef.current = el as HTMLTextAreaElement | null }}
                    onChange={e => setEditingModel({ ...editingModel, userPrompt: e.target.value })}
                    sx={{
                      height: '100%',
                      '& .MuiInputBase-root': { height: '100%', alignItems: 'stretch' },
                      '& .MuiInputBase-inputMultiline': { height: '100% !important', overflowY: 'auto' },
                      '& textarea': { height: '100% !important', overflowY: 'auto', resize: 'vertical' }
                    }}
                  />
                </Box>
              </Box>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setEditingModel(null)}>取消</Button>
            <Button variant="contained" onClick={saveModel}>保存</Button>
          </DialogActions>
        </Dialog>
      </Box>
        {/* 错误详情弹窗 */}
        <Dialog open={errorDialogOpen} onClose={() => setErrorDialogOpen(false)} maxWidth="md" fullWidth>
          <DialogTitle>请求失败</DialogTitle>
          <DialogContent dividers>
            <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0 }}>{errorDialogText}</pre>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setErrorDialogOpen(false)}>关闭</Button>
          </DialogActions>
        </Dialog>
      </Container>
      </Box>
    </Box>
  )
}
