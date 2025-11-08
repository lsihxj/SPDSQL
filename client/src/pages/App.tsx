import { useRef, useState, useEffect, useMemo } from 'react'
import { AppBar, Box, Button, Container, Divider, Stack, Tab, Tabs, TextField, Toolbar, Typography, Snackbar, Dialog, DialogTitle, DialogContent, DialogActions, CircularProgress, IconButton, Menu, MenuItem, Tooltip, Alert, Avatar, Switch, FormControlLabel, Drawer } from '@mui/material'
import { keyframes } from '@mui/system'


// 纯文本渲染组件：不使用 Markdown，支持安全字符串化与预换行显示
const Markdown = ({ children }: { children: any }) => {
  let text = '';
  if (children == null) text = '';
  else if (typeof children === 'string') text = children;
  else if (Array.isArray(children)) text = children.map((x) => (typeof x === 'string' ? x : String(x ?? ''))).join('');
  else if (typeof children === 'number' || typeof children === 'bigint') text = String(children);
  else { try { text = JSON.stringify(children, null, 2); } catch { text = String(children); } }
  return (
    <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{text}</pre>
  );
};
const dots = keyframes({
  '0%': { opacity: 0.3, transform: 'translateY(0px)' },
  '50%': { opacity: 1, transform: 'translateY(-3px)' },
  '100%': { opacity: 0.3, transform: 'translateY(0px)' }
})
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import SaveIcon from '@mui/icons-material/Save'
import FormatAlignLeftIcon from '@mui/icons-material/FormatAlignLeft'
import BoltIcon from '@mui/icons-material/Bolt'
import CloseIcon from '@mui/icons-material/Close'
import SchemaIcon from '@mui/icons-material/AccountTree'
import { Editor, OnMount } from '@monaco-editor/react'
import { api, setAuthToken } from '@/lib/api'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { format } from 'sql-formatter'
import Papa from 'papaparse'
import ResizableTable from '@/components/ResizableTable'
import QueryResultTabs from '@/components/QueryResultTabs'
import WorkflowSelector from '@/components/Workflow/WorkflowSelector'
import { MultiExecuteResponse, QueryResult } from '@/types/api'

function download(filename: string, text: string) {
  const element = document.createElement('a')
  element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text))
  element.setAttribute('download', filename)
  element.style.display = 'none'
  document.body.appendChild(element)
  element.click()
  document.body.removeChild(element)
}

const DraggableTabContainer = (props: any) => {
  const {
    // Filter out props from Tabs that are not for DOM elements
    fullWidth,
    indicator,
    selectionFollowsFocus,
    textColor,
    value,
    onChange,
    ...other
  } = props;
  return <Box {...other} />;
};

function MoreTabsMenu({ tabs, activeIndex, onSelect }: { tabs: { id: string; title: string }[]; activeIndex: number; onSelect: (index: number) => void }) {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)
  const open = Boolean(anchorEl)
  return (
    <>
      <Tooltip title="更多页签">
        <Button size="small" variant="outlined" onClick={(e) => setAnchorEl(e.currentTarget)}>更多</Button>
      </Tooltip>
      <Menu anchorEl={anchorEl} open={open} onClose={() => setAnchorEl(null)} sx={{ maxHeight: 420 }}>
        {tabs.map((t, i) => (
          <MenuItem key={t.id} selected={i === activeIndex} onClick={() => { setAnchorEl(null); onSelect(i) }}>
            <Box sx={{ maxWidth: 420, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.title || `未命名${i+1}`}</Box>
          </MenuItem>
        ))}
      </Menu>
    </>
  )
}

