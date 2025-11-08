import React from 'react';
import Sidebar from '../../components/Workflow/Sidebar';
import Canvas from '../../components/Workflow/Canvas';
import DebugModal from '../../components/Workflow/DebugModal';
import PreviewModal from '../../components/Workflow/PreviewModal';
import '../../components/Workflow/Workflow.css';
import { AppBar, Toolbar, Button, Typography, Stack, Box, Dialog, DialogTitle, DialogContent, DialogActions, IconButton, Tooltip } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';

const WorkflowEditor: React.FC = () => {
  const [workflow, setWorkflow] = React.useState<any>(() => {
    try {
      const cached = localStorage.getItem('workflow_current')
      return cached ? JSON.parse(cached) : { nodes: [], edges: [] }
    } catch { return { nodes: [], edges: [] } }
  });
  const [workflowName, setWorkflowName] = React.useState<string>(() => localStorage.getItem('workflow_current_name') || '未命名');
  const [isDebugModalOpen, setIsDebugModalOpen] = React.useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = React.useState<boolean>(() => {
    try { return localStorage.getItem('wf_preview_open') === '1' } catch { return false }
  });
  const [loadVersion, setLoadVersion] = React.useState(0);
  const [isDeleteOpen, setIsDeleteOpen] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<any>(null);
  const [isRenameOpen, setIsRenameOpen] = React.useState(false);
  const [renameTarget, setRenameTarget] = React.useState<any>(null);
  const [renameName, setRenameName] = React.useState<string>('');
  const [isNameOpen, setIsNameOpen] = React.useState(false);
  const [nameInput, setNameInput] = React.useState<string>('');
  const [isClearOpen, setIsClearOpen] = React.useState(false);
  const [sidebarOpen, setSidebarOpen] = React.useState(false); // 默认折叠隐藏
  const [isCopyOpen, setIsCopyOpen] = React.useState(false);
  const [copySource, setCopySource] = React.useState<any>(null);
  const [copyName, setCopyName] = React.useState<string>('');
  // 右侧面板宽度与拖拽状态
  const [rightWidth, setRightWidth] = React.useState<number>(() => {
    const raw = localStorage.getItem('workflow_right_width')
    const v = raw ? parseInt(raw, 10) : 300
    if (Number.isNaN(v)) return 300
    return Math.max(220, Math.min(700, v))
  });
  const [isResizing, setIsResizing] = React.useState<boolean>(false);
  const resizeStartXRef = React.useRef<number>(0);
  const resizeStartWidthRef = React.useRef<number>(300);
  // 顶部导入隐藏 input 引用
  const importInputRef = React.useRef<HTMLInputElement>(null);
  // 导出不支持提示弹窗
  const [exportTipOpen, setExportTipOpen] = React.useState(false);
  const [exportTipMessage, setExportTipMessage] = React.useState<string>('');

  // 首次挂载时，如本地存在上次打开的工作流，则触发一次加载以覆盖画布
  React.useEffect(() => {
    try {
      const hasNodes = Array.isArray(workflow?.nodes) && workflow.nodes.length > 0
      const hasEdges = Array.isArray(workflow?.edges) && workflow.edges.length > 0
      if (hasNodes || hasEdges) {
        setLoadVersion(v => v + 1)
      }
    } catch {}
  }, [])

  // 实时持久化当前画布（刷新不丢）
  React.useEffect(() => {
    try {
      localStorage.setItem('workflow_current', JSON.stringify(workflow))
      localStorage.setItem('workflow_current_name', workflowName)
    } catch {}
  }, [workflow, workflowName])

  // 拖拽分割条事件绑定
  React.useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!isResizing) return
      const deltaX = e.clientX - resizeStartXRef.current
      // 向右拖动变小，向左拖动变大
      const next = Math.max(220, Math.min(700, resizeStartWidthRef.current - deltaX))
      setRightWidth(next)
      try { localStorage.setItem('workflow_right_width', String(next)) } catch {}
    }
    function onMouseUp() {
      if (isResizing) setIsResizing(false)
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [isResizing])

  const persistList = (list: any[]) => {
    localStorage.setItem('workflows', JSON.stringify(list))
  }
  const loadList = (): any[] => {
    try { return JSON.parse(localStorage.getItem('workflows') || '[]') } catch { return [] }
  }

  // 导出：优先目录选择，其次保存文件；不使用浏览器提示框
  const handleExport = async () => {
    const content = JSON.stringify({ ...workflow, name: workflowName }, null, 2)
    const fileName = (workflowName || 'workflow') + '.json'
    try {
      const anyWin: any = window as any
      if (anyWin.showDirectoryPicker) {
        const dirHandle = await anyWin.showDirectoryPicker()
        const fileHandle = await dirHandle.getFileHandle(fileName, { create: true })
        const writable = await fileHandle.createWritable()
        await writable.write(new Blob([content], { type: 'application/json' }))
        await writable.close()
        return
      }
      // 不使用浏览器的保存输入框，统一提示不支持
      setExportTipMessage('当前环境不支持目录选择导出。请使用支持 File System Access API 的浏览器（如 Edge/Chrome），以选择本地文件夹并保存。')
      setExportTipOpen(true)
    } catch (err) {
      setExportTipMessage('导出失败：' + (err instanceof Error ? err.message : String(err)))
      setExportTipOpen(true)
    }
  }

  const handleSave = () => {
    const list = loadList()
    const isNamed = (workflowName || '').trim() !== '未命名'
    if (!isNamed) {
      setNameInput('')
      setIsNameOpen(true)
      return
    }
    const name = (workflowName || '未命名').trim() || '未命名'
    const id = name // 名称即键（兼容旧数据）
    const prev = list.find((x: any) => x.name === name || x.id === name)
    const item = { id, name, data: workflow, updatedAt: Date.now(), published: prev?.published ?? false }
    // 不改变顺序：如果存在则原位替换，否则追加到末尾（兼容旧数据 id≠name）
    const idx = list.findIndex((x: any) => x.name === name || x.id === name)
    if (idx >= 0) {
      list[idx] = item
      persistList(list)
    } else {
      const list2 = [...list, item]
      persistList(list2)
    }
  };

  const handleLoad = (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.target
    const f = input.files?.[0]
    if (!f) return
    const fileReader = new FileReader();
    fileReader.readAsText(f, "UTF-8");
    fileReader.onload = e => {
      try {
        const text = (e?.target as any)?.result as string
        if (!text) return
        const obj = JSON.parse(text)
        // 兼容两种格式：
        // A) 纯 workflow: { nodes, edges, name? }
        // B) 列表项: { id, name, data }
        const data = obj?.nodes && obj?.edges ? obj : (obj?.data || obj)
        // 仅更新画布，不改变当前工作流名称
        setWorkflow(data)
        setLoadVersion(v => v + 1)
      } catch (err) {
        console.error('导入失败：', err)
      } finally {
        input.value = ''
      }
    };
  };

  const handleOpenSaved = () => {
    const list = loadList()
    if (list.length === 0) { alert('暂无已保存的工作流'); return }
    const name = prompt('输入要打开的名称\n可用：\n' + list.map(x => '- ' + x.name).join('\n'))
    if (!name) return
    const found = list.find(x => x.name === name)
    if (!found) { alert('未找到：' + name); return }
    setWorkflow(found.data)
    setWorkflowName(found.name)
    try { localStorage.setItem('workflow_current', JSON.stringify(found.data)); localStorage.setItem('workflow_current_name', found.name) } catch {}
    setLoadVersion(v => v + 1)
  }

  const handleClear = () => {
    setIsClearOpen(true)
  }

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <AppBar position="static" color="primary" elevation={0}>
        <Toolbar>
          <Button color="inherit" startIcon={<ArrowBackIcon />} onClick={() => { try { localStorage.setItem('workflow_current', JSON.stringify(workflow)); localStorage.setItem('workflow_current_name', workflowName) } catch {}; window.location.hash = '' }}>
            返回编辑器
          </Button>
          <Typography variant="h6" sx={{ ml: 2, color: '#fff' }}>
            AI 工作流编辑器
          </Typography>
          <Box sx={{ flex: 1 }} />
          <Stack direction="row" spacing={1} alignItems="center">
            <Box sx={{ px: 1.5, py: 0.5, border: '1px solid rgba(255,255,255,0.5)', borderRadius: 1, background: 'transparent', color: '#fff' }}>
              当前工作流：{workflowName || '未命名'}
            </Box>
            <Button variant="outlined" sx={{ color: '#fff', borderColor: '#fff' }} onClick={() => { setWorkflow({ nodes: [], edges: [] }); setWorkflowName('未命名'); setLoadVersion(v => v + 1); }}>新建</Button>
            <Button variant="outlined" sx={{ color: '#fff', borderColor: '#fff' }} onClick={handleSave}>保存</Button>

            <Button variant="outlined" size="small" sx={{ color: '#fff', borderColor: '#fff' }} onClick={handleExport}>导出</Button>
            <input ref={importInputRef} type="file" accept="application/json" style={{ display: 'none' }} onChange={handleLoad} />
            <Button variant="outlined" size="small" sx={{ color: '#fff', borderColor: '#fff' }} onClick={() => importInputRef.current?.click()}>导入</Button>
            <Button variant="outlined" sx={{ color: '#fff', borderColor: '#fff' }} onClick={() => setIsDebugModalOpen(true)}>Debug</Button>
            <Button variant="contained" color="secondary" onClick={() => { setIsPreviewOpen(true); try { localStorage.setItem('wf_preview_open', '1') } catch {} }}>预览</Button>

            <Button variant="outlined" sx={{ color: '#fff', borderColor: '#fff' }} onClick={handleClear}>清空画布</Button>
          </Stack>
        </Toolbar>
      </AppBar>
      <Box sx={{ display: 'flex', height: 'calc(100vh - 64px)' }}>
        <div className="dndflow" style={{ display: 'flex', width: '100%', position: 'relative' }}>
          {/* 左侧可折叠侧栏（默认折叠） */}
          <div 
            style={{ 
              width: sidebarOpen ? 260 : 0, 
              transition: 'width 200ms ease', 
              overflow: 'hidden', 
              borderRight: sidebarOpen ? '1px solid #e6eaf5' : 'none',
              background: 'linear-gradient(180deg, #f9fbff 0%, #f3f6fd 100%)'
            }}
          >
            <Sidebar 
              onDebug={() => setIsDebugModalOpen(true)} 
              onSave={() => {
                const element = document.createElement('a');
                const file = new Blob([JSON.stringify({ ...workflow, name: workflowName }, null, 2)], { type: 'application/json' });
                element.href = URL.createObjectURL(file);
                element.download = (workflowName || 'workflow') + '.json';
                document.body.appendChild(element);
                element.click();
              }} 
              onLoad={handleLoad}
              onBack={() => { try { localStorage.setItem('workflow_current', JSON.stringify(workflow)); localStorage.setItem('workflow_current_name', workflowName) } catch {}; window.location.hash = '' }}
              onOpenSaved={handleOpenSaved}
              onClear={handleClear}
            />
          </div>

          {/* 折叠/展开开关按钮（贴左） */}
          <div style={{ position: 'absolute', left: sidebarOpen ? 260 : 0, top: 10, zIndex: 2000 }}>
            <Tooltip title={sidebarOpen ? '收起侧栏' : '展开侧栏'}>
              <IconButton size="small" onClick={() => setSidebarOpen(o => !o)} sx={{ background: '#fff', border: '1px solid #e6eaf5' }}>
                {sidebarOpen ? <ChevronLeftIcon /> : <ChevronRightIcon />}
              </IconButton>
            </Tooltip>
          </div>

          {/* 画布 */}
          <div className="reactflow-wrapper" style={{ flex: 1 }}>
            <Canvas setWorkflow={setWorkflow} workflow={workflow} loadVersion={loadVersion} />
          </div>

          {/* 可拖动分割条 */}
          <div
            style={{ width: 6, cursor: 'col-resize', background: isResizing ? '#c8d1e5' : 'transparent' }}
            onMouseDown={(e) => {
              setIsResizing(true)
              resizeStartXRef.current = e.clientX
              resizeStartWidthRef.current = rightWidth
            }}
            title="拖动调整右侧面板宽度"
          />

          {/* 右侧已保存列表 */}
          <div style={{ width: rightWidth, borderLeft: '1px solid #e6eaf5', padding: 14, overflow: 'auto', background: 'linear-gradient(180deg, #f9fbff 0%, #f3f6fd 100%)' }}>
            <div style={{ fontWeight: 700, marginBottom: 10 }}>已保存的工作流</div>
            <div className="wf-saved-list">
              {(() => {
                const list = loadList()
                if (list.length === 0) return <div style={{ color: '#8aa' }}>暂无</div>
                return (
                  <>
                    {list.map((item: any) => (
                      <div key={item.id} className="wf-saved-item" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <button
                          className="wf-name"
                          style={{
                            border: 'none', background: 'transparent', cursor: 'pointer', color: '#1e88e5',
                            flex: 1, minWidth: 0, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', textAlign: 'left'
                          }}
                          onClick={() => { setWorkflow(item.data); setWorkflowName(item.name); try { localStorage.setItem('workflow_current', JSON.stringify(item.data)); localStorage.setItem('workflow_current_name', item.name) } catch {}; setLoadVersion(v => v + 1) }}
                          title={item.name}
                        >{item.name}</button>
                        <div className="wf-actions" style={{ display: 'flex', gap: 8, flexShrink: 0, alignItems: 'center' }}>
                          <select
                            value={item.published ? '1' : '0'}
                            onChange={(e) => {
                              const val = e.target.value === '1'
                              const list2 = loadList()
                              const idx = list2.findIndex((x: any) => x.id === item.id)
                              if (idx >= 0) {
                                list2[idx] = { ...list2[idx], published: val }
                                persistList(list2)
                                setLoadVersion(v => v + 1)
                              }
                            }}
                            style={{
                              border: '1px solid #c8d1e5',
                              borderRadius: 6,
                              padding: '2px 6px',
                              color: '#1e88e5', // 与“重命名”按钮字体颜色一致
                              background: '#fff'
                            }}
                            title="发布状态"
                          >
                            <option value="0">未发布</option>
                            <option value="1">已发布</option>
                          </select>
                          <button className="wf-saved-action" style={{ border: 'none', background: 'transparent', color: '#1e88e5', padding: 0 }} onClick={() => {
                            setRenameTarget(item)
                            setRenameName(item.name || '')
                            setIsRenameOpen(true)
                          }}>重命名</button>
                          <button className="wf-saved-action" style={{ border: 'none', background: 'transparent', color: '#1e88e5', padding: 0 }} onClick={() => {
                            setCopySource(item)
                            const base = (item.name || '未命名').trim() || '未命名'
                            setCopyName(base + ' 副本')
                            setIsCopyOpen(true)
                          }}>复制</button>
                          <button className="wf-saved-action" style={{ border: 'none', background: 'transparent', color: '#1e88e5', padding: 0 }} onClick={() => {
                            setDeleteTarget(item)
                            setIsDeleteOpen(true)
                          }}>删除</button>
                        </div>
                      </div>
                    ))}
                  </>
                )
              })()}
            </div>
          </div>
        </div>
      </Box>
      <Dialog open={isDeleteOpen} onClose={() => setIsDeleteOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>确认删除</DialogTitle>
        <DialogContent dividers>
          确认删除工作流：{deleteTarget?.name || ''}？此操作不可恢复。
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIsDeleteOpen(false)}>取消</Button>
          <Button color="error" variant="contained" onClick={() => {
            try {
              const list2 = loadList().filter((x: any) => x.id !== deleteTarget?.id)
              persistList(list2)
              setIsDeleteOpen(false)
              setDeleteTarget(null)
              setLoadVersion(v => v + 1)
            } catch {}
          }}>删除</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={isRenameOpen} onClose={() => setIsRenameOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>重命名工作流</DialogTitle>
        <DialogContent dividers>
          <input
            style={{ width: '100%', padding: '8px 10px', border: '1px solid #c8d1e5', borderRadius: 6 }}
            value={renameName}
            onChange={(e) => setRenameName(e.target.value)}
            placeholder="请输入新的名称"
          />
          {/* 错误提示容器：在需要时显示统一提示 */}
          <div id="rename-error" style={{ color: '#d32f2f', marginTop: 8, minHeight: 20, fontSize: 12 }}></div>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIsRenameOpen(false)}>取消</Button>
          <Button variant="contained" onClick={() => {
            if (!renameTarget) { setIsRenameOpen(false); return }
            const name = (renameName || '').trim() || (renameTarget.name || '未命名')
            const list2 = loadList()
            // 重名校验（除自身外不允许同名）
            const duplicated = list2.some((x: any) => x.name === name && x.id !== renameTarget.id)
            if (duplicated) {
              const el = document.getElementById('rename-error')
              if (el) el.textContent = '已存在同名的工作流，请修改名称后再保存。'
              return
            }
            const idx = list2.findIndex((x: any) => x.id === renameTarget.id)
            if (idx >= 0) {
              // 同步更新 id 与 name，保证名称唯一即键唯一
              list2[idx].id = name
              list2[idx].name = name
              persistList(list2)
              setWorkflowName(name)
              setIsRenameOpen(false)
              setRenameTarget(null)
              setLoadVersion(v => v + 1)
            } else {
              setIsRenameOpen(false)
            }
          }}>保存</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={isNameOpen} onClose={() => setIsNameOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>保存工作流</DialogTitle>
        <DialogContent dividers>
          <input
            style={{ width: '100%', padding: '8px 10px', border: '1px solid #c8d1e5', borderRadius: 6 }}
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            placeholder="请输入名称"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIsNameOpen(false)}>取消</Button>
          <Button variant="contained" onClick={() => {
            const name = (nameInput || '').trim() || '未命名'
            setWorkflowName(name)
            const list = loadList()
            const id = name
            const prev = list.find((x: any) => x.name === name || x.id === name)
            const item = { id: name, name, data: workflow, updatedAt: Date.now(), published: prev?.published ?? false }
            // 不改变顺序：存在则原位覆盖；不存在则追加到末尾
            const idx = list.findIndex((x: any) => x.name === name || x.id === name)
            if (idx >= 0) {
              list[idx] = item
              persistList(list)
            } else {
              const list2 = [...list, item]
              persistList(list2)
            }
            setIsNameOpen(false)
            setLoadVersion(v => v + 1)
          }}>保存</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={isCopyOpen} onClose={() => setIsCopyOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>复制工作流</DialogTitle>
        <DialogContent dividers>
          <input
            style={{ width: '100%', padding: '8px 10px', border: '1px solid #c8d1e5', borderRadius: 6 }}
            value={copyName}
            onChange={(e) => setCopyName(e.target.value)}
            placeholder="请输入新工作流名称"
          />
          {/* 错误提示容器：在需要时显示统一提示 */}
          <div id="copy-error" style={{ color: '#d32f2f', marginTop: 8, minHeight: 20, fontSize: 12 }}></div>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIsCopyOpen(false)}>取消</Button>
          <Button variant="contained" onClick={() => {
            if (!copySource) { setIsCopyOpen(false); return }
            const name = (copyName || '').trim() || ((copySource.name || '未命名') + ' 副本')
            const list = loadList()
            // 复制时不允许与现有名称重复
            const exists = list.some((x: any) => x.name === name)
            if (exists) {
              const el = document.getElementById('copy-error')
              if (el) el.textContent = '已存在同名的工作流，请修改名称后再保存。'
              return
            }
            const item = { id: name, name, data: copySource.data, updatedAt: Date.now(), published: false }
            list.push(item)
            persistList(list)
            // 切换到新工作流
            setWorkflow(item.data)
            setWorkflowName(name)
            setLoadVersion(v => v + 1)
            setIsCopyOpen(false)
            setCopySource(null)
          }}>保存</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={isClearOpen} onClose={() => setIsClearOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>确认清空画布</DialogTitle>
        <DialogContent dividers>
          此操作只清空当前画布，不删除本地已保存的工作流。
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIsClearOpen(false)}>取消</Button>
          <Button color="error" variant="contained" onClick={() => {
            setWorkflow({ nodes: [], edges: [] })
            setWorkflowName('未命名')
            setLoadVersion(v => v + 1)
            setIsClearOpen(false)
          }}>清空</Button>
        </DialogActions>
      </Dialog>

      <DebugModal isOpen={isDebugModalOpen} onRequestClose={() => setIsDebugModalOpen(false)} workflow={workflow} />
      <PreviewModal isOpen={isPreviewOpen} onRequestClose={() => { setIsPreviewOpen(false); try { localStorage.setItem('wf_preview_open', '0') } catch {} }} workflow={workflow} />

      {/* 导出提示（非浏览器提示框） */}
      <Dialog open={exportTipOpen} onClose={() => setExportTipOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>导出提示</DialogTitle>
        <DialogContent dividers>
          {exportTipMessage}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setExportTipOpen(false)}>知道了</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default WorkflowEditor;
