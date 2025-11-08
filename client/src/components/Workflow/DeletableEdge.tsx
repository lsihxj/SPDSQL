import React from 'react'
import { BaseEdge, EdgeLabelRenderer, getBezierPath, EdgeProps } from 'reactflow'

export default function DeletableEdge(props: EdgeProps) {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd } = props
  const [edgePath, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition })
  const [hovered, setHovered] = React.useState(false)

  const onDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    const evt = new CustomEvent('wf:delete-edge', { detail: { id } })
    window.dispatchEvent(evt)
  }

  return (
    <g onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} />
      <EdgeLabelRenderer>
        <div
          style={{ position: 'absolute', transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`, pointerEvents: 'all' }}
          className="wf-edge-label"
        >
          {hovered && (
            <button className="wf-edge-del" onClick={onDelete} title="删除连接线">×</button>
          )}
        </div>
      </EdgeLabelRenderer>
    </g>
  )
}