export default function App() {
  const editorRef = useRef<any>(null)
  // 防止初始化/恢复期间误覆盖本地快照
  const isRestoringRef = useRef<boolean>(true)
  // 编辑器多页签状态
  const [editorTabs, setEditorTabs] = useState<{ id: string; title: string; model: any }[]>([])
  const [activeEditorIndex, setActiveEditorIndex] = useState(0)
  // 页签可见性计算：溢出时隐藏到“更多”
  const tabStripRef = useRef<HTMLDivElement | null>(null)
  const moreMenuWrapperRef = useRef<HTMLDivElement | null>(null)
  const measureRef = useRef<HTMLDivElement | null>(null)
  const [hiddenTabIds, setHiddenTabIds] = useState<string[]>([])
  const tabWidthCacheRef = useRef<Map<string, number>>(new Map())
  const [tabStripWidth, setTabStripWidth] = useState<number>(0)
  
  const [selectedText, setSelectedText] = useState<string>('')
  const [instruction, setInstruction] = useState('')
  const [candidateSql, setCandidateSql] = useState<string>('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [models, setModels] = useState<any[]>(() => {
    try {
      const s2 = localStorage.getItem('ai_models_v2')
      if (s2) {
        const arr = JSON.parse(s2)
        if (Array.isArray(arr) && arr.length > 0) return arr
      }
      const s = localStorage.getItem('ai_models')
      return s ? JSON.parse(s) : []
    } catch { return [] }
  })
  const [selectedModelId, setSelectedModelId] = useState<string>(() => {
    const s = localStorage.getItem('ai_selected_model_id')
    return s || ''
  })
  const [selectedWorkflow, setSelectedWorkflow] = useState('')
  const qc = useQueryClient()
  const [tab, setTab] = useState(0)
  const [opts, setOpts] = useState(() => {
    const s = localStorage.getItem('exec_options')
    return s ? JSON.parse(s) : { readOnly: true, useTransaction: false, maxRows: 1000, timeoutSeconds: 30 }
  })
  const [userDisplay, setUserDisplay] = useState('')
  const [userRole, setUserRole] = useState('')
  const [userAvatarUrl, setUserAvatarUrl] = useState('')
  // 监听头像更新事件，刷新右上角头像（增加时间戳）
  useEffect(() => {
    const handler = () => {
      api.get('/api/auth/me').then(({ data }) => {
        if (data?.avatarUrl) setUserAvatarUrl(`${data.avatarUrl}?t=${Date.now()}`)
        else setUserAvatarUrl('')
      }).catch(() => {})
    }
    window.addEventListener('avatar-updated', handler)
    return () => window.removeEventListener('avatar-updated', handler)
  }, [])
  const [userMenuEl, setUserMenuEl] = useState<null | HTMLElement>(null)
  const userMenuOpen = Boolean(userMenuEl)
  const roleNameMap: Record<string, string> = {
    admin: '管理员',
    user: '普通用户',
    editor: '编辑',
    viewer: '只读用户',
    superadmin: '超级管理员',
    reader: '只读用户',
    writer: '写入用户'
  }
  const roleDisplay = useMemo(() => {
    const key = (userRole || '').toLowerCase()
    return roleNameMap[key] || userRole || ''
  }, [userRole])

  // 登录态以服务端为准：优先从 /api/auth/me 获取用户名与角色，避免本地解码误差
  useEffect(() => {
    api.get('/api/auth/me')
      .then(({ data }) => {
        if (data) {
          setUserDisplay(String(data.username || ''))
          setUserRole(String(data.role || ''))
          setUserAvatarUrl(data.avatarUrl ? `${String(data.avatarUrl)}?t=${Date.now()}` : '')
        }
      })
      .catch(() => { /* ignore; 保持现有显示 */ })
  }, [])

  useEffect(() => {
    // 从 localStorage 同步模型列表（设置页可能有更新）
    try {
      const s2 = localStorage.getItem('ai_models_v2')
      if (s2) {
        const arr = JSON.parse(s2)
        if (Array.isArray(arr) && arr.length > 0) { setModels(arr); return }
      }
      const s = localStorage.getItem('ai_models')
      if (s) setModels(JSON.parse(s))
    } catch {}

    // 解析当前登录用户与角色并显示
    try {
      const token = localStorage.getItem('token') || ''
      let name = localStorage.getItem('username') || ''
      let role = localStorage.getItem('role') || ''
      const safeDecodeBase64Url = (b64url: string) => {
        // base64url -> base64 并补齐 padding
        let b64 = b64url.replace(/-/g, '+').replace(/_/g, '/')
        const padding = b64.length % 4
        if (padding === 2) b64 += '=='
        else if (padding === 3) b64 += '='
        else if (padding === 1) { /* 非法长度，直接返回空 */ return '' }
        try { return atob(b64) } catch { return '' }
      }
      if (token && token.split('.').length === 3) {
        const part = token.split('.')[1]
        const payloadStr = safeDecodeBase64Url(part)
        if (payloadStr) {
          const payload = JSON.parse(payloadStr || '{}')
          const claimNameLong = payload['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name']
          const claimRoleLong = payload['http://schemas.microsoft.com/ws/2008/06/identity/claims/role']
          const uniqueName = payload.unique_name || payload.uniqueName
          name = name || payload.username || payload.name || uniqueName || claimNameLong || payload.sub || payload.email || ''
          role = role || payload.role || claimRoleLong || (Array.isArray(payload.roles) ? payload.roles[0] : '') || ''
        }
      }
      if (!name && !role) {
        api.get('/api/auth/me').then(({ data }) => {
          const n = data?.username || name
          const r = data?.role || role
          setUserDisplay(n || '未登录')
          setUserRole(r || '')
        }).catch(() => {
          setUserDisplay(name || '未登录')
          setUserRole(role || '')
        })
        return
      }
      setUserDisplay(name || '未登录')
      setUserRole(role || '')
    } catch {
      // 保持最保守的回退
      api.get('/api/auth/me').then(({ data }) => {
        const name2 = data?.username || '未登录'
        const role2 = data?.role || ''
        setUserDisplay(name2)
        setUserRole(role2)
      }).catch(() => {
        setUserDisplay('未登录')
        setUserRole('')
      })
    }
  }, [])
  useEffect(() => {
    if (selectedModelId) localStorage.setItem('ai_selected_model_id', selectedModelId)
  }, [selectedModelId])

  // 持久化页签与激活索引：避免初始化/恢复阶段覆盖历史快照
  useEffect(() => {
    if (isRestoringRef.current) return
    try {
      const list = editorTabs.map(t => ({ id: t.id, title: t.title, content: t.model?.getValue?.() || '' }))
      localStorage.setItem('editor_tabs_snapshot', JSON.stringify(list))
      const clampedActive = Math.min(Math.max(activeEditorIndex, 0), Math.max(editorTabs.length - 1, 0))
      localStorage.setItem('active_editor_index', String(clampedActive))
    } catch {}
  }, [editorTabs, activeEditorIndex])

  // 检查ERD生成的SQL并创建新页签
  const checkAndCreateErdTab = () => {
    console.log('checkAndCreateErdTab 被调用')
    const erdSql = localStorage.getItem('erd_generated_sql')
    const createNewTab = localStorage.getItem('erd_create_new_tab')
    console.log('localStorage中的ERD SQL:', erdSql ? erdSql.substring(0, 50) + '...' : 'null')
    console.log('是否需要创建新页签:', createNewTab)
    
    if (!erdSql) {
      console.log('没有ERD SQL，退出')
      return
    }
    
    console.log('检测到ERD生成的SQL，长度:', erdSql.length)
    
    const monaco = (window as any).monaco
    console.log('Monaco对象:', monaco ? '存在' : '不存在')
    console.log('编辑器引用:', editorRef.current ? '存在' : '不存在')
    
    if (monaco?.editor && editorRef.current) {
      console.log('开始创建新页签')
      
      // 创建新的编辑器模型并插入SQL
      const model = monaco.editor.createModel(erdSql, 'pgsql')
      
      // 始终创建新页签并设为当前页签
      setEditorTabs(prev => {
        console.log('当前页签数量:', prev.length)
        
        // 生成唯一标题：优先使用 ERD 时间戳，退化为当前时间
        const tsFromErd = localStorage.getItem('erd_timestamp')
        const uniqueId = tsFromErd ? Number(tsFromErd) : Date.now()
        const timeStr = new Date(uniqueId).toLocaleTimeString()
        let tabTitle = `ERD生成SQL (${timeStr})`
        // 如果标题已存在，附加后缀确保唯一
        const exists = prev.some(tab => tab.title === tabTitle)
        if (exists) tabTitle = `ERD生成SQL (${timeStr})#${uniqueId}`
        
        console.log('新页签标题:', tabTitle)
        
        const newTab = { 
          id: String(Date.now()) + Math.random(), // 确保唯一ID
          title: tabTitle, 
          model 
        }
        
        console.log('新页签创建完成:', newTab.title, newTab.id)
        console.log('强制创建新的ERD页签')
        
        const newTabs = [...prev, newTab]
        const newIndex = newTabs.length - 1
        console.log('新页签索引:', newIndex)
        setActiveEditorIndex(newIndex)
        console.log('页签列表已更新，新长度:', newTabs.length)
        
        // 持久化快照：标题与内容
        try {
          const list = newTabs.map(t => ({ id: t.id, title: t.title, content: t.model?.getValue?.() || '' }))
          localStorage.setItem('editor_tabs_snapshot', JSON.stringify(list))
          localStorage.setItem('active_editor_index', String(newIndex))
        } catch {}
        return newTabs
      })
      
      // 切换编辑器到新模型
      setTimeout(() => {
        if (editorRef.current && model) {
          editorRef.current.setModel(model)
          console.log('编辑器模型已切换到新页签')
        }
      }, 100)
      
      // 清除localStorage
      localStorage.removeItem('erd_generated_sql')
      localStorage.removeItem('erd_create_new_tab')
      localStorage.removeItem('erd_timestamp')
      console.log('localStorage已清除')
    } else {
      console.log('Monaco编辑器未就绪，延迟重试')
      // 延迟重试
      setTimeout(checkAndCreateErdTab, 500)
    }
  }

  // 从 ERD 页面返回后，自动创建新页签并插入生成的 SQL
  useEffect(() => {
    console.log('App组件挂载，检查ERD SQL')
    // 延迟一点时间确保编辑器完全初始化
    const timer = setTimeout(() => {
      checkAndCreateErdTab()
    }, 300)
    
    return () => clearTimeout(timer)
  }, [])

  // 监听编辑器初始化完成
  useEffect(() => {
    if (editorRef.current) {
      console.log('编辑器引用已就绪，检查ERD SQL')
      checkAndCreateErdTab()
    }
  }, [editorRef.current])

  // 结果面板状态
  const [resultPanelOpen, setResultPanelOpen] = useState(false)
  const [resultHeight, setResultHeight] = useState(() => {
    const s = localStorage.getItem('result_panel_height')
    return s ? Number(s) : 30 // 默认30%
  })
  const [isResizingResult, setIsResizingResult] = useState(false)
  const resultStartYRef = useRef(0)
  const resultStartHeightRef = useRef(0)
  const editorContainerRef = useRef<HTMLDivElement | null>(null)

  const containerRef = useRef<HTMLDivElement | null>(null)
  const [splitPct, setSplitPct] = useState<number>(() => {
    const s = localStorage.getItem('ai_panel_width_pct')
    const v = s ? Number(s) : 30
    return Math.min(Math.max(v, 15), 85)
  })
  const [isResizing, setIsResizing] = useState(false)
  const startXRef = useRef(0)
  const startSplitPctRef = useRef(0)

  // 右侧面板：候选SQL 与 已保存查询 的上下可调高度
  const rightPanelRef = useRef<HTMLDivElement | null>(null)
  const [candidatePanelHeight, setCandidatePanelHeight] = useState<number>(() => {
    const s = localStorage.getItem('candidate_panel_height_pct')
    let v = s ? Number(s) : 45
    if (Number.isNaN(v)) v = 45
    // 启动时保护：根据当前可见高度重新夹取，避免被异常持久化值拖出视口
    try {
      const panel = rightPanelRef.current
      if (panel) {
        const h = panel.getBoundingClientRect().height || 0
        const minCandidatePx = 90
        const minSavedPx = 56
        const minPctDynamic = Math.max(0, Math.min(100, (minCandidatePx / Math.max(1, h)) * 100))
        const maxPctDynamic = Math.max(0, Math.min(100, 100 - (minSavedPx / Math.max(1, h)) * 100))
        v = Math.min(Math.max(v, minPctDynamic), maxPctDynamic)
      }
    } catch {}
    return Math.min(Math.max(v, 5), 95)
  })
  const [isResizingRight, setIsResizingRight] = useState(false)
  const rightStartYRef = useRef(0)
  const rightStartPctRef = useRef(0)
  const rightDragRectRef = useRef<{ height: number } | null>(null)
  const rightMovedRef = useRef(false)
  const rightSnapRef = useRef<{ panelTop: number; panelHeight: number; offsetTop: number; offsetBottom: number } | null>(null)
  const rightSepBaseTopRef = useRef(0)
  const candidateBoxRef = useRef<HTMLDivElement | null>(null)
  const savedListBoxRef = useRef<HTMLDivElement | null>(null)
  
  // 轻提示
  const [snackOpen, setSnackOpen] = useState(false)
  const [snackMsg, setSnackMsg] = useState('')
  // 右侧页签：候选SQL / 已保存查询
  const [rightActiveTab, setRightActiveTab] = useState<'candidate' | 'saved'>(() => 'candidate')
  const [chatMode, setChatMode] = useState<boolean>(() => {
    try { return localStorage.getItem('chat_mode') === '1' } catch { return false }
  })
  const [chatDrawerOpen, setChatDrawerOpen] = useState<boolean>(() => {
    try { return localStorage.getItem('chat_drawer_open') === '1' } catch { return false }
  })
  const [chatWidthPct, setChatWidthPct] = useState<number>(() => {
    try { return Number(localStorage.getItem('chat_drawer_width_pct') || 32) } catch { return 32 }
  })
  const [isResizingChat, setIsResizingChat] = useState(false)
  type ChatMsg = { id?: string; role: 'user' | 'assistant'; content: string; isTyping?: boolean }
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>(() => {
    try { return JSON.parse(localStorage.getItem('chat_messages') || '[]') as ChatMsg[] } catch { return [] }
  })
  const appendAssistantDelta = (delta: string) => {
    const d = String(delta || '')
    if (!d) return
    setChatMessages(prev => {
      const next = [...prev]
      for (let i = next.length - 1; i >= 0; i--) {
        if (next[i].role === 'assistant') { next[i] = { ...next[i], content: (next[i].content || '') + d }; try { localStorage.setItem('chat_messages', JSON.stringify(next)) } catch {}; return next }
      }
      const out = next.concat({ role: 'assistant', content: d, isTyping: true })
      try { localStorage.setItem('chat_messages', JSON.stringify(out)) } catch {}
      return out
    })
  }
  const setAssistantFinal = (text: string) => {
    const t = String(text || '')
    setChatMessages(prev => {
      const next = [...prev]
      for (let i = next.length - 1; i >= 0; i--) {
        if (next[i].role === 'assistant') { next[i] = { ...next[i], content: t, isTyping: false }; try { localStorage.setItem('chat_messages', JSON.stringify(next)) } catch {}; return next }
      }
      const out = next.concat({ role: 'assistant', content: t, isTyping: false })
      try { localStorage.setItem('chat_messages', JSON.stringify(out)) } catch {}
      return out
    })
  }
  const candidateSelectionRef = useRef<string>('')

  // 编辑器自定义右键菜单状态
  const [editorContextMenu, setEditorContextMenu] = useState<{ open: boolean; x: number; y: number }>({ open: false, x: 0, y: 0 })

  const closeEditorContextMenu = () => setEditorContextMenu({ open: false, x: 0, y: 0 })

  // 右键菜单动作
  const cutSelection = async () => {
    const ed = editorRef.current
    if (!ed) return closeEditorContextMenu()
    const model = ed.getModel()
    const sel = ed.getSelection()
    if (!model || !sel) return closeEditorContextMenu()
    const text = model.getValueInRange(sel) || ''
    try { await navigator.clipboard?.writeText?.(text) } catch {}
    const monaco = (window as any).monaco
    if (monaco?.Range) {
      const range = new monaco.Range(sel.startLineNumber, sel.startColumn, sel.endLineNumber, sel.endColumn)
      ed.executeEdits('cut', [{ range, text: '' }])
    }
    closeEditorContextMenu()
  }

  const copySelection = async () => {
    const ed = editorRef.current
    if (!ed) return closeEditorContextMenu()
    const model = ed.getModel()
    const sel = ed.getSelection()
    if (!model || !sel) return closeEditorContextMenu()
    const text = model.getValueInRange(sel) || ''
    try { await navigator.clipboard?.writeText?.(text) } catch {
      try { (ed as any).trigger('keyboard', 'editor.action.clipboardCopyAction', null) } catch {}
    }
    closeEditorContextMenu()
  }

  const pasteClipboard = async () => {
    const ed = editorRef.current
    if (!ed) return closeEditorContextMenu()
    const monaco = (window as any).monaco
    let text = ''
    if (navigator.clipboard?.readText) {
      try { text = await navigator.clipboard.readText() } catch {}
    }
    if (!text) {
      try { (ed as any).trigger('keyboard', 'editor.action.clipboardPasteAction', null) } catch {}
      return closeEditorContextMenu()
    }
    const sel = ed.getSelection()
    if (sel && monaco?.Range) {
      const range = new monaco.Range(sel.startLineNumber, sel.startColumn, sel.endLineNumber, sel.endColumn)
      ed.executeEdits('paste', [{ range, text }])
    } else {
      const pos = ed.getPosition()
      if (pos && monaco?.Range) {
        const range = new monaco.Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column)
        ed.executeEdits('paste', [{ range, text }])
      }
    }
    closeEditorContextMenu()
  }

  const selectAll = () => {
    const ed = editorRef.current
    if (!ed) return closeEditorContextMenu()
    try { (ed as any).trigger('keyboard', 'editor.action.selectAll', null) } catch {}
    closeEditorContextMenu()
  }

  // MUI 对话框状态：重命名与删除确认 + 设置对话框
  const [renameDialog, setRenameDialog] = useState<{ open: boolean; id?: string; title: string }>({ open: false, title: '' })
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; id?: string; title: string }>({ open: false, title: '' })

  
  // 左右分割拖动
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isResizing) return
      const containerWidth = containerRef.current?.getBoundingClientRect().width || 1
      const delta = e.clientX - startXRef.current
      const deltaPct = (delta / containerWidth) * 100
      const minPct = 15
      const maxPct = 85
      const nextPct = Math.min(Math.max(startSplitPctRef.current - deltaPct, minPct), maxPct)
      setSplitPct(nextPct)
    }
    const onUp = () => {
      if (isResizing) {
        setIsResizing(false)
        localStorage.setItem('ai_panel_width_pct', String(splitPct))
      }
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [isResizing, splitPct])

  // 上下分割拖动（主编辑器与结果面板）
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isResizingResult || !editorContainerRef.current) return
      const containerHeight = editorContainerRef.current.getBoundingClientRect().height
      const delta = e.clientY - resultStartYRef.current
      const deltaPct = (delta / containerHeight) * 100
      const minPct = 20
      const maxPct = 70
      const nextPct = Math.min(Math.max(resultStartHeightRef.current - deltaPct, minPct), maxPct)
      setResultHeight(nextPct)
    }
    const onUp = () => {
      if (isResizingResult) {
        setIsResizingResult(false)
        localStorage.setItem('result_panel_height', String(resultHeight))
      }
    }
    if (isResizingResult) {
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    }
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [isResizingResult, resultHeight])

  // 右侧候选SQL与已保存查询上下分割可拖动
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isResizingRight || !rightPanelRef.current) return
      const pr = rightPanelRef.current.getBoundingClientRect()
      const snap = rightSnapRef.current
      const panelTop = snap?.panelTop ?? pr.top
      const panelHeight = Math.max(1, snap?.panelHeight ?? pr.height)
      const minCandidatePx = 90
      const minSavedPx = 56
      // 基于启动时的 panelTop 提高稳定性
      const minY = panelTop + minCandidatePx
      const maxY = panelTop + panelHeight - minSavedPx
      const deltaY = e.clientY - rightStartYRef.current
      const newTop = (rightSepBaseTopRef.current || (panelTop + (candidatePanelHeight / 100) * panelHeight)) + deltaY
      const clampedY = Math.min(Math.max(newTop, minY), maxY)
      if (Math.abs(deltaY) < 2) return
      const pct = ((clampedY - panelTop) / panelHeight) * 100
      const nextPct = Math.max(0, Math.min(100, pct))
      setCandidatePanelHeight(nextPct)
    }
    const onUp = () => {
      if (isResizingRight) {
        setIsResizingRight(false)
        localStorage.setItem('candidate_panel_height_pct', String(candidatePanelHeight))
      }
    }
    if (isResizingRight) {
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    }
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [isResizingRight, candidatePanelHeight])

  useEffect(() => {
    const anyResizing = isResizing || isResizingResult || isResizingRight
    document.body.style.cursor = isResizing ? 'col-resize' : (isResizingResult || isResizingRight) ? 'row-resize' : ''
    document.body.style.userSelect = anyResizing ? 'none' : ''
    return () => {
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [isResizing, isResizingResult, isResizingRight])

  // 定义透明主题用于代码块背景透出
  useEffect(() => {
    try {
      const monaco = (window as any).monaco
      if (monaco?.editor) {
        monaco.editor.defineTheme('transparent', {
          base: 'vs',
          inherit: true,
          rules: [],
          colors: { 'editor.background': '#00000000' }
        })
      }
    } catch {}
  }, [])

  const resetSplit = () => {
    setSplitPct(30)
    localStorage.setItem('ai_panel_width_pct', '30')
  }

  const execMutation = useMutation({
    mutationFn: async (payload: any) => {
      try {
        const { data } = await api.post<MultiExecuteResponse>('/api/sql/execute', payload)
        setResultPanelOpen(true)
        return data
      } catch (e: any) {
        const title = e?.response?.data?.title || e?.response?.data?.error || e?.message || '请求失败'
        setResultPanelOpen(true)
        return {
          success: false,
          results: [{
            index: 1,
            success: false,
            error: title,
            sql: payload.sqlText
          }]
        } as MultiExecuteResponse
      }
    }
  })

  const generateMutation = useMutation({
    mutationFn: async (payload: any) => {
      const { data } = await api.post('/api/sql/generate', payload)
      return data
    },
    onSuccess: (data: any) => {
      const sql = data?.sql || ''
      setCandidateSql(sql)
    },
    onError: (error: any) => {
      const msg = error?.response?.data?.error || error?.message || '生成失败'
      setSnackMsg(`AI生成失败：${msg}`)
      setSnackOpen(true)
    }
  })

  const { data: savedList } = useQuery({
    queryKey: ['saved'],
    queryFn: async () => (await api.get('/api/queries')).data
  })

  const [savedDialog, setSavedDialog] = useState<{ open: boolean; mode: 'rename' | 'copy'; id?: string; base?: any; title: string }>(() => ({ open: false, mode: 'rename', id: undefined, base: undefined, title: '' }))

  // AI 性能优化对话框
  const [optOpen, setOptOpen] = useState(false)
  const [optLoading, setOptLoading] = useState(false)
  const [optError, setOptError] = useState('')
  const [optData, setOptData] = useState<{ syntaxErrors: { line?: number; message: string }[]; performanceSuggestions: string[]; optimizedSql?: string } | null>(null)
  // 可拖拽/可缩放：位置与尺寸
  const [optX, setOptX] = useState(() => Number(localStorage.getItem('opt_dialog_x')) || 120)
  const [optY, setOptY] = useState(() => Number(localStorage.getItem('opt_dialog_y')) || 80)
  const [optWidth, setOptWidth] = useState(() => Number(localStorage.getItem('opt_dialog_w')) || 560)
  const [optHeight, setOptHeight] = useState(() => Number(localStorage.getItem('opt_dialog_h')) || 420)
  const dragRef = useRef({ dragging: false, startX: 0, startY: 0, originX: 0, originY: 0 })
  const resizeRef = useRef({ resizing: false, startX: 0, startY: 0, originW: 0, originH: 0, mode: 'se' as 'e'|'s'|'se' })

  useEffect(() => {
    const MARGIN = 8
    const SNAP = 12
    const MIN_W = 360
    const MIN_H = 260

    const clamp = (val: number, min: number, max: number) => Math.min(Math.max(val, min), max)

    const onMove = (e: MouseEvent) => {
      const vw = window.innerWidth
      const vh = window.innerHeight
      if (dragRef.current.dragging) {
        const nx = dragRef.current.originX + (e.clientX - dragRef.current.startX)
        const ny = dragRef.current.originY + (e.clientY - dragRef.current.startY)
        const maxX = Math.max(MARGIN, vw - optWidth - MARGIN)
        const maxY = Math.max(MARGIN, vh - optHeight - MARGIN)
        setOptX(clamp(nx, MARGIN, maxX))
        setOptY(clamp(ny, MARGIN, maxY))
      }
      if (resizeRef.current.resizing) {
        const dx = (e.clientX - resizeRef.current.startX)
        const dy = (e.clientY - resizeRef.current.startY)
        let nextW = resizeRef.current.mode === 's' ? resizeRef.current.originW : Math.max(MIN_W, resizeRef.current.originW + dx)
        let nextH = resizeRef.current.mode === 'e' ? resizeRef.current.originH : Math.max(MIN_H, resizeRef.current.originH + dy)
        // 限制不超出视口边界
        const maxW = Math.max(MIN_W, vw - MARGIN - optX)
        const maxH = Math.max(MIN_H, vh - MARGIN - optY)
        nextW = Math.min(nextW, maxW)
        nextH = Math.min(nextH, maxH)
        setOptWidth(nextW)
        setOptHeight(nextH)
      }
    }
    const onUp = () => {
      if (dragRef.current.dragging || resizeRef.current.resizing) {
        dragRef.current.dragging = false
        resizeRef.current.resizing = false
        document.body.style.userSelect = ''
        document.body.style.cursor = ''

        // 吸附与贴边展开
        const vw = window.innerWidth
        const vh = window.innerHeight
        let nx = optX
        let ny = optY
        let nw = optWidth
        let nh = optHeight
        const nearLeft = nx - MARGIN <= SNAP
        const nearRight = vw - (nx + nw) - MARGIN <= SNAP
        const nearTop = ny - MARGIN <= SNAP
        const nearBottom = vh - (ny + nh) - MARGIN <= SNAP

        if (nearLeft) {
          nx = MARGIN
          ny = MARGIN
          nh = Math.max(MIN_H, vh - MARGIN * 2) // 贴边展开到满高（保留边距）
        }
        if (nearRight) {
          nx = Math.max(MARGIN, vw - nw - MARGIN)
          ny = MARGIN
          nh = Math.max(MIN_H, vh - MARGIN * 2)
        }
        if (nearTop) {
          ny = MARGIN
          nx = MARGIN
          nw = Math.max(MIN_W, vw - MARGIN * 2) // 顶部贴边展开到满宽
        }
        if (nearBottom) {
          ny = Math.max(MARGIN, vh - nh - MARGIN)
          nx = MARGIN
          nw = Math.max(MIN_W, vw - MARGIN * 2)
        }

        // 最终边界校正
        const maxX = Math.max(MARGIN, vw - nw - MARGIN)
        const maxY = Math.max(MARGIN, vh - nh - MARGIN)
        nx = clamp(nx, MARGIN, maxX)
        ny = clamp(ny, MARGIN, maxY)
        nw = clamp(nw, MIN_W, vw - MARGIN - nx)
        nh = clamp(nh, MIN_H, vh - MARGIN - ny)

        setOptX(nx)
        setOptY(ny)
        setOptWidth(nw)
        setOptHeight(nh)

        try {
          localStorage.setItem('opt_dialog_x', String(nx))
          localStorage.setItem('opt_dialog_y', String(ny))
          localStorage.setItem('opt_dialog_w', String(nw))
          localStorage.setItem('opt_dialog_h', String(nh))
        } catch {}
      }
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [optX, optY, optWidth, optHeight])

  // Esc 关闭（全局），避免与 Monaco 冲突：仅当浮窗打开且焦点不在编辑器内时生效
  useEffect(() => {
    if (!optOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOptOpen(false)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [optOpen])

  const openOptimizeDialog = async () => {
    try {
      setOptOpen(true)
      setOptLoading(true)
      setOptError('')
      setOptData(null)
      const sqlText = editorRef.current?.getValue() || ''
      const stored = localStorage.getItem('ai_models')
      const models = stored ? JSON.parse(stored) : []
      const optimizeId = localStorage.getItem('ai_selected_optimize_model_id') || ''
      const model = models.find((m: any) => String(m.id) === String(optimizeId)) || null
      const payload: any = { sql: sqlText }
      if (model) {
        payload.modelConfig = {
          baseUrl: model.baseUrl,
          apiKey: model.apiKey,
          model: model.model,
          temperature: model.temperature,
          systemPrompt: model.systemPrompt,
          userPrompt: model.userPrompt,
        }
        payload.variables = { sqlText }
      }
      const { data } = await api.post('/api/sql/optimize', payload)
      setOptData({
        syntaxErrors: data?.syntaxErrors || [],
        performanceSuggestions: data?.performanceSuggestions || [],
        optimizedSql: data?.optimizedSql || ''
      })
    } catch (err: any) {
      setOptError(err?.response?.data?.error || err?.message || '优化失败')
    } finally {
      setOptLoading(false)
    }
  }

  const onMount: OnMount = (editor) => {
    editorRef.current = editor
    console.log('Monaco编辑器已挂载')

    // 禁用 Monaco 默认右键菜单（已在 Editor props 中设定 contextmenu: false），同时补充在编辑器内部捕获右键打开自定义菜单
    try {
      const domNode = editor.getDomNode()
      if (domNode) {
        domNode.addEventListener('contextmenu', (e: MouseEvent) => {
          e.preventDefault()
          setEditorContextMenu({ open: true, x: e.clientX, y: e.clientY })
        })
      }
    } catch {}
    
    
    // 初始化默认页签，使用当前模型；仅在无任何页签时创建，避免覆盖已有页签
    const initialModel = editor.getModel()
    const defaultTitle = '未命名'

    // 优先尝试恢复本地快照的页签与内容
    let restoredAny = false
    try {
      const snap = localStorage.getItem('editor_tabs_snapshot')
      const activeIdxStr = localStorage.getItem('active_editor_index')
      const activeIdx = activeIdxStr ? Number(activeIdxStr) : 0
      if (snap) {
        const list: { id: string; title: string; content: string }[] = JSON.parse(snap)
        const monaco = (window as any).monaco
        if (monaco?.editor && Array.isArray(list) && list.length > 0) {
          const restored = list.map(item => ({
            id: item.id,
            title: item.title || '未命名',
            model: monaco.editor.createModel(item.content || '', 'pgsql')
          }))
          setEditorTabs(restored)
          const nextIdx = Math.min(Math.max(activeIdx, 0), restored.length - 1)
          setActiveEditorIndex(nextIdx)
          const activeTab = restored[nextIdx]
          if (activeTab?.model) editorRef.current.setModel(activeTab.model)
          restoredAny = true
        }
      }
    } catch (e) {
      console.warn('恢复编辑器页签失败:', e)
    }

    // 若未恢复任何页签，则创建默认页签
    if (!restoredAny && initialModel) {
      setEditorTabs(prev => {
        if (prev.length > 0) return prev
        return [{ id: String(Date.now()), title: defaultTitle, model: initialModel }]
      })
      setActiveEditorIndex(curr => (typeof curr === 'number' && curr >= 0 ? curr : 0))
    }

    // 结束恢复阶段，允许后续持久化
    isRestoringRef.current = false

    // 编辑器挂载完成后检查ERD SQL
    setTimeout(() => {
      console.log('编辑器挂载完成，检查ERD SQL')
      checkAndCreateErdTab()
    }, 100)

    editor.onDidChangeCursorSelection(() => {
      const selection = editor.getSelection()
      if (!selection) return
      const model = editor.getModel()
      if (!model) return
      const text = model.getValueInRange(selection)
      setSelectedText(text)
    })

    // 兼容性粘贴兜底：某些环境下原生粘贴被浏览器策略限制，手动读取剪贴板插入
    try {
      const monaco = (window as any).monaco
      // 统一拦截 DOM 的 paste 事件：适配右键“Paste”和快捷键粘贴，保证可用
      const domNode = editor.getDomNode()
      if (domNode) {
        const handlePaste = async (evt: any) => {
          try {
            let text = ''
            if (evt.clipboardData) {
              text = evt.clipboardData.getData('text/plain') || ''
            }
            if (!text && navigator.clipboard?.readText) {
              try { text = await navigator.clipboard.readText() } catch {}
            }
            if (!text) return // 没拿到文本，交给默认粘贴逻辑
            evt.preventDefault()
            editor.focus()
            const sel = editor.getSelection()
            const Range = monaco.Range
            if (sel) {
              const range = new Range(sel.startLineNumber, sel.startColumn, sel.endLineNumber, sel.endColumn)
              editor.executeEdits('paste', [{ range, text }])
            } else {
              const pos = editor.getPosition()
              if (!pos) return
              const range = new Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column)
              editor.executeEdits('paste', [{ range, text }])
            }
          } catch {}
        }
        // 绑定到容器（兜底）
        domNode.addEventListener('paste', handlePaste, { capture: true })
        // 绑定到内部隐藏 textarea（Monaco 实际接收粘贴的元素）
        const textArea = domNode.querySelector('textarea')
        if (textArea) {
          textArea.addEventListener('paste', handlePaste, { capture: true })
        }
        // 覆盖内置 Paste 动作：保证右键菜单“Paste”执行我们实现
        editor.addAction({
          id: 'editor.action.clipboardPasteAction',
          label: 'Paste',
          contextMenuGroupId: '9_cutcopypaste',
          contextMenuOrder: 1.0,
          run: async (ed: any) => {
            try {
              ed.focus()
              let text = ''
              if (navigator.clipboard?.readText) {
                try { text = await navigator.clipboard.readText() } catch {}
              }
              if (!text) {
                // 尝试从选中文本的剪贴板事件路径获取（右键菜单通常视为用户手势）
                // 若仍拿不到，则回退触发内置命令（部分浏览器可能有效）
                try { (ed as any).trigger('keyboard', 'editor.action.clipboardPasteAction', null) } catch {}
                return
              }
              const sel = ed.getSelection()
              const Range = monaco.Range
              if (sel) {
                const range = new Range(sel.startLineNumber, sel.startColumn, sel.endLineNumber, sel.endColumn)
                ed.executeEdits('paste', [{ range, text }])
              } else {
                const pos = ed.getPosition()
                if (!pos) return
                const range = new Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column)
                ed.executeEdits('paste', [{ range, text }])
              }
            } catch {}
          }
        })
      }
    } catch {}
  }

  // 关闭页签
  const closeTab = (index: number) => {
    setEditorTabs(prev => {
      if (index < 0 || index >= prev.length) return prev
      const toClose = prev[index]
      const monaco = (window as any).monaco
      if (toClose?.model && monaco?.editor) {
        try { toClose.model.dispose?.() } catch {}
      }
      const next = [...prev.slice(0, index), ...prev.slice(index + 1)]
      // 更新激活索引
      if (next.length === 0) {
        // 创建空白页签
        const model = monaco?.editor?.createModel('', 'pgsql')
        const newTab = { id: String(Date.now()), title: '未命名', model }
        setActiveEditorIndex(0)
        if (editorRef.current && model) editorRef.current.setModel(model)
        return [newTab]
      }
      // 如果关闭的是当前激活页签，选择左侧一个
      setActiveEditorIndex(curr => {
        if (curr === index) return Math.max(0, index - 1)
        if (curr > index) return curr - 1
        return curr
      })
      // 同步编辑器模型
      setTimeout(() => {
        const active = (typeof activeEditorIndex === 'number') ? activeEditorIndex : 0
        const nextActive = Math.min(active, next.length - 1)
        const tab = next[nextActive]
        if (tab && editorRef.current) editorRef.current.setModel(tab.model)
      }, 0)
      return next
    })
  }

  // 重命名页签
  const renameTab = (index: number) => {
    const title = prompt('重命名页签：')
    if (title == null) return
    setEditorTabs(prev => prev.map((t, i) => i === index ? { ...t, title: title || '未命名' } : t))
  }

  // 拖拽排序
  const moveTab = (from: number, to: number) => {
    setEditorTabs(prev => {
      if (from === to || from < 0 || to < 0 || from >= prev.length || to >= prev.length) return prev
      const next = [...prev]
      const [item] = next.splice(from, 1)
      next.splice(to, 0, item)
      // 修正激活索引
      setActiveEditorIndex(curr => {
        if (curr === from) return to
        if (from < curr && to >= curr) return curr - 1
        if (from > curr && to <= curr) return curr + 1
        return curr
      })
      return next
    })
  }

  // 计算溢出隐藏的页签：保证当前激活页签始终可见
  // 监听容器宽度变化：分割线拖动时也会触发
  useEffect(() => {
    const el = tabStripRef.current
    if (!el) return
    const ro = new (window as any).ResizeObserver((entries: any[]) => {
      for (const entry of entries) {
        const cw = entry.contentRect?.width || el.clientWidth
        setTabStripWidth(cw)
      }
    })
    try { ro.observe(el) } catch {}
    setTabStripWidth(el.clientWidth)
    return () => { try { ro.disconnect() } catch {} }
  }, [])

  useEffect(() => {
    const container = tabStripRef.current
    if (!container) return
    // 使用隐藏测量容器测量所有标签项宽度（包含关闭按钮）
    const measure = measureRef.current || container
    const tabs = Array.from(measure.querySelectorAll('[data-tab-id]')) as HTMLElement[]
    // 动态测量“更多”按钮实际宽度（若不可见则按80px预估）
    let moreWidth = 80
    const moreEl = moreMenuWrapperRef.current
    if (moreEl) {
      const rect = moreEl.getBoundingClientRect()
      if (rect && rect.width) moreWidth = Math.max(64, Math.ceil(rect.width))
    }
    const maxWidth = Math.max(0, (tabStripWidth || container.clientWidth) - moreWidth)
    if (tabs.length === 0) { setHiddenTabIds([]); return }

    // 测量宽度
    let total = 0
    const widths = tabs.map(el => {
      const id = el.getAttribute('data-tab-id') || ''
      const w = el.getBoundingClientRect().width
      tabWidthCacheRef.current.set(id, w)
      return { id, w }
    })

    const activeId = editorTabs[activeEditorIndex]?.id
    const ordered = widths.sort((a, b) => {
      if (a.id === activeId) return -1
      if (b.id === activeId) return 1
      return 0
    })

    const visible: string[] = []
    const hidden: string[] = []
    for (const item of ordered) {
      if (total + item.w <= maxWidth) {
        visible.push(item.id)
        total += item.w
      } else {
        hidden.push(item.id)
      }
    }

    // 保证激活项可见
    if (activeId && hidden.includes(activeId)) {
      hidden.splice(hidden.indexOf(activeId), 1)
      visible.push(activeId)
      const candidate = visible.find(id => id !== activeId)
      if (candidate) {
        visible.splice(visible.indexOf(candidate), 1)
        hidden.push(candidate)
      }
    }

    const hiddenSet = new Set(hidden)
    setHiddenTabIds(editorTabs.map(t => t.id).filter(id => hiddenSet.has(id)))
  }, [editorTabs, activeEditorIndex, splitPct, tabStripWidth])

  // 若激活页签被隐藏（溢出到“更多”），将激活值切换到第一个可见页签，避免 Tabs 报错
  useEffect(() => {
    const activeId = editorTabs[activeEditorIndex]?.id
    const visible = editorTabs.filter(t => !hiddenTabIds.includes(t.id))
    if (!activeId && visible.length > 0) {
      const nextIdx = editorTabs.findIndex(t => t.id === visible[0].id)
      if (nextIdx >= 0) setActiveEditorIndex(nextIdx)
      return
    }
    if (activeId && !visible.some(t => t.id === activeId) && visible.length > 0) {
      const nextIdx = editorTabs.findIndex(t => t.id === visible[0].id)
      if (nextIdx >= 0) setActiveEditorIndex(nextIdx)
    }
  }, [editorTabs, activeEditorIndex, hiddenTabIds])

  const run = (selected: boolean) => {
    const sqlText = editorRef.current?.getValue() || ''
    const payload = {
      sqlText,
      runSelectedOnly: selected,
      selectedText: selected ? selectedText : undefined,
      readOnly: opts.readOnly,
      maxRows: opts.maxRows,
      timeoutSeconds: opts.timeoutSeconds,
      useTransaction: opts.useTransaction
    }
    execMutation.mutate(payload)
  }

  const escapeHtml = (s: string) => s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  const highlightSql = (s: string) => {
    const src = escapeHtml(s)
    // Basic highlighting: comments, strings, keywords
    const withComments = src.replace(/(^|\n)\s*--.*(?=\n|$)/g, (m) => `<span style="color:#9aa5b1">${m}</span>`) // line comments
    const withStrings = withComments.replace(/('(?:''|[^'])*')/g, '<span style="color:#e6db74">$1</span>')
    const kw = ['SELECT','INSERT','UPDATE','DELETE','FROM','WHERE','GROUP','BY','ORDER','JOIN','LEFT','RIGHT','INNER','OUTER','ON','AS','COUNT','SUM','AVG','MIN','MAX','DISTINCT','LIMIT','OFFSET','AND','OR','NOT','IN','BETWEEN','LIKE','HAVING','CASE','WHEN','THEN','ELSE','END','CREATE','ALTER','DROP']
    const re = new RegExp(`\\b(${kw.join('|')})\\b`, 'gi')
    const withKw = withStrings.replace(re, '<span style="color:#67cdcc">$1</span>')
    return withKw
  }

  const formatSql = () => {
    const sqlText = editorRef.current?.getValue() || ''
    const formatted = format(sqlText, { language: 'postgresql' })
    editorRef.current?.setValue(formatted)
  }

  const saveQuery = async () => {
    const sqlText = editorRef.current?.getValue() || ''
    const title = prompt('标题') || '未命名'
    const description = prompt('描述') || ''
    await api.post('/api/queries', { title, description, sqlText, tags: [] })
    qc.invalidateQueries({ queryKey: ['saved'] })
    setRightActiveTab('saved')
  }

  const exportCsv = (result: QueryResult) => {
    const rows = result.rows || []
    if (!rows.length) return
    const csv = Papa.unparse(rows)
    download('result.csv', csv)
  }

  const insertAssistantToEditor = (text: string) => {
    const ed = editorRef.current
    if (!ed || !text) return
    const monaco = (window as any).monaco
    const sel = ed.getSelection()
    const Range = monaco?.Range
    if (sel && Range) {
      const range = new Range(sel.startLineNumber, sel.startColumn, sel.endLineNumber, sel.endColumn)
      ed.executeEdits('insert', [{ range, text }])
    } else {
      const pos = ed.getPosition()
      if (!pos || !Range) return
      const range = new Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column)
      ed.executeEdits('insert', [{ range, text }])
    }
    ed.focus()
  }

  const askAI = async () => {
    if (!instruction.trim()) return
    if (chatMode) {
      setChatMessages(prev => {
        const out: ChatMsg[] = [
          ...prev,
          { id: `u_${Date.now()}`, role: 'user' as const, content: instruction },
          { id: `a_${Date.now()}`, role: 'assistant' as const, content: '', isTyping: true }
        ]
        try { localStorage.setItem('chat_messages', JSON.stringify(out)) } catch {}
        return out
      })
    } else {
      setCandidateSql('')
    }
    const sqlText = editorRef.current?.getValue() || ''
    const variables = { instruction, selectedText, sqlText }

    // 若选择的是工作流（值以 wf: 前缀），走工作流执行（流式）
    if (selectedModelId && selectedModelId.startsWith('wf:')) {
      try {
        const wfId = selectedModelId.slice(3)
        const listStr = localStorage.getItem('workflows') || '[]'
        const list = JSON.parse(listStr) as any[]
        const item = list.find(x => String(x.id) === String(wfId) && !!x.published)
        if (!item) {
          setSnackMsg('工作流不存在或未发布')
          setSnackOpen(true)
          return
        }
        // 注入 provider/model 配置到 LLM 节点
        const inject = (wf: any) => {
          try {
            const providers = JSON.parse(localStorage.getItem('ai_providers') || '[]') as any[]
            const modelsOld = JSON.parse(localStorage.getItem('ai_models') || '[]') as any[]
            const clone = JSON.parse(JSON.stringify(wf || { nodes: [], edges: [] }))
            for (const n of (clone.nodes || [])) {
              const kind = n?.data?.kind
              if (kind === 'llm') {
                const providerId = n?.data?.providerId
                const modelName = n?.data?.model
                if (providerId) {
                  const p = providers.find((x: any) => x.id === providerId)
                  if (p) {
                    n.data.baseUrl = p.baseUrl || p.BaseUrl || ''
                    n.data.apiKey = p.apiKey || p.ApiKey || ''
                    if (modelName) n.data.model = modelName
                  }
                } else if (n?.data?.modelId) {
                  const m = modelsOld.find((x: any) => x.id === n.data.modelId)
                  if (m) {
                    n.data.baseUrl = m.baseUrl || m.BaseUrl || ''
                    n.data.apiKey = m.apiKey || m.ApiKey || ''
                    n.data.model = m.model || m.Model || ''
                  }
                }
              }
            }
            return clone
          } catch { return wf }
        }
        const wfToRun = inject(item.data)

        // 发起流式请求（优先 SSE），将增量写入候选 SQL
        const response = await fetch('/api/workflow/execute', {
          method: 'POST',
          headers: (() => {
            const h: any = { 'Content-Type': 'application/json', 'Accept': 'text/event-stream, application/json;q=0.9, text/plain;q=0.8' }
            const t = localStorage.getItem('token'); if (t) h['Authorization'] = `Bearer ${t}`
            try {
              const db = JSON.parse(localStorage.getItem('db_connection') || 'null')
              if (db && typeof db === 'object') {
                if (db.host) h['x-db-host'] = String(db.host)
                if (db.port) h['x-db-port'] = String(db.port)
                if (db.database) h['x-db-database'] = String(db.database)
                if (db.username) h['x-db-username'] = String(db.username)
                if (db.password) h['x-db-password'] = String(db.password)
                if (db.ssl != null) h['x-db-ssl'] = String(!!db.ssl)
              }
            } catch {}
            return h
          })(),
          body: JSON.stringify({ ...wfToRun, InitialInput: instruction })
        })
        if (!response.ok) {
          const errText = await response.text().catch(() => '')
          throw new Error(errText || `HTTP ${response.status}`)
        }
        const contentType = (response.headers.get('content-type') || '').toLowerCase()

        if (contentType.includes('text/event-stream')) {
          const reader = response.body?.getReader()
          const decoder = new TextDecoder()
          let buffer = ''
          const append = (delta: string) => {
            const d = String(delta || '')
            if (chatMode) appendAssistantDelta(d)
            else setCandidateSql(prev => (prev || '') + d)
          }
          const flushEvent = (chunk: string) => {
            const lines = chunk.split(/\r?\n/)
            let eventName: string | undefined
            const dataLines: string[] = []
            for (const line of lines) {
              if (line.startsWith('event:')) eventName = line.slice(6).trim()
              else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim())
            }
            const dataStr = dataLines.join('\n')
            if (!dataStr) return
            try {
              const payload = JSON.parse(dataStr)
              if (eventName === 'end' || payload?.event === 'end' || payload?.done) {
                const finalOutput = payload?.output ?? payload?.context?.output
                if (finalOutput !== undefined) {
                  const text = typeof finalOutput === 'string' ? finalOutput : JSON.stringify(finalOutput, null, 2)
                  setCandidateSql(text)
                }
                return
              }
              const delta = payload?.delta ?? payload?.content ?? payload?.text
              if (delta) append(String(delta))
            } catch {
              append(dataStr)
            }
          }
          if (!reader) {
            const text = await response.text()
            setCandidateSql(text)
          } else {
            while (true) {
              const { value, done } = await reader.read()
              if (done) break
              buffer += decoder.decode(value, { stream: true })
              const parts = buffer.split(/\n\n/)
              buffer = parts.pop() || ''
              for (const part of parts) flushEvent(part)
            }
            if (buffer.trim()) flushEvent(buffer)
          }
          return
        }

        if (contentType.includes('application/json')) {
          const data = await response.json()
          const finalOutput = data?.output ?? data?.context?.output ?? ''
          const text = typeof finalOutput === 'string' ? finalOutput : JSON.stringify(finalOutput, null, 2)
          if (chatMode) setAssistantFinal(text)
          else setCandidateSql(text)
          return
        }

        // 其他内容类型，作为纯文本/分块读取
        if (response.body) {
          const reader = response.body.getReader()
          const decoder = new TextDecoder()
          let acc = ''
          while (true) {
            const { value, done } = await reader.read()
            if (done) break
            acc += decoder.decode(value, { stream: true })
            setCandidateSql(acc)
          }
        } else {
          const text = await response.text()
          setCandidateSql(text)
        }
      } catch (error: any) {
        const msg = error?.message || '工作流执行失败'
        setSnackMsg(msg)
        setSnackOpen(true)
      }
      return
    }

    // 否则走原有模型生成逻辑（兼容 v2 模型与提供商）并优先尝试 SSE 流式
    const picked = models.find(m => String(m.id) === String(selectedModelId)) || null
    let modelConfig: any = undefined
    if (picked) {
      try {
        const providers = JSON.parse(localStorage.getItem('ai_providers') || '[]') || []
        const prov = providers.find((p: any) => String(p.id) === String(picked.providerId))
        modelConfig = {
          baseUrl: prov?.baseUrl || picked.baseUrl || picked.BaseUrl || '',
          apiKey: prov?.apiKey || picked.apiKey || picked.ApiKey || '',
          model: picked.model || picked.Model || '',
          temperature: Number(picked.temperature ?? 0.2),
          systemPrompt: String(picked.systemPrompt || ''),
          userPrompt: String(picked.userPrompt || '')
        }
      } catch {
        modelConfig = picked
      }
    }

    try {
      setIsGenerating(true)
      setCandidateSql('')
      const response = await fetch('/api/sql/generate', {
        method: 'POST',
        headers: (() => {
          const h: any = { 'Content-Type': 'application/json', 'Accept': 'text/event-stream, application/json;q=0.9, text/plain;q=0.8' }
          const t = localStorage.getItem('token'); if (t) h['Authorization'] = `Bearer ${t}`
          try {
            const db = JSON.parse(localStorage.getItem('db_connection') || 'null')
            if (db && typeof db === 'object') {
              if (db.host) h['x-db-host'] = String(db.host)
              if (db.port) h['x-db-port'] = String(db.port)
              if (db.database) h['x-db-database'] = String(db.database)
              if (db.username) h['x-db-username'] = String(db.username)
              if (db.password) h['x-db-password'] = String(db.password)
              if (db.ssl != null) h['x-db-ssl'] = String(!!db.ssl)
            }
          } catch {}
          return h
        })(),
        body: JSON.stringify({ instruction, modelConfig, variables })
      })
      if (!response.ok) {
        const errText = await response.text().catch(() => '')
        throw new Error(errText || `HTTP ${response.status}`)
      }
      const contentType = (response.headers.get('content-type') || '').toLowerCase()
      if (contentType.includes('text/event-stream')) {
        const reader = response.body?.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        const append = (delta: string) => {
          const d = String(delta || '')
          if (chatMode) appendAssistantDelta(d)
          else setCandidateSql(prev => (prev || '') + d)
        }
        const flushEvent = (chunk: string) => {
          const lines = chunk.split(/\r?\n/)
          let eventName: string | undefined
          const dataLines: string[] = []
          for (const line of lines) {
            if (line.startsWith('event:')) eventName = line.slice(6).trim()
            else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim())
          }
          const dataStr = dataLines.join('\n')
          if (!dataStr) return
          try {
            const payload = JSON.parse(dataStr)
            if (eventName === 'end' || payload?.event === 'end' || payload?.done) {
              const finalOutput = payload?.sql ?? payload?.output ?? payload?.context?.output
              if (finalOutput !== undefined) {
                const text = typeof finalOutput === 'string' ? finalOutput : JSON.stringify(finalOutput, null, 2)
                setCandidateSql(text)
              }
              return
            }
            const delta = payload?.delta ?? payload?.content ?? payload?.text ?? payload?.sql
            if (delta) append(String(delta))
          } catch {
            append(dataStr)
          }
        }
        if (!reader) {
          const text = await response.text()
          setCandidateSql(text)
        } else {
          while (true) {
            const { value, done } = await reader.read()
            if (done) break
            buffer += decoder.decode(value, { stream: true })
            const parts = buffer.split(/\n\n/)
            buffer = parts.pop() || ''
            for (const part of parts) flushEvent(part)
          }
          if (buffer.trim()) flushEvent(buffer)
        }
      } else if (contentType.includes('application/json')) {
        const data = await response.json()
        const finalOutput = data?.sql ?? data?.output ?? data?.context?.output ?? ''
        const text = typeof finalOutput === 'string' ? finalOutput : JSON.stringify(finalOutput, null, 2)
        setCandidateSql(text)
      } else {
        if (response.body) {
          const reader = response.body.getReader()
          const decoder = new TextDecoder()
          let acc = ''
          while (true) {
            const { value, done } = await reader.read()
            if (done) break
            acc += decoder.decode(value, { stream: true })
            setCandidateSql(acc)
          }
        } else {
          const text = await response.text()
          setCandidateSql(text)
        }
      }
    } catch (error: any) {
      const msg = error?.message || 'AI 生成失败'
      setSnackMsg(msg)
      setSnackOpen(true)
    } finally {
      setIsGenerating(false)
    }
  }

  const loadExampleInstruction = async () => {
    try {
      const { data } = await api.get('/api/schema')
      const docs = Array.isArray(data) ? data : []
      const pick = docs.find((d: any) => (d.tableName || d.TableName) === 'orders') || docs[0]
      let text = ''
      if (pick) {
        const schema = pick.schemaName || pick.SchemaName || 'public'
        const table = pick.tableName || pick.TableName || 'orders'
        const doc = (pick.document || pick.Document || '') as string
        const hasOrderDate = /order_date/i.test(doc)
        const hasTotalAmount = /total_amount/i.test(doc)
        const hasCustomerId = /customer_id/i.test(doc)
        if (table === 'orders' || (hasOrderDate && hasTotalAmount && hasCustomerId)) {
          text = `请生成一条 SQL：统计过去30天内每位客户的订单总金额和订单数量，按总金额降序排序，返回前10名。数据来源表：${schema}.${table}，涉及字段：order_date、total_amount、customer_id。`
        } else {
          text = `请基于表 ${schema}.${table} 生成一个常见查询示例：统计过去30天内的记录数量，并按一个合理的维度分组与排序，返回前10行。`
        }
      } else {
        text = '请生成一个示例查询：统计过去30天内的订单总金额并按客户分组，返回前10名。'
      }
      setInstruction(text)
      setSnackMsg('已加载示例需求')
      setSnackOpen(true)
    } catch (e) {
      setInstruction('请生成一个示例查询：统计过去30天内的订单总金额并按客户分组，返回前10名。')
      setSnackMsg('未找到Schema，已加载默认示例')
      setSnackOpen(true)
    }
  }

  const insertGenerated = () => {
    const erdSql = localStorage.getItem('erd_generated_sql') || ''
    const fullText = erdSql || candidateSql || ''
    if (!fullText) return
    const ed = editorRef.current
    if (!ed) return
    const monaco = (window as any).monaco

    // 若右侧非对话模式下选择了部分内容，则仅插入选中部分，否则插入全部
    // 优先使用在按钮按下时捕获的选中文本，避免点击后丢失选区
    let textToInsert = (candidateSelectionRef.current || '').trim() || fullText
    // 兜底：仍尝试获取当前选区（若存在）
    if (!candidateSelectionRef.current) {
      const selection = window.getSelection?.()
      if (selection && String(selection.toString()).trim()) {
        textToInsert = String(selection.toString())
      }
    }
    candidateSelectionRef.current = ''
    // 插入到编辑器：有选区则替换选区，否则在光标处插入
    const sel = ed.getSelection()
    const Range = monaco?.Range
    if (sel && Range) {
      const range = new Range(sel.startLineNumber, sel.startColumn, sel.endLineNumber, sel.endColumn)
      ed.executeEdits('insert', [{ range, text: `\n${textToInsert}\n` }])
    } else {
      const pos = ed.getPosition()
      if (!pos || !Range) return
      const range = new Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column)
      ed.executeEdits('insert', [{ range, text: `\n${textToInsert}\n` }])
    }
    ed.focus()
    if (erdSql) localStorage.removeItem('erd_generated_sql')
  }

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <AppBar position="static" color="primary" elevation={0}>
        <Toolbar>
          <Typography variant="h6" sx={{ flex: 1, color: '#fff' }}>SPDSQL - SQL 智能编写器</Typography>
          <Stack direction="row" spacing={1}>
            <Button variant="outlined" sx={{ color: '#fff', borderColor: '#fff' }} onClick={() => { window.location.hash = '#/erd' }}>实体关系图</Button>
            <Button variant="outlined" sx={{ color: '#fff', borderColor: '#fff' }} onClick={() => { window.location.hash = '#/workflow' }}>工作流编辑器</Button>
            <Button variant="outlined" sx={{ color: '#fff', borderColor: '#fff' }} onClick={() => { window.location.hash = '#/settings' }}>设置</Button>
            <Tooltip title={(userDisplay && userDisplay.trim()) ? userDisplay : (userRole ? '已登录' : '未登录')}>
              <Box onClick={(e) => setUserMenuEl(e.currentTarget)} sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', color: '#fff', cursor: 'pointer' }}>
                <Avatar sx={{ width: 32, height: 32, bgcolor: 'rgba(255,255,255,0.2)', color: '#fff', fontSize: 14 }} src={userAvatarUrl || '/default-avatar.svg'} onError={() => { setUserAvatarUrl('') }}>
                  {((userDisplay && userDisplay.trim()) ? userDisplay : (userRole ? '已登录' : '未登录')).slice(0, 2).toUpperCase()}
                </Avatar>
                <Typography variant="caption" sx={{ color: '#fff', mt: 0.5 }}>
                  {(userDisplay && userDisplay.trim()) ? userDisplay : (userRole ? '已登录' : '未登录')}
                </Typography>
              </Box>
            </Tooltip>
            <Divider orientation="vertical" flexItem sx={{ borderColor: 'rgba(255,255,255,0.5)' }} />
            <Menu
              anchorEl={userMenuEl}
              open={userMenuOpen}
              onClose={() => setUserMenuEl(null)}
              slotProps={{ paper: { sx: { mt: 1, minWidth: 200 } } } as any}
            >
              <MenuItem disabled>
                <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>{(userDisplay && userDisplay.trim()) ? userDisplay : (userRole ? '已登录' : '未登录')}</Typography>
                  {userRole ? (
                    <Typography variant="caption" color="text.secondary">角色：{roleDisplay}</Typography>
                  ) : null}
                </Box>
              </MenuItem>
              <Divider />
              {String(userRole || '').toLowerCase() === 'admin' ? (
                <MenuItem onClick={() => { setUserMenuEl(null); window.location.hash = '#/users' }}>用户管理</MenuItem>
              ) : null}
              {/* <MenuItem onClick={() => { setUserMenuEl(null); window.location.hash = '#/settings' }}>设置</MenuItem> */}
              <MenuItem onClick={() => {
                setUserMenuEl(null)
                const token = localStorage.getItem('token')
                if (!token) return window.location.reload()
                localStorage.removeItem('token'); localStorage.removeItem('role'); localStorage.removeItem('username');
                setAuthToken(null); window.location.reload()
              }}>退出</MenuItem>
            </Menu>


          </Stack>
        </Toolbar>
      </AppBar>


      <Container maxWidth={false} sx={{ flex: 1, display: 'flex', gap: 0, py: 2, overflow: 'hidden' }} ref={containerRef}>
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', border: '1px solid #ddd', borderRadius: 1, overflow: 'hidden' }}>
          <Stack direction="column" spacing={0} sx={{ p: 1 }}>
            {/* 第一行：仅按钮 */}
            <Stack direction="row" spacing={1} alignItems="center">
              <Button variant="contained" startIcon={<PlayArrowIcon />} onClick={() => run(false)} disabled={execMutation.isPending}>运行</Button>
              <Button startIcon={<PlayArrowIcon />} onClick={() => run(true)} disabled={execMutation.isPending}>运行选中</Button>
              <Button startIcon={<FormatAlignLeftIcon />} onClick={formatSql}>格式化</Button>
              <Button onClick={openOptimizeDialog}>AI性能优化</Button>
              <Box sx={{ flex: 1 }} />
              <Button onClick={() => {
                if (!editorRef.current) return
                const monaco = (window as any).monaco
                const model = monaco?.editor?.createModel('', 'pgsql')
                const newTab = { id: String(Date.now()), title: '未命名', model }
                setEditorTabs(prev => {
                  const next = [...prev, newTab]
                  try {
                    const list = next.map(t => ({ id: t.id, title: t.title, content: t.model?.getValue?.() || '' }))
                    localStorage.setItem('editor_tabs_snapshot', JSON.stringify(list))
                  } catch {}
                  return next
                })
                setActiveEditorIndex(editorTabs.length)
                try { localStorage.setItem('active_editor_index', String(editorTabs.length)) } catch {}
                if (model) editorRef.current.setModel(model)
              }}>新增</Button>              
              <Button startIcon={<SaveIcon />} onClick={async () => {
                const current = editorTabs[activeEditorIndex]
                const sqlText = current?.model?.getValue?.() || editorRef.current?.getValue() || ''
                const defaultTitle = current?.title || '未命名'
                const title = (defaultTitle && defaultTitle !== '未命名')
                  ? defaultTitle.trim()
                  : (prompt('标题', defaultTitle) || defaultTitle).trim()
                if (title === '未命名') {
                  setSnackMsg('请先重命名页签后再保存')
                  setSnackOpen(true)
                  return
                }
                const description = ''
                await api.post('/api/queries', { title, description, sqlText, tags: [] })
                qc.invalidateQueries({ queryKey: ['saved'] })
                setEditorTabs(prev => prev.map((t, i) => i === activeEditorIndex ? { ...t, title } : t))
                setSnackMsg('已保存成功')
                setSnackOpen(true)
              }}>保存</Button>
              <Button startIcon={<SaveIcon />} onClick={async () => {
                // 拦截任何标题为“未命名”的页签
                const unnamedIndex = editorTabs.findIndex(t => (t.title || '未命名').trim() === '未命名')
                if (unnamedIndex !== -1) {
                  setSnackMsg('存在未命名页签，请先重命名后再进行“全部保存”')
                  setSnackOpen(true)
                  setActiveEditorIndex(unnamedIndex)
                  const tab = editorTabs[unnamedIndex]
                  if (tab && editorRef.current && tab.model) editorRef.current.setModel(tab.model)
                  return
                }
                const requests = editorTabs.map(t => {
                  const sqlText = t?.model?.getValue?.() || ''
                  const title = (t.title || '未命名').trim()
                  const description = ''
                  return api.post('/api/queries', { title, description, sqlText, tags: [] })
                })
                await Promise.all(requests)
                qc.invalidateQueries({ queryKey: ['saved'] })
                setSnackMsg('全部保存成功')
                setSnackOpen(true)
              }}>全部保存</Button>

            </Stack>

            {/* 第二行：页签单独一行 */}
            <Box sx={{ mt: 0.5, display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Box sx={{ flex: 1, minWidth: 0, position: 'relative' }} ref={tabStripRef}>
                <Tabs
                  value={(() => {
                    const activeId = editorTabs[activeEditorIndex]?.id || ''
                    const visible = editorTabs.filter(t => !hiddenTabIds.includes(t.id))
                    const idx = visible.findIndex(t => t.id === activeId)
                    return idx >= 0 ? idx : 0
                  })()}
                  onChange={(e, v) => {
                    const visible = editorTabs.filter(t => !hiddenTabIds.includes(t.id))
                    const picked = visible[v]
                    const nextIdx = editorTabs.findIndex(t => t.id === picked?.id)
                    const finalIdx = nextIdx >= 0 ? nextIdx : 0
                    setActiveEditorIndex(finalIdx)
                    const tab = editorTabs[finalIdx]
                    if (tab && editorRef.current) {
                      editorRef.current.setModel(tab.model)
                    }
                    try {
                      localStorage.setItem('active_editor_index', String(finalIdx))
                      const list = editorTabs.map(t => ({ id: t.id, title: t.title, content: t.model?.getValue?.() || '' }))
                      localStorage.setItem('editor_tabs_snapshot', JSON.stringify(list))
                    } catch {}
                  }}
                  variant="scrollable"
                  scrollButtons="auto"
                  sx={{ minHeight: 36, '& .MuiTab-root': { textTransform: 'none', minHeight: 36, py: 0.5, alignItems: 'flex-start', whiteSpace: 'nowrap', lineHeight: 1.2 }, '& .MuiTabs-flexContainer': { alignItems: 'stretch' } }}
                >
                  {editorTabs.filter((t) => !hiddenTabIds.includes(t.id)).map((t) => {
                    const i = editorTabs.findIndex(x => x.id === t.id)
                    return (
                      <DraggableTabContainer
                        key={t.id}
                        draggable
                        data-tab-id={t.id}
                        onClick={() => {
                          setActiveEditorIndex(i)
                          const tab = editorTabs[i]
                          if (tab && editorRef.current) {
                            editorRef.current.setModel(tab.model)
                          }
                          try { localStorage.setItem('active_editor_index', String(i)) } catch {}
                        }}
                        onDragStart={(ev: React.DragEvent) => {
                          ev.dataTransfer.setData('text/plain', String(i))
                        }}
                        onDragOver={(ev: React.DragEvent) => ev.preventDefault()}
                        onDrop={(ev: React.DragEvent) => {
                          const from = Number(ev.dataTransfer.getData('text/plain'))
                          moveTab(from, i)
                        }}
                        sx={{ display: 'inline-flex', alignItems: 'center' }}
                      >
                        <Tab
                          label={t.title || `未命名${i+1}`}
                          onDoubleClick={() => renameTab(i)}
                          wrapped
                          sx={{ minHeight: 36, py: 0.5, maxWidth: 240 }}
                        />
                        <Button size="small" onClick={() => closeTab(i)} sx={{ minWidth: 24 }} title="关闭">
                          <CloseIcon fontSize="small" />
                        </Button>
                      </DraggableTabContainer>
                    )
                  })}
                </Tabs>
              </Box>

              {/* 更多按钮：仅在溢出时展示隐藏的页签 */}
              <Box ref={moreMenuWrapperRef}>
                {hiddenTabIds.length > 0 && (
                  <MoreTabsMenu 
                    tabs={editorTabs.filter(t => hiddenTabIds.includes(t.id)).map(t => ({ id: t.id, title: t.title }))}
                    activeIndex={editorTabs.filter(t => hiddenTabIds.includes(t.id)).findIndex(t => t.id === editorTabs[activeEditorIndex]?.id)}
                    onSelect={(idx) => {
                      const hiddenList = editorTabs.filter(t => hiddenTabIds.includes(t.id))
                      const picked = hiddenList[idx]
                      if (!picked) return
                      const realIndex = editorTabs.findIndex(t => t.id === picked.id)
                      if (realIndex >= 0) {
                        setActiveEditorIndex(realIndex)
                        const tab = editorTabs[realIndex]
                        if (tab && editorRef.current) {
                          editorRef.current.setModel(tab.model)
                        }
                        try { localStorage.setItem('active_editor_index', String(realIndex)) } catch {}
                      }
                    }}
                  />
                )}
              </Box>
            </Box>

            {/* 隐藏的测量容器：渲染所有页签用于测量宽度 */}
            <Box ref={measureRef} sx={{ position: 'absolute', visibility: 'hidden', pointerEvents: 'none', height: 0, overflow: 'hidden' }}>
              {editorTabs.map((t, i) => (
                <DraggableTabContainer key={`measure-${t.id}`} data-tab-id={t.id} sx={{ display: 'inline-flex', alignItems: 'center' }}>
                  <Tab label={t.title || `未命名${i+1}`} wrapped sx={{ minHeight: 36, py: 0.5, maxWidth: 240 }} />
                  <Button size="small" sx={{ minWidth: 24 }}><CloseIcon fontSize="small" /></Button>
                </DraggableTabContainer>
              ))}
            </Box>
          </Stack>
          <Divider />
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }} ref={editorContainerRef}>
            <Box sx={{ flex: resultPanelOpen ? `1 1 ${100 - resultHeight}%` : '1 1 100%', overflow: 'hidden', minHeight: '30%' }}>
              <Box 
                sx={{ height: '100%', position: 'relative' }} 
                onContextMenu={(e) => {
                  e.preventDefault()
                  setEditorContextMenu({ open: true, x: e.clientX, y: e.clientY })
                }}
              >
                <Editor
                  height="100%"
                  defaultLanguage="pgsql"
                  theme="vs"
                  onMount={onMount}
                  options={{ minimap: { enabled: false }, wordWrap: 'on', contextmenu: false }}
                  defaultValue={`-- 在此编写或粘贴 SQL
SELECT 1 AS id;`}
                />
                {/* 自定义右键菜单 */}
                <Menu
                  open={editorContextMenu.open}
                  onClose={closeEditorContextMenu}
                  anchorReference="anchorPosition"
                  anchorPosition={editorContextMenu.open ? { top: editorContextMenu.y, left: editorContextMenu.x } : undefined}
                >
                  <MenuItem onClick={cutSelection}>Cut</MenuItem>
                  <MenuItem onClick={copySelection}>Copy</MenuItem>
                  <MenuItem onClick={pasteClipboard}>Paste</MenuItem>
                  <MenuItem onClick={selectAll}>Select All</MenuItem>
                </Menu>
              </Box>
            </Box>

            {resultPanelOpen && execMutation.data && (
              <>
                <Box
                  role="separator"
                  aria-orientation="horizontal"
                  title="拖动调整结果面板高度"
                  sx={{
                    height: 8,
                    cursor: 'row-resize',
                    bgcolor: isResizingResult ? '#e0e0e0' : '#f5f5f5',
                    borderTop: '1px solid #ddd',
                    borderBottom: '1px solid #ddd',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'background 120ms ease',
                    '&:hover': { bgcolor: '#e8e8e8' },
                    zIndex: 10
                  }}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    resultStartYRef.current = e.clientY
                    resultStartHeightRef.current = resultHeight
                    setIsResizingResult(true)
                  }}
                >
                  <Box sx={{ width: 48, height: 4, borderRadius: 2, bgcolor: '#bbb' }} />
                </Box>

                <Box sx={{ flex: `0 0 ${resultHeight}%`, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: '20%' }}>
                  <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 1, py: 0.5, bgcolor: '#f5f5f5', borderBottom: '1px solid #ddd', minHeight: 40 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>查询结果</Typography>
                    <Button size="small" onClick={() => setResultPanelOpen(false)}>折叠</Button>
                  </Stack>

                  <Box sx={{ flex: 1, overflow: 'hidden' }}>
                    <QueryResultTabs results={execMutation.data.results} onExportCsv={exportCsv} onInsertSql={(sql) => {
                      const model = editorRef.current?.getModel()
                      if (!model) return
                      const pos = editorRef.current!.getPosition()
                      editorRef.current!.executeEdits('insert', [{ range: { startLineNumber: pos.lineNumber, startColumn: pos.column, endLineNumber: pos.lineNumber, endColumn: pos.column }, text: `
${sql}
` }])
                      editorRef.current!.focus()
                    }} />
                  </Box>
                </Box>
              </>
            )}

            {!resultPanelOpen && execMutation.data && (
              <Box 
                sx={{ 
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  height: 32, 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  borderTop: '1px solid #ddd',
                  bgcolor: '#f9f9f9',
                  cursor: 'pointer',
                  '&:hover': { bgcolor: '#f0f0f0' },
                  zIndex: 5
                }}
                onClick={() => setResultPanelOpen(true)}
              >
                <Typography variant="caption" color="text.secondary">
                  ▲ 展开结果
                </Typography>
              </Box>
            )}
          </Box>
        </Box>

        <Box role="separator" aria-orientation="vertical" title="拖动调整面板宽度（双击重置为30%）"
          sx={{ width: 15, cursor: 'col-resize', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: isResizing ? '#ececec' : '#f7f7f7', borderLeft: '1px solid #d0d0d0', borderRight: '1px solid #d0d0d0', transition: 'background 120ms ease', '&:hover': { background: '#ededed' } }}
          onMouseDown={(e) => { e.preventDefault(); startXRef.current = e.clientX; startSplitPctRef.current = splitPct; setIsResizing(true); }}
          onDoubleClick={resetSplit}
        >
          <Box sx={{ width: 8, height: 48, borderRadius: 2, boxShadow: 'inset 0 0 0 1px #c8c8c8', backgroundImage: 'repeating-linear-gradient(to bottom, #bdbdbd 0px, #bdbdbd 6px, #9e9e9e 6px, #9e9e9e 12px)', transition: 'transform 120ms ease, box-shadow 120ms ease', '&:hover': { boxShadow: 'inset 0 0 0 1px #b0b0b0' }, ...(isResizing ? { transform: 'scaleX(1.1)' } : {}) }} />
        </Box>
        {isResizing && <Box sx={{ position: 'fixed', inset: 0, zIndex: 1050, cursor: 'col-resize', pointerEvents: 'none' }} />}

        <Box ref={rightPanelRef} sx={{ width: `${splitPct}%`, display: 'flex', flexDirection: 'column', gap: 1, border: '1px solid #ddd', borderRadius: 1, p: 1, overflow: 'hidden', minHeight: 0 }}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <Typography variant="subtitle1" sx={{ flex: 1 }}>AI 生成 SQL</Typography>
            <FormControlLabel sx={{ mr: 0 }} control={<Switch checked={chatMode} onChange={(_, v) => { 
              setChatMode(v); 
              try { localStorage.setItem('chat_mode', v ? '1' : '0') } catch {}
              if (!v) { setChatDrawerOpen(false); setChatMessages([]); try { localStorage.setItem('chat_drawer_open', '0'); localStorage.setItem('chat_messages', '[]') } catch {} }
              else { setChatDrawerOpen(true); try { localStorage.setItem('chat_drawer_open', '1') } catch {} }
            }} size="small" />} label="对话" />
            {/* 模型/工作流 选择（移动到标题行最右侧） */}
            {/* 移除“聊天面板”按钮，改为悬浮按钮 */}
            <TextField select label="模型/工作流" size="small" sx={{ minWidth: 220 }} value={selectedModelId}
              onChange={e => setSelectedModelId(String(e.target.value))}
              SelectProps={{ native: true }}
            >
              <option value="">默认（后端）</option>
              {(() => {
                try {
                  const list = JSON.parse(localStorage.getItem('workflows') || '[]') || []
                  const published = list.filter((x: any) => !!x.published)
                  if (published.length === 0) return null
                  return [<optgroup key="wf" label="已发布的工作流">{
                    published.map((x: any) => (
                      <option key={x.id} value={`wf:${x.id}`}>{x.name}</option>
                    ))
                  }</optgroup>]
                } catch { return null }
              })()}
              {models.length > 0 && (
                <optgroup label="模型">
                  {models.map((m: any) => (
                    <option key={m.id} value={String(m.id)}>{m.name || m.model || m.id}</option>
                  ))}
                </optgroup>
              )}
            </TextField>
          </Stack>
          <TextField multiline minRows={6} value={instruction} onChange={e => setInstruction(e.target.value)} placeholder="用自然语言描述你的查询需求" />
          <Stack direction="row" spacing={1} alignItems="center">
            {/* 右侧页签切换（MUI Tabs） */}
            <Tabs value={rightActiveTab} onChange={(_, v) => setRightActiveTab(v)} sx={{ minHeight: 36 }}>
              <Tab label="AI输出" value="candidate" />
              <Tab label="已保存查询" value="saved" />
            </Tabs>
            <Divider orientation="vertical" flexItem />
            <Button variant="contained" onClick={askAI} disabled={isGenerating || generateMutation.isPending}
              startIcon={(isGenerating || generateMutation.isPending) ? <CircularProgress size={18} color="inherit" /> : <BoltIcon />}
            >
              {(isGenerating || generateMutation.isPending) ? '正在生成…' : '生成'}
            </Button>
            <Button onMouseDown={() => { try { candidateSelectionRef.current = String(window.getSelection?.()?.toString() || '') } catch {} }} onClick={insertGenerated} disabled={!candidateSql}>插入到编辑器</Button>
            <Button onClick={() => { navigator.clipboard?.writeText(candidateSql || '') }} disabled={!candidateSql}>复制输出</Button>
            <Button onClick={() => setCandidateSql('')} disabled={!candidateSql}>清除输出</Button>
            <Button onClick={loadExampleInstruction}>加载示例</Button>
          </Stack>
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {rightActiveTab === 'candidate' ? (
            <Box ref={candidateBoxRef} sx={{ flex: 1, minHeight: 0, border: '1px solid #eee', borderRadius: 1, p: 1, overflowY: 'auto', overflowX: 'hidden', bgcolor: 'transparent', height: '100%' }}>
              {chatMode ? (
                <Stack spacing={1}>
                  {chatMessages.map((m, i) => (
                    <Box key={i} sx={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                      <Box sx={{
                        maxWidth: '96%',
                        p: 1,
                        borderRadius: 1,
                        bgcolor: m.role === 'user' ? '#f0f7ff' : '#fff',
                        border: '1px solid #eee',
                        // 确保 Markdown 内容正确显示
                        '& .markdown-body': {
                          fontSize: '14px',
                          lineHeight: 1.6,
                          fontFamily: 'inherit',
                        },
                        '& pre:not(.hljs)': {
                          background: '#f6f8fa',
                          padding: '12px',
                          borderRadius: '6px',
                          overflow: 'auto',
                          fontSize: '13px',
                          lineHeight: 1.45
                        },
                        '& code:not(.hljs)': {
                          background: 'rgba(175,184,193,0.2)',
                          padding: '2px 4px',
                          borderRadius: '3px',
                          fontSize: '0.85em'
                        }
                      }}>
                        <Box sx={{ fontSize: 14, lineHeight: 1.6 }}>
                          <Markdown>{m.content || ''}</Markdown>
                        </Box>
                        {m.role === 'assistant' ? (
                          <Box sx={{ fontSize: 14, lineHeight: 1.6 }}>
                            <Markdown>{m.content || ''}</Markdown>
                          </Box>
                        ) : (
                          <Box sx={{ fontSize: 14, lineHeight: 1.6 }}>
                            <Markdown>{m.content || ''}</Markdown>
                          </Box>
                        )}
                        {m.role === 'assistant' && (
                          <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                            <Button size="small" onClick={() => { navigator.clipboard?.writeText(m.content || '') }}>复制</Button>
                            <Button size="small" onClick={() => insertAssistantToEditor((() => {
                              try {
                                const sel = window.getSelection?.()?.toString() || ''
                                if (sel.trim()) return sel
                              } catch {}
                              return m.content
                            })())}>插入</Button>
                          </Box>
                        )}
                      </Box>
                    </Box>
                  ))}
                </Stack>
              ) : (
              (() => {
                const raw = candidateSql || ''
                const blocks: JSX.Element[] = []
                const reg = /```(?:sql|pgsql|postgres|postgresql)\b\s*[\r\n]?([\s\S]*?)```/gi
                let lastIndex = 0
                let match: RegExpExecArray | null
                while ((match = reg.exec(raw)) !== null) {
                  const start = match.index
                  const end = reg.lastIndex
                  const before = raw.slice(lastIndex, start)
                  if (before) {
                    blocks.push(
                      <pre key={`t-${lastIndex}`} style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{before}</pre>
                    )
                  }
                  const code = match[1] || ''
                  const lineCount = Math.max(4, Math.min(20, (code.split(/\n/).length || 1)))
                  const height = Math.min(480, Math.max(120, lineCount * 22 + 16))
                  blocks.push(
                    <Box key={`c-${start}`} sx={{ my: 1.5, border: '1px solid #3a3f45', borderRadius: 1.5, overflow: 'hidden', bgcolor: '#2f3437' }}>
                      <Box sx={{ height: 24, px: 1, display: 'flex', alignItems: 'center', gap: 1, bgcolor: '#2b3033', borderBottom: '1px solid #3a3f45' }}>
                        <Box sx={{ width: 10, height: 10, bgcolor: '#ff5f56', borderRadius: '50%' }} />
                        <Box sx={{ width: 10, height: 10, bgcolor: '#ffbd2e', borderRadius: '50%' }} />
                        <Box sx={{ width: 10, height: 10, bgcolor: '#27c93f', borderRadius: '50%' }} />
                      </Box>
                      <Box sx={{ p: 1 }}>
                        <pre style={{ whiteSpace: 'pre-wrap', margin: 0, color: '#e6e6e6' }} dangerouslySetInnerHTML={{ __html: highlightSql(code) }} />
                      </Box>
                    </Box>
                  )
                  lastIndex = end
                }
                const tail = raw.slice(lastIndex)
                if (tail) {
                  blocks.push(
                    <pre key={`t-${lastIndex}-tail`} style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{tail}</pre>
                  )
                }
                if (blocks.length === 0) {
                  const hasFence = /^\s*```(?:sql|pgsql|postgres|postgresql)\b/i.test(raw)
                  if (hasFence) {
                    const codeText = raw.replace(/^\s*```(?:sql|pgsql|postgres|postgresql)\b\s*/i, '')
                    const lineCount = Math.max(4, Math.min(30, (codeText.split(/\n/).length || 1)))
                    const height = Math.min(560, Math.max(160, lineCount * 22 + 16))
                    return (
                      <Box sx={{ my: 1.5, border: '1px solid #3a3f45', borderRadius: 1.5, overflow: 'hidden', bgcolor: '#2f3437' }}>
                        <Box sx={{ height: 24, px: 1, display: 'flex', alignItems: 'center', gap: 1, bgcolor: '#2b3033', borderBottom: '1px solid #3a3f45' }}>
                          <Box sx={{ width: 10, height: 10, bgcolor: '#ff5f56', borderRadius: '50%' }} />
                          <Box sx={{ width: 10, height: 10, bgcolor: '#ffbd2e', borderRadius: '50%' }} />
                          <Box sx={{ width: 10, height: 10, bgcolor: '#27c93f', borderRadius: '50%' }} />
                        </Box>
                        <Box sx={{ p: 1 }}>
                          <pre style={{ whiteSpace: 'pre-wrap', margin: 0, color: '#e6e6e6' }} dangerouslySetInnerHTML={{ __html: highlightSql(codeText) }} />
                        </Box>
                      </Box>
                    )
                  }
                  const looksSql = /^\s*(select|with|insert|update|delete|create|alter|drop|merge|grant|revoke|explain|analyze)\b/i.test(raw)
                  if (looksSql) {
                    const lineCount = Math.max(4, Math.min(30, (raw.split(/\n/).length || 1)))
                    const height = Math.min(560, Math.max(160, lineCount * 22 + 16))
                    return (
                      <Box sx={{ my: 1.5, border: '1px solid #3a3f45', borderRadius: 1.5, overflow: 'hidden', bgcolor: '#2f3437' }}>
                        <Box sx={{ height: 24, px: 1, display: 'flex', alignItems: 'center', gap: 1, bgcolor: '#2b3033', borderBottom: '1px solid #3a3f45' }}>
                          <Box sx={{ width: 10, height: 10, bgcolor: '#ff5f56', borderRadius: '50%' }} />
                          <Box sx={{ width: 10, height: 10, bgcolor: '#ffbd2e', borderRadius: '50%' }} />
                          <Box sx={{ width: 10, height: 10, bgcolor: '#27c93f', borderRadius: '50%' }} />
                        </Box>
                        <Box sx={{ p: 1 }}>
                          <pre style={{ whiteSpace: 'pre-wrap', margin: 0, color: '#e6e6e6' }} dangerouslySetInnerHTML={{ __html: highlightSql(raw) }} />
                        </Box>
                      </Box>
                    )
                  }
                  return <pre style={{ whiteSpace: 'pre-wrap' }}>{raw}</pre>
                }
                return <Box>{blocks}</Box>
              })())}
            </Box>
          ) : (
            <Box ref={savedListBoxRef} sx={{ overflow: 'auto', flex: 1, minHeight: 40 }}>
              {(savedList || []).map((q: any) => (
              <Box
                key={q.id}
                sx={{ border: '1px solid #eee', borderRadius: 1, p: 1, mb: 1 }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                  <Typography fontWeight={600} noWrap sx={{ cursor: 'pointer' }} onClick={() => {
                    const existingIndex = editorTabs.findIndex(t => String(t.id) === String(q.id))
                    if (existingIndex >= 0) {
                      setActiveEditorIndex(existingIndex)
                      const tab = editorTabs[existingIndex]
                      if (editorRef.current && tab?.model) editorRef.current.setModel(tab.model)
                      return
                    }
                    const monaco = (window as any).monaco
                    const model = monaco?.editor?.createModel(q.sqlText || '', 'pgsql')
                    const newTab = { id: String(q.id), title: q.title || '未命名', model }
                    setEditorTabs(prev => {
                      const next = [...prev, newTab]
                      try {
                        const list = next.map(t => ({ id: t.id, title: t.title, content: t.model?.getValue?.() || '' }))
                        localStorage.setItem('editor_tabs_snapshot', JSON.stringify(list))
                      } catch { }
                      return next
                    })
                    const nextIndex = editorTabs.length
                    setActiveEditorIndex(nextIndex)
                    try { localStorage.setItem('active_editor_index', String(nextIndex)) } catch { }
                    if (model) editorRef.current.setModel(model)
                  }}>{q.title}</Typography>
                  <Stack direction="row" spacing={1}>

                    <Divider orientation="vertical" flexItem sx={{ borderColor: 'rgba(255,255,255,0.5)' }} />

                    <Button size="small" onClick={() => {
                      setSavedDialog({ open: true, mode: 'rename', id: String(q.id), base: q, title: q.title || '' })
                    }}>重命名</Button>
                    <Button size="small" onClick={() => {
                      const makeUnique = (baseTitle: string) => {
                        const list = (savedList || []) as any[]
                        if (!list.find(x => String(x.title) === baseTitle)) return baseTitle
                        let i = 2
                        while (i < 1000) {
                          const nt = `${baseTitle} ${i}`
                          if (!list.find(x => String(x.title) === nt)) return nt
                          i++
                        }
                        return `${baseTitle} ${Date.now()}`
                      }
                      const base = (q.title ? `${q.title} 副本` : '未命名 副本')
                      const title = makeUnique(base)
                      setSavedDialog({ open: true, mode: 'copy', base: q, title })
                    }}>复制</Button>
                    <Button size="small" color="error" onClick={async () => {
                      await api.delete(`/api/queries/${q.id}`)
                      qc.invalidateQueries({ queryKey: ['saved'] })
                      setSnackMsg('已删除')
                      setSnackOpen(true)
                    }}>删除</Button>
                  </Stack>
                </Box>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  {(() => {
                    const d = q?.description;
                    if (d == null) return '';
                    if (typeof d === 'string' || typeof d === 'number' || typeof d === 'bigint') return String(d);
                    try { return JSON.stringify(d, null, 2); } catch { return String(d); }
                  })()}
                </Typography>
              </Box>
            ))}
          </Box>
          )}
        </Box>
        </Box>
      </Container>
      <Snackbar open={snackOpen} autoHideDuration={3000} onClose={() => setSnackOpen(false)} message={snackMsg} />

      <Dialog open={savedDialog.open} onClose={() => setSavedDialog(s => ({ ...s, open: false }))} maxWidth="xs" fullWidth>
        <DialogTitle>{savedDialog.mode === 'rename' ? '重命名查询' : '复制查询'}</DialogTitle>
        <DialogContent dividers>
          <TextField
            autoFocus
            fullWidth
            label="标题"
            value={savedDialog.title}
            onChange={e => setSavedDialog(s => ({ ...s, title: e.target.value }))}
          />
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {savedDialog.mode === 'copy' ? '将基于原有内容创建一个新的已保存查询。' : '仅修改标题，不改变 SQL 内容。'}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSavedDialog(s => ({ ...s, open: false }))}>取消</Button>
          <Button variant="contained" onClick={async () => {
            const title = (savedDialog.title || '').trim()
            if (!title) {
              setSnackMsg('标题不能为空')
              setSnackOpen(true)
              return
            }
            const list = (savedList || []) as any[]
            if (savedDialog.mode === 'rename') {
              // 重命名：如无更新接口，则先创建新条目再删除旧条目
              const dup = list.find(x => String(x.title) === title && String(x.id) !== String(savedDialog.id))
              if (dup) {
                setSnackMsg('已存在相同标题，请更换')
                setSnackOpen(true)
                return
              }
              try {
                const base = savedDialog.base || {}
                await api.post('/api/queries', { title, description: base.description || '', sqlText: base.sqlText || '', tags: base.tags || [] })
                if (savedDialog.id) {
                  await api.delete(`/api/queries/${savedDialog.id}`)
                }
                qc.invalidateQueries({ queryKey: ['saved'] })
                setSnackMsg('重命名成功')
                setSnackOpen(true)
                setSavedDialog(s => ({ ...s, open: false }))
              } catch (e: any) {
                setSnackMsg(e?.response?.data?.error || e?.message || '重命名失败')
                setSnackOpen(true)
              }
            } else {
              try {
                const base = savedDialog.base || {}
                // 复制：创建新条目
                await api.post('/api/queries', { title, description: base.description || '', sqlText: base.sqlText || '', tags: base.tags || [] })
                qc.invalidateQueries({ queryKey: ['saved'] })
                setSnackMsg('已复制为新查询')
                setSnackOpen(true)
                setSavedDialog(s => ({ ...s, open: false }))
              } catch (e: any) {
                setSnackMsg(e?.response?.data?.error || e?.message || '复制失败')
                setSnackOpen(true)
              }
            }
          }}>确定</Button>
        </DialogActions>
      </Dialog>

      {/* AI 性能优化对话框 */}
      <Dialog open={optOpen} onClose={() => setOptOpen(false)} maxWidth={false} PaperProps={{ sx: { position: 'fixed', top: optY, left: optX, width: optWidth, height: optHeight, m: 0, transition: 'none' } }}>
        <DialogTitle sx={{ p: 1, cursor: 'move', userSelect: 'none' }} onMouseDown={(e) => {
          dragRef.current = { dragging: true, startX: e.clientX, startY: e.clientY, originX: optX, originY: optY }
          document.body.style.userSelect = 'none'
          document.body.style.cursor = 'move'
        }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="h6" component="div">AI 性能优化</Typography>
            <IconButton size="small" onClick={() => setOptOpen(false)}><CloseIcon /></IconButton>
          </Box>
        </DialogTitle>
        <DialogContent dividers sx={{ p: 1, position: 'relative' }}>
          {optLoading && <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}><CircularProgress /></Box>}
          {optError && <Alert severity="error">{optError}</Alert>}
          {optData && (
            <Stack spacing={1}>
              {optData.syntaxErrors.length > 0 && (
                <Box>
                  <Typography variant="subtitle2" color="error">语法错误</Typography>
                  <Box sx={{ maxHeight: 120, overflow: 'auto', bgcolor: '#fff0f0', p: 1, borderRadius: 1 }}>
                    {optData.syntaxErrors.map((e, i) => <Box key={i}>Line {e.line}: {e.message}</Box>)}
                  </Box>
                </Box>
              )}
              {optData.performanceSuggestions.length > 0 && (
                <Box>
                  <Typography variant="subtitle2" color="primary">性能建议</Typography>
                  <Box sx={{ maxHeight: 120, overflow: 'auto', bgcolor: '#f0f8ff', p: 1, borderRadius: 1 }}>
                    {optData.performanceSuggestions.map((s, i) => <Box key={i}>- {s}</Box>)}
                  </Box>
                </Box>
              )}
              {optData.optimizedSql && (
                <Box>
                  <Typography variant="subtitle2">优化后 SQL</Typography>
                  <Box sx={{ height: 200, border: '1px solid #ddd' }}>
                    <Editor height="100%" language="sql" theme="vs" value={optData.optimizedSql} options={{ readOnly: true, minimap: { enabled: false } }} />
                  </Box>
                </Box>
              )}
            </Stack>
          )}
          {/* Resize handles */}
          <Box sx={{ position: 'absolute', bottom: 0, right: 0, width: 12, height: 12, cursor: 'se-resize', zIndex: 1 }} onMouseDown={(e) => {
            resizeRef.current = { resizing: true, startX: e.clientX, startY: e.clientY, originW: optWidth, originH: optHeight, mode: 'se' }
            document.body.style.userSelect = 'none'
            document.body.style.cursor = 'se-resize'
          }} />
          <Box sx={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 8, cursor: 's-resize', zIndex: 1 }} onMouseDown={(e) => {
            resizeRef.current = { resizing: true, startX: e.clientX, startY: e.clientY, originW: optWidth, originH: optHeight, mode: 's' }
            document.body.style.userSelect = 'none'
            document.body.style.cursor = 's-resize'
          }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOptOpen(false)}>关闭</Button>
          <Button variant="contained" onClick={() => {
            if (optData?.optimizedSql) {
              editorRef.current?.setValue(optData.optimizedSql)
              setOptOpen(false)
            }
          }} disabled={!optData?.optimizedSql}>应用优化结果</Button>
        </DialogActions>
      </Dialog>
      {/* 右侧对话抽屉：与预览对话相似，从侧边推出 */}
      <Drawer anchor="right" open={chatDrawerOpen} onClose={() => setChatDrawerOpen(false)} variant="persistent"
        PaperProps={{ sx: { position: 'fixed', right: 0, width: `${chatWidthPct}%`, minWidth: 360, top: 64, height: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column', boxShadow: '0 12px 28px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.12)', borderLeft: '1px solid #e0e6f0', backgroundColor: '#fff' } }}>
        <Box sx={{ p: 1, borderBottom: '1px solid #e6eaf5', display: 'flex', alignItems: 'center', bgcolor: '#f9fafc' }}>
          <Typography variant="subtitle1" sx={{ flex: 1 }}>AI 对话</Typography>
          <Stack direction="row" spacing={1}>
            <Button size="small" onClick={() => { setChatMessages([]); try { localStorage.setItem('chat_messages', '[]') } catch {} }}>清除</Button>
            <IconButton onClick={() => { setChatDrawerOpen(false); try { localStorage.setItem('chat_drawer_open', '0') } catch {} }}><CloseIcon /></IconButton>
          </Stack>
        </Box>
        {/* 可拖拽调整宽度的把手 */}
        <Box
          role="separator"
          aria-orientation="vertical"
          title="拖动调整聊天面板宽度（双击重置为32%）"
          sx={{ position: 'absolute', left: -7, top: 0, bottom: 0, width: 14, cursor: 'col-resize', zIndex: 1300 }}
          onMouseDown={(e) => {
            e.preventDefault(); setIsResizingChat(true); document.body.style.userSelect = 'none'
            const startX = e.clientX
            const startPctVal = Number(chatWidthPct)
            const onMove = (ev: MouseEvent) => {
              const dx = startX - ev.clientX
              const container = containerRef.current
              const w = Number(container?.getBoundingClientRect()?.width || 1)
              let pct = Math.min(85, Math.max(20, startPctVal + (dx / Math.max(1, w)) * 100))
              setChatWidthPct(Math.round(pct))
              try { localStorage.setItem('chat_drawer_width_pct', String(Math.round(pct))) } catch {}
            }
            const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); setIsResizingChat(false); document.body.style.userSelect = '' }
            window.addEventListener('mousemove', onMove)
            window.addEventListener('mouseup', onUp)
          }}
          onDoubleClick={() => { setChatWidthPct(32); try { localStorage.setItem('chat_drawer_width_pct', '32') } catch {} }}
        />
        <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', p: 1 }}>
          <Stack spacing={1.2}>
            {chatMessages.map((m, i) => (
              <Stack key={i} direction="row" spacing={1.2} sx={{ width: '100%', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                {m.role !== 'user' && (
                  <Avatar sx={{ bgcolor: '#1e88e5', width: 28, height: 28 }}>
                    <SchemaIcon sx={{ fontSize: 18 }} />
                  </Avatar>
                )}
                <Box sx={{ 
                  maxWidth: '96%', 
                  p: 1, 
                  borderRadius: 1, 
                  bgcolor: m.role === 'user' ? '#f0f7ff' : '#fff', 
                  border: '1px solid #eee',
                  // 为 Markdown 内容添加样式
                  '& h1, & h2, & h3, & h4, & h5, & h6': {
                    fontWeight: 600,
                    marginTop: '0.5em',
                    marginBottom: '0.25em',
                    lineHeight: 1.25,
                  },
                  '& h1': { 
                    fontSize: '1.4em', 
                    borderBottom: '1px solid #eaecef', 
                    paddingBottom: '0.3em',
                    marginTop: '0.5em'
                  },
                  '& h2': { 
                    fontSize: '1.3em',
                    borderBottom: '1px solid #eaecef', 
                    paddingBottom: '0.3em',
                  },
                  '& h3': { fontSize: '1.2em' },
                  '& p': {
                    margin: '0.5em 0',
                  },
                  '& ul, & ol': {
                    paddingLeft: '2em',
                    margin: '0.5em 0',
                  },
                  '& li': {
                    margin: '0.25em 0',
                  },
                  '& strong': {
                    fontWeight: 600,
                  },
                  '& em': {
                    fontStyle: 'italic',
                  },
                }}>
                  {m.role === 'assistant' ? (
                    <Box>
                      <Box sx={{ fontSize: 14, lineHeight: 1.6 }}>
                        <Markdown>{m.content || ''}</Markdown>
                      </Box>
                      {m.isTyping && (
                        <Box sx={{ mt: 0.5, display: 'inline-flex', alignItems: 'center', gap: 0.6 }}>
                          {([0,1,2]).map((ii) => (
                            <Box key={ii} sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: '#6b7280', animation: `${dots} 1.4s ${ii * 0.2}s infinite ease-in-out` }} />
                          ))}
                        </Box>
                      )}
                      <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                        <Button size="small" onClick={() => { navigator.clipboard?.writeText(m.content || '') }}>复制</Button>
                        <Button size="small" onClick={() => insertAssistantToEditor((() => {
                          try {
                            const sel = window.getSelection?.()?.toString() || ''
                            if (sel.trim()) return sel
                          } catch {}
                          return m.content
                        })())}>插入</Button>
                      </Box>
                    </Box>
                  ) : (
                    <Box sx={{ fontSize: 14, lineHeight: 1.6 }}>
                      <Markdown>{m.content || ''}</Markdown>
                    </Box>
                  )}
                </Box>
              </Stack> 
            ))}
          </Stack>
        </Box>
        <Box sx={{ p: 1, borderTop: '1px solid #e6eaf5' }}>
          <Stack direction="row" spacing={1} alignItems="flex-end">
            <TextField
              placeholder="请输入你的问题（Enter 发送，Shift+Enter 换行）"
              value={instruction}
              onChange={e => setInstruction(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); askAI() } }}
              fullWidth
              multiline
              minRows={1}
              maxRows={6}
            />
            <Button variant="contained" onClick={askAI} disabled={isGenerating || generateMutation.isPending}>
              发送
            </Button>
          </Stack>
        </Box>
      </Drawer>
      {/* 右下角 AI 悬浮按钮：仅当对话开启但抽屉关闭时显示 */}
      {(chatMode && !chatDrawerOpen) && (
        <Box sx={{ position: 'fixed', right: 0, top: '28%', transform: 'translateY(-50%)', zIndex: 2000 }}>
          <Box onClick={() => { setChatDrawerOpen(true); try { localStorage.setItem('chat_drawer_open', '1') } catch {} }}
            sx={{ cursor: 'pointer', bgcolor: '#1e88e5', color: '#fff', px: 1.25, py: 0.75, borderTopLeftRadius: 12, borderBottomLeftRadius: 12, boxShadow: '0 10px 26px rgba(0,0,0,0.18)', display: 'flex', alignItems: 'center', gap: 0.5 }}
          >
            <BoltIcon fontSize="small" />
            <Typography variant="body2" sx={{ fontWeight: 700, letterSpacing: 0.2 }}>AI</Typography>
          </Box>
        </Box>
      )}
    </Box>
  )
}