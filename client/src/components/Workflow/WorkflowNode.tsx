import React, { useMemo, useState } from 'react'
import { Handle, Position } from 'reactflow'
import ConfirmPopover from './ConfirmPopover'

export type WorkflowNodeData = {
  label: string
  kind?: 'start' | 'output' | 'llm' | 'condition' | 'apiCall' | 'dbQuery'
  modelId?: string
}

export default function WorkflowNode({ data, id }: { data: WorkflowNodeData; id: string }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(data.label || '')

  const canShowLeft = data.kind !== 'start'
  const canShowRight = data.kind !== 'output'

  const modelName = useMemo(() => {
    try {
      const arr = JSON.parse(localStorage.getItem('ai_models') || '[]') as any[]
      const m = arr.find(x => x.id === data.modelId)
      return m ? (m.name || m.model || m.id) : '未选择模型'
    } catch {
      return '未选择模型'
    }
  }, [data.modelId])

  const openSettings = (e: React.MouseEvent) => {
    e.stopPropagation()
    const evt = new CustomEvent('wf:open-settings', { detail: { id } })
    window.dispatchEvent(evt)
  }
  const [delAnchor, setDelAnchor] = useState<HTMLElement | null>(null)

  const onNameDblClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    setEditing(true)
  }

  return (
    <div className="wf-node" style={{
      boxShadow: (data as any).isRunning ? '0 0 0 3px rgba(30,136,229,0.25), 0 0 18px rgba(30,136,229,0.45)' : undefined,
      transition: 'box-shadow 200ms ease'
    }}>
      {canShowLeft && (
        <Handle className="wf-handle wf-handle-left" type="target" position={Position.Left} />
      )}

      <div className="wf-card" style={{ position: 'relative' }}>
        {(data as any).isRunning && (
          <div style={{ position: 'absolute', right: 8, top: 8, width: 10, height: 10, borderRadius: '50%', background: '#1e88e5', boxShadow: '0 0 10px #1e88e5', animation: 'wf-pulse 1s infinite' }} />
        )}
        <div className="wf-header" title="双击名称可修改">
          {editing ? (
            <input
              className="wf-node-input"
              value={name}
              autoFocus
              onChange={(e) => setName(e.target.value)}
              onBlur={() => {
                setEditing(false)
                const evt = new CustomEvent('wf:rename-node', { detail: { id, label: name } })
                window.dispatchEvent(evt)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  (e.target as HTMLInputElement).blur()
                }
              }}
            />
          ) : (
            <div className="wf-title" onDoubleClick={onNameDblClick}>{name || '未命名节点'}</div>
          )}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button className="wf-settings-btn" onClick={openSettings} title="设置">⚙</button>
            <button className="wf-delete-btn" onClick={(e) => { e.stopPropagation(); setDelAnchor(e.currentTarget as HTMLElement) }} title="删除">×</button>
            <ConfirmPopover
              anchorEl={delAnchor}
              open={!!delAnchor}
              onClose={() => setDelAnchor(null)}
              onConfirm={() => {
                setDelAnchor(null)
                const evt = new CustomEvent('wf:delete-node', { detail: { id } })
                window.dispatchEvent(evt)
              }}
              text="确认删除该节点吗？"
            />
          </div>
        </div>
        <div className="wf-body" title="拖动此区域移动节点">
          {data.kind === 'start' || data.kind === 'output' ? (
            <div className="wf-model" style={{ visibility: 'hidden' }}>占位</div>
          ) : (
            <div className="wf-model">{modelName}</div>
          )}
        </div>
      </div>

      {canShowRight && (
        <Handle 
          className="wf-handle wf-handle-right" 
          type="source" 
          position={Position.Right}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const evt = new CustomEvent('wf:show-create-menu', { detail: { nodeId: id, handleType: 'source', side: 'right', clientX: e.clientX, clientY: e.clientY } });
            window.dispatchEvent(evt);
          }}
        />
      )}
    </div>
  )
}
