import { useState, useEffect, useRef } from 'react'
import { Box, Tab, Tabs, Typography, Stack, Button, CircularProgress, Alert, Dialog, DialogTitle, DialogContent, DialogActions, FormControlLabel, Switch, Snackbar, Checkbox, Select, MenuItem } from '@mui/material'
import { QueryResult } from '@/types/api'
import { generateTabTitle, getResultIcon } from '@/utils/queryResultUtils'
import ResizableTable from './ResizableTable'
import { api } from '@/lib/api'

interface QueryResultTabsProps {
  results: QueryResult[]
  onExportCsv?: (result: QueryResult) => void
  defaultSubTab?: number // 0: 结果, 1: 信息
  onInsertSql?: (sql: string) => void // 新增：将 SQL 插入到编辑器
}

export default function QueryResultTabs({ results, onExportCsv, defaultSubTab, onInsertSql }: QueryResultTabsProps) {
  const [activeQueryIndex, setActiveQueryIndex] = useState(0)

  const isQuery = (sql: string | undefined): boolean => {
    if (!sql) return false
    let cleaned = sql.trim().toUpperCase()
    // 跳过行/块注释
    cleaned = cleaned.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '').trim()
    const first = cleaned.split(/[\s\n\r\t]+/)[0] || ''
    return ['SELECT','WITH','SHOW','EXPLAIN'].includes(first)
  }

  const initialIsQuery = results && results[0] ? isQuery(results[0].sql) : false
  const [activeSubTab, setActiveSubTab] = useState<number>(defaultSubTab ?? (initialIsQuery ? 0 : 1)) // 0: 结果网格, 1: 执行信息
  const [diagLoading, setDiagLoading] = useState(false)
  const [diagError, setDiagError] = useState<string>('')
  const [diffOpen, setDiffOpen] = useState(false)
  const [oldSqlForDiff, setOldSqlForDiff] = useState('')
  const [newSqlForDiff, setNewSqlForDiff] = useState('')
  const [sideBySide, setSideBySide] = useState(true)
  const [copyTipOpen, setCopyTipOpen] = useState(false)
  const [copyTipMsg, setCopyTipMsg] = useState('')
  const [copyTipError, setCopyTipError] = useState(false)
  const [autoCloseOnCopy, setAutoCloseOnCopy] = useState<boolean>(() => localStorage.getItem('ai_diff_auto_close_on_copy') === '1')
  const [snackbarPos, setSnackbarPos] = useState<string>(() => localStorage.getItem('ai_diff_snackbar_pos') || 'top-right')
  const diffRef = useRef<HTMLDivElement | null>(null)
  const diffReadyRef = useRef(false)

  // 结果变更时，根据 SQL 类型自动切换默认子页签；如父传入 defaultSubTab，则优先生效
  useEffect(() => {
    setActiveQueryIndex(0)
    const nextIsQuery = results && results[0] ? isQuery(results[0].sql) : false
    setActiveSubTab(defaultSubTab ?? (nextIsQuery ? 0 : 1))
  }, [results, defaultSubTab])

  if (!results || results.length === 0) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography variant="body2" color="text.secondary">
          暂无查询结果
        </Typography>
      </Box>
    )
  }

  const currentResult = results[activeQueryIndex]

  const handleInsertSelection = () => {
    try {
      const selection = window.getSelection()?.toString() || ''
      const text = selection.trim()
      if (!text) {
        setCopyTipMsg('请先选中文本再插入')
        setCopyTipError(true)
        setCopyTipOpen(true)
        return
      }
      onInsertSql?.(text)
      setCopyTipMsg('已插入到编辑器')
      setCopyTipError(false)
      setCopyTipOpen(true)
    } catch (e:any) {
      setCopyTipMsg('插入失败：' + (e?.message || '未知错误'))
      setCopyTipError(true)
      setCopyTipOpen(true)
    }
  }

  const handleAiDiagnose = async (sql: string, error: string) => {
    try {
      setDiagError('')
      setDiagLoading(true)
      const stored = localStorage.getItem('ai_models')
      const models = stored ? JSON.parse(stored) : []
      const diagnoseId = localStorage.getItem('ai_selected_diagnose_model_id') || ''
      const model = models.find((m: any) => String(m.id) === String(diagnoseId)) || null
      const payload: any = { sql, error }
      if (model) {
        payload.modelConfig = {
          baseUrl: model.baseUrl,
          apiKey: model.apiKey,
          model: model.model,
          temperature: model.temperature,
          systemPrompt: model.systemPrompt,
          userPrompt: model.userPrompt,
        }
        payload.variables = { sqlText: sql, error }
      }
      const { data } = await api.post('/api/sql/diagnose', payload)
      const suggestion = data?.suggestion || ''
      if (suggestion) {
        const mode = localStorage.getItem('ai_diagnose_insert_mode') || 'diff'
        if (mode === 'diff') {
          setOldSqlForDiff(sql)
          setNewSqlForDiff(suggestion)
          setDiffOpen(true)
          // 延迟到对话框渲染后创建 Monaco Diff Editor
          setTimeout(() => {
            try {
              const monaco = (window as any).monaco
              if (!monaco || !diffRef.current) return
              // 避免重复创建
              if (diffRef.current.getAttribute('data-mounted') === '1') {
                // 更新模型内容
                const existing = (diffRef.current as any).__diffEditor
                if (existing) {
                  const originalModel = monaco.editor.createModel(oldSqlForDiff, 'pgsql')
                  const modifiedModel = monaco.editor.createModel(suggestion, 'pgsql')
                  existing.setModel({ original: originalModel, modified: modifiedModel })
                }
                return
              }
              const originalModel = monaco.editor.createModel(sql, 'pgsql')
              const modifiedModel = monaco.editor.createModel(suggestion, 'pgsql')
              const diffEditor = monaco.editor.createDiffEditor(diffRef.current, {
                readOnly: false,
                renderSideBySide: true,
                originalEditable: false,
                automaticLayout: true,
                minimap: { enabled: false }
              })
              // 暴露一个更新视图模式的方法
              ;(diffRef.current as any).__setSideBySide = (v: boolean) => {
                try {
                  diffEditor.updateOptions({ renderSideBySide: v })
                } catch {}
              }
              diffEditor.setModel({ original: originalModel, modified: modifiedModel })
              ;(diffRef.current as any).__diffEditor = diffEditor
              diffRef.current.setAttribute('data-mounted', '1')
            } catch {}
          }, 0)
        } else {
          // 直接插入并添加注释分隔符
          const withSep = `-- BEGIN AI FIX\n${suggestion}\n-- END AI FIX\n`
          onInsertSql?.(withSep)
        }
      }
    } catch (err: any) {
      console.error('AI诊断失败', err)
      setDiagError(err?.response?.data?.error || err?.message || '诊断失败')
    } finally {
      setDiagLoading(false)
    }
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* 查询结果页签 */}
      <Box sx={{ 
        borderBottom: '1px solid #ddd', 
        bgcolor: '#fafafa',
        overflowX: 'auto',
        overflowY: 'hidden'
      }}>
        <Tabs
          value={activeQueryIndex}
          onChange={(e, v) => {
            setActiveQueryIndex(v)
            const nextIsQuery = results && results[v] ? isQuery(results[v].sql) : false
            setActiveSubTab(nextIsQuery ? 0 : 1) // 查询看“结果”，非查询看“信息”
          }}
          variant="scrollable"
          scrollButtons="auto"
          sx={{ 
            minHeight: 42,
            '& .MuiTab-root': {
              minHeight: 42,
              py: 1,
              px: 2,
              fontSize: '0.875rem',
              textTransform: 'none'
            }
          }}
        >
          {results.map((result, index) => (
            <Tab
              key={index}
              label={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <span>{getResultIcon(result)}</span>
                  <span title={result.sql}>{generateTabTitle(result)}</span>
                </Box>
              }
              sx={{
                color: result.success ? 'inherit' : 'error.main',
                fontWeight: result.success ? 400 : 600
              }}
            />
          ))}
        </Tabs>
      </Box>

      {/* 子页签：结果网格 / 执行信息 */}
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{
          px: 1,
          py: 0.5,
          bgcolor: '#f5f5f5',
          borderBottom: '1px solid #ddd',
          minHeight: 40
        }}
      >
        <Tabs
          value={activeSubTab}
          onChange={(e, v) => setActiveSubTab(v)}
          sx={{ minHeight: 36 }}
        >
          <Tab label="结果" sx={{ minHeight: 36, py: 0.5 }} />
          <Tab label="信息" sx={{ minHeight: 36, py: 0.5 }} />
        </Tabs>
        <Stack direction="row" spacing={1}>
          {currentResult?.rows && activeSubTab === 0 && onExportCsv && (
            <Button size="small" onClick={() => onExportCsv(currentResult)}>
              导出 CSV
            </Button>
          )}
        </Stack>
      </Stack>

      {/* 内容区域 */}
      <Box sx={{ flex: 1, overflow: 'hidden', p: 0 }}>
        {activeSubTab === 0 && (
          <Box sx={{ height: '100%', overflow: 'hidden' }}>
            {currentResult?.rows && currentResult.rows.length > 0 ? (
              <ResizableTable data={currentResult.rows} />
            ) : (
              <Box sx={{ p: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  {currentResult?.error ? '查询出错，请查看信息标签' : '未返回结果集'}
                </Typography>
              </Box>
            )}
          </Box>
        )}

        {activeSubTab === 1 && (
          <Box sx={{ p: 2, overflow: 'auto', height: '100%' }}>
            {currentResult && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="subtitle2" gutterBottom>
                  执行信息
                </Typography>
                <Stack spacing={0.5} sx={{ fontSize: '0.875rem' }}>
                  <Box>
                    <strong>状态：</strong>
                    <Typography
                      component="span"
                      color={currentResult.error ? 'error' : 'success.main'}
                    >
                      {currentResult.error ? '失败' : '成功'}
                    </Typography>
                  </Box>
                  {currentResult.rows && (
                    <Box>
                      <strong>返回行数：</strong>
                      {currentResult.rows.length}
                    </Box>
                  )}
                  {currentResult.affectedRows !== undefined && (
                    <Box>
                      <strong>影响行数：</strong>
                      {currentResult.affectedRows}
                    </Box>
                  )}
                  {currentResult.duration && (
                    <Box>
                      <strong>执行耗时：</strong>
                      {currentResult.duration}
                    </Box>
                  )}
                  <Box sx={{ mt: 1 }}>
                    <strong>SQL 语句：</strong>
                  </Box>
                  <Box
                    sx={{
                      bgcolor: '#f9f9f9',
                      border: '1px solid #e0e0e0',
                      borderRadius: 1,
                      p: 1.5,
                      whiteSpace: 'pre-wrap',
                      fontFamily: 'monospace',
                      fontSize: '0.875rem',
                      maxHeight: '200px',
                      overflow: 'auto'
                    }}
                  >
                    {currentResult.sql}
                  </Box>
                </Stack>
              </Box>
            )}

            {currentResult?.error && (
              <Box sx={{ mt: 2 }}>
                <Typography variant="subtitle2" gutterBottom color="error">
                  错误信息
                </Typography>
                <Box
                  sx={{
                    bgcolor: '#fff3f3',
                    border: '1px solid #ffcdd2',
                    borderRadius: 1,
                    p: 1.5,
                    whiteSpace: 'pre-wrap',
                    fontFamily: 'monospace',
                    fontSize: '0.875rem'
                  }}
                >
                  {currentResult.error}
                </Box>

                {diagError && (
                  <Alert severity="error" sx={{ mt: 1 }}>{diagError}</Alert>
                )}

                <Button
                  size="small"
                  variant="outlined"
                  color="primary"
                  sx={{ mt: 1 }}
                  onClick={() => handleAiDiagnose(currentResult.sql, currentResult.error || '')}
                  disabled={diagLoading}
                  startIcon={diagLoading ? <CircularProgress size={16} /> : undefined}
                >
                  {diagLoading ? '正在诊断…' : '🤖 AI诊断并修正'}
                </Button>
              </Box>
            )}
          </Box>
        )}
      </Box>

      {/* Diff 预览对话框（简单左右对比文本） */}
      <Dialog open={diffOpen} onClose={() => setDiffOpen(false)} maxWidth="lg" PaperProps={{ sx: { width: '100%' } }}>
        <DialogTitle>诊断修正 Diff 预览</DialogTitle>
        <DialogContent dividers>
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
            <FormControlLabel
              control={<Switch size="small" checked={sideBySide} onChange={(e) => {
                const v = e.target.checked
                setSideBySide(v)
                const setter = (diffRef.current as any)?.__setSideBySide
                if (setter) setter(v)
              }} />}
              label={sideBySide ? '并排模式' : '内联模式'}
            />
            <Stack direction="row" spacing={1}>
              <FormControlLabel
                control={<Checkbox size="small" checked={autoCloseOnCopy} onChange={(e) => {
                  const v = e.target.checked
                  setAutoCloseOnCopy(v)
                  localStorage.setItem('ai_diff_auto_close_on_copy', v ? '1' : '0')
                }} />}
                label="复制后自动关闭"
              />
              <Select size="small" value={snackbarPos} onChange={(e) => {
                const v = String(e.target.value)
                setSnackbarPos(v)
                localStorage.setItem('ai_diff_snackbar_pos', v)
              }} sx={{ minWidth: 140 }}>
                <MenuItem value="top-right">右上角</MenuItem>
                <MenuItem value="bottom-center">底部中间</MenuItem>
              </Select>
              <Button size="small" onClick={async () => {
                try {
                  await navigator.clipboard.writeText(newSqlForDiff || '')
                  setCopyTipMsg('已复制到剪贴板')
                  setCopyTipError(false)
                  setCopyTipOpen(true)
                  if (autoCloseOnCopy) setDiffOpen(false)
                } catch (e:any) {
                  setCopyTipMsg('复制失败：' + (e?.message || '未知错误'))
                  setCopyTipError(true)
                  setCopyTipOpen(true)
                }
              }}>复制修正 SQL</Button>
            </Stack>
          </Stack>
          <Box ref={diffRef} sx={{ height: 460, border: '1px solid #ddd', borderRadius: 1 }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDiffOpen(false)}>取消</Button>
          <Button
            variant="contained"
            onClick={() => {
              try {
                const diffEditor = (diffRef.current as any)?.__diffEditor
                let textToInsert = newSqlForDiff
                if (diffEditor && typeof diffEditor.getModifiedEditor === 'function') {
                  const modified = diffEditor.getModifiedEditor()
                  if (modified && typeof modified.getSelection === 'function') {
                    const selection = modified.getSelection()
                    const model = modified.getModel?.()
                    if (selection && model) {
                      const selected = model.getValueInRange(selection)
                      if (selected && selected.trim().length > 0) {
                        textToInsert = selected.trim()
                      }
                    }
                  }
                }
                onInsertSql?.(textToInsert)
              } catch {
                onInsertSql?.(newSqlForDiff)
              }
              setDiffOpen(false)
            }}
          >
            插入到编辑器
          </Button>
        </DialogActions>
      </Dialog>
      <Snackbar
        open={copyTipOpen}
        autoHideDuration={2000}
        onClose={() => setCopyTipOpen(false)}
        message={copyTipMsg}
        anchorOrigin={snackbarPos === 'top-right' ? { vertical: 'top', horizontal: 'right' } : { vertical: 'bottom', horizontal: 'center' }}
        ContentProps={{ sx: { bgcolor: copyTipError ? 'error.main' : 'success.main', color: '#fff' } }}
      />
    </Box>
  )
}
