import { useRef, useState, useEffect } from 'react'
import { AppBar, Box, Button, Container, Divider, Stack, Tab, Tabs, TextField, Toolbar, Typography } from '@mui/material'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import SaveIcon from '@mui/icons-material/Save'
import FormatAlignLeftIcon from '@mui/icons-material/FormatAlignLeft'
import BoltIcon from '@mui/icons-material/Bolt'
import { Editor, OnMount } from '@monaco-editor/react'
import { api, setAuthToken } from '@/lib/api'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'sql-formatter'
import Papa from 'papaparse'

function download(filename: string, text: string) {
  const element = document.createElement('a')
  element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text))
  element.setAttribute('download', filename)
  element.style.display = 'none'
  document.body.appendChild(element)
  element.click()
  document.body.removeChild(element)
}

export default function App() {
  const editorRef = useRef<any>(null)
  const [selectedText, setSelectedText] = useState<string>('')
  const [instruction, setInstruction] = useState('')
  const qc = useQueryClient()
  const [tab, setTab] = useState(0)
  const [opts, setOpts] = useState(() => {
    const s = localStorage.getItem('exec_options')
    return s ? JSON.parse(s) : { readOnly: true, useTransaction: false, maxRows: 1000, timeoutSeconds: 30 }
  })

  // 结果面板状态
  const [resultPanelOpen, setResultPanelOpen] = useState(false)
  const [resultTab, setResultTab] = useState(0) // 0: 结果网格, 1: 查询信息
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

  // 上下分割拖动
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

  useEffect(() => {
    document.body.style.cursor = isResizing ? 'col-resize' : isResizingResult ? 'row-resize' : ''
    document.body.style.userSelect = (isResizing || isResizingResult) ? 'none' : ''
    return () => {
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [isResizing, isResizingResult])

  const resetSplit = () => {
    setSplitPct(30)
    localStorage.setItem('ai_panel_width_pct', '30')
  }

  const execMutation = useMutation({
    mutationFn: async (payload: any) => {
      try {
        const { data } = await api.post('/api/sql/execute', payload)
        setResultPanelOpen(true)
        setResultTab(0)
        return data
      } catch (e: any) {
        const title = e?.response?.data?.title || e?.response?.data?.error || e?.message || '请求失败'
        setResultPanelOpen(true)
        setResultTab(1)
        return { success: false, error: title }
      }
    }
  })

  const generateMutation = useMutation({
    mutationFn: async (payload: any) => {
      const { data } = await api.post('/api/sql/generate', payload)
      return data
    }
  })

  const { data: savedList } = useQuery({
    queryKey: ['saved'],
    queryFn: async () => (await api.get('/api/queries')).data
  })

  const onMount: OnMount = (editor) => {
    editorRef.current = editor
    editor.onDidChangeCursorSelection(() => {
      const selection = editor.getSelection()
      if (!selection) return
      const model = editor.getModel()
      if (!model) return
      const text = model.getValueInRange(selection)
      setSelectedText(text)
    })
  }

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
  }

  const exportCsv = () => {
    const rows = execMutation.data?.rows || []
    if (!rows.length) return
    const csv = Papa.unparse(rows)
    download('result.csv', csv)
  }

  const askAI = () => {
    if (!instruction.trim()) return
    generateMutation.mutate({ instruction })
  }

  const insertGenerated = () => {
    const sql = generateMutation.data?.sql || ''
    if (!sql) return
    const model = editorRef.current?.getModel()
    if (!model) return
    const pos = editorRef.current!.getPosition()
    editorRef.current!.executeEdits('insert', [
      { range: new (window as any).monaco.Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column), text: '\n' + sql + '\n' }
    ])
  }

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <AppBar position="static" color="transparent" elevation={0}>
        <Toolbar>
          <Typography variant="h6" sx={{ flex: 1 }}>SPDSQL - SQL 智能编写器</Typography>
          <Stack direction="row" spacing={1}>
            <Button startIcon={<SaveIcon />} onClick={saveQuery}>保存</Button>
            <Button onClick={() => setTab(1)}>设置</Button>
            <Button onClick={() => {
              const token = localStorage.getItem('token')
              if (!token) return window.location.reload()
              localStorage.removeItem('token'); localStorage.removeItem('role');
              setAuthToken(undefined); window.location.reload()
            }}>退出</Button>
          </Stack>
        </Toolbar>
      </AppBar>

      <Container maxWidth={false} sx={{ flex: 1, display: 'flex', gap: 0, py: 2, overflow: 'hidden' }} ref={containerRef}>
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', border: '1px solid #ddd', borderRadius: 1, overflow: 'hidden' }}>
          <Stack direction="row" spacing={1} sx={{ p: 1 }}>
            <Button variant="contained" startIcon={<PlayArrowIcon />} onClick={() => run(false)} disabled={execMutation.isPending}>运行</Button>
            <Button startIcon={<PlayArrowIcon />} onClick={() => run(true)} disabled={execMutation.isPending}>运行选中</Button>
            <Button startIcon={<FormatAlignLeftIcon />} onClick={formatSql}>格式化</Button>
          </Stack>
          <Divider />
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }} ref={editorContainerRef}>
            <Box sx={{ flex: resultPanelOpen ? `1 1 ${100 - resultHeight}%` : '1 1 100%', overflow: 'hidden', minHeight: '30%' }}>
              <Editor
                height="100%"
                defaultLanguage="pgsql"
                onMount={onMount}
                options={{ minimap: { enabled: false }, wordWrap: 'on' }}
                defaultValue={`-- 在此编写或粘贴 SQL\nSELECT 1 AS id;`}
              />
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
                    <Tabs value={resultTab} onChange={(e, v) => setResultTab(v)} sx={{ minHeight: 36 }}>
                      <Tab label="结果" sx={{ minHeight: 36, py: 0.5 }} />
                      <Tab label="信息" sx={{ minHeight: 36, py: 0.5 }} />
                    </Tabs>
                    <Stack direction="row" spacing={1}>
                      {execMutation.data?.rows && resultTab === 0 && (
                        <Button size="small" onClick={exportCsv}>导出 CSV</Button>
                      )}
                      <Button size="small" onClick={() => setResultPanelOpen(false)}>折叠</Button>
                    </Stack>
                  </Stack>

                  <Box sx={{ flex: 1, overflowY: 'auto', p: 1 }}>
                    {resultTab === 0 && (
                      <Box>
                        {execMutation.data?.rows && execMutation.data.rows.length > 0 ? (
                          <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                            <thead>
                              <tr>
                                {Object.keys(execMutation.data.rows[0] || {}).map((k) => (
                                  <th key={k} style={{ textAlign: 'left', borderBottom: '2px solid #ddd', padding: '8px 4px', backgroundColor: '#f9f9f9', fontWeight: 600, position: 'sticky', top: 0 }}>{k}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {execMutation.data.rows.map((r: any, i: number) => (
                                <tr key={i} style={{ backgroundColor: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                                  {Object.keys(execMutation.data.rows[0] || {}).map((k) => (
                                    <td key={k} style={{ borderBottom: '1px solid #eee', padding: '6px 4px' }}>{String(r[k] ?? '')}</td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </Box>
                        ) : (
                          <Typography variant="body2" color="text.secondary">
                            {execMutation.data?.error ? '查询出错，请查看信息标签' : '未返回结果集'}
                          </Typography>
                        )}
                      </Box>
                    )}

                    {resultTab === 1 && (
                      <Box>
                        {execMutation.data && (
                          <Box sx={{ mb: 2 }}>
                            <Typography variant="subtitle2" gutterBottom>执行信息</Typography>
                            <Stack spacing={0.5} sx={{ fontSize: '0.875rem' }}>
                              <Box>
                                <strong>状态：</strong>
                                <Typography component="span" color={execMutation.data.error ? 'error' : 'success.main'}>
                                  {execMutation.data.error ? '失败' : '成功'}
                                </Typography>
                              </Box>
                              {execMutation.data.rows && <Box><strong>返回行数：</strong>{execMutation.data.rows.length}</Box>}
                              {execMutation.data.affectedRows !== undefined && <Box><strong>影响行数：</strong>{execMutation.data.affectedRows}</Box>}
                              {execMutation.data.duration && <Box><strong>执行耗时：</strong>{execMutation.data.duration}</Box>}
                            </Stack>
                          </Box>
                        )}

                        {execMutation.data?.error && (
                          <Box sx={{ mt: 2 }}>
                            <Typography variant="subtitle2" gutterBottom color="error">错误信息</Typography>
                            <Box sx={{ bgcolor: '#fff3f3', border: '1px solid #ffcdd2', borderRadius: 1, p: 1.5, whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: '0.875rem' }}>
                              {execMutation.data.error}
                            </Box>
                            <Button size="small" variant="outlined" color="primary" sx={{ mt: 1 }}
                              onClick={async () => {
                                const sqlText = editorRef.current?.getValue() || ''
                                const error = execMutation.data?.error || ''
                                const { data } = await api.post('/api/sql/diagnose', { sql: sqlText, error })
                                const suggestion = data?.suggestion || ''
                                if (suggestion) {
                                  const model = editorRef.current?.getModel()
                                  if (model) {
                                    const pos = editorRef.current!.getPosition()
                                    editorRef.current!.executeEdits('insert', [
                                      { range: new (window as any).monaco.Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column), text: '\n' + suggestion + '\n' }
                                    ])
                                  }
                                }
                              }}
                            >
                              🤖 AI诊断并修正
                            </Button>
                          </Box>
                        )}
                      </Box>
                    )}
                  </Box>
                </Box>
              </>
            )}
          </Box>
        </Box>

        <Box role="separator" aria-orientation="vertical" title="拖动调整面板宽度（双击重置为30%）"
          sx={{ width: 15, cursor: 'col-resize', zIndex: 2001, display: 'flex', alignItems: 'center', justifyContent: 'center', background: isResizing ? '#ececec' : '#f7f7f7', borderLeft: '1px solid #d0d0d0', borderRight: '1px solid #d0d0d0', transition: 'background 120ms ease', '&:hover': { background: '#ededed' } }}
          onMouseDown={(e) => { e.preventDefault(); startXRef.current = e.clientX; startSplitPctRef.current = splitPct; setIsResizing(true); }}
          onDoubleClick={resetSplit}
        >
          <Box sx={{ width: 8, height: 48, borderRadius: 2, boxShadow: 'inset 0 0 0 1px #c8c8c8', backgroundImage: 'repeating-linear-gradient(to bottom, #bdbdbd 0px, #bdbdbd 6px, #9e9e9e 6px, #9e9e9e 12px)', transition: 'transform 120ms ease, box-shadow 120ms ease', '&:hover': { boxShadow: 'inset 0 0 0 1px #b0b0b0' }, ...(isResizing ? { transform: 'scaleX(1.1)' } : {}) }} />
        </Box>
        {isResizing && <Box sx={{ position: 'fixed', inset: 0, zIndex: 2000, cursor: 'col-resize', pointerEvents: 'none' }} />}

        <Box sx={{ width: `${splitPct}%`, display: 'flex', flexDirection: 'column', gap: 1, border: '1px solid #ddd', borderRadius: 1, p: 1, overflow: 'hidden' }}>
          <Typography variant="subtitle1">AI 生成 SQL</Typography>
          <TextField multiline minRows={6} value={instruction} onChange={e => setInstruction(e.target.value)} placeholder="用自然语言描述你的查询需求" />
          <Stack direction="row" spacing={1}>
            <Button variant="contained" startIcon={<BoltIcon />} onClick={askAI} disabled={generateMutation.isPending}>生成</Button>
            <Button onClick={insertGenerated} disabled={!generateMutation.data}>插入到编辑器</Button>
          </Stack>
          <Box sx={{ flex: 1, border: '1px solid #eee', borderRadius: 1, p: 1, overflow: 'auto' }}>
            <Typography variant="caption" color="text.secondary">候选 SQL</Typography>
            <pre style={{ whiteSpace: 'pre-wrap' }}>{generateMutation.data?.sql || ''}</pre>
          </Box>

          <Divider sx={{ my: 1 }} />
          <Typography variant="subtitle1">已保存查询</Typography>
          <Box sx={{ overflow: 'auto', flex: 1 }}>
            {(savedList || []).map((q: any) => (
              <Box key={q.id} sx={{ border: '1px solid #eee', borderRadius: 1, p: 1, mb: 1, cursor: 'pointer' }} onClick={() => editorRef.current?.setValue(q.sqlText)}>
                <Typography fontWeight={600}>{q.title}</Typography>
                <Typography variant="body2" color="text.secondary">{q.description}</Typography>
              </Box>
            ))}
          </Box>
        </Box>
      </Container>
    </Box>
  )
}
