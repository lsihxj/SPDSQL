import { useState, useCallback, useRef, useEffect } from 'react'
import { Box, Button, Stack, TextField, Switch, FormControlLabel, Typography, Paper, Alert, CircularProgress, AppBar, Toolbar, Divider, Checkbox, IconButton, Menu, MenuItem, Tooltip } from '@mui/material'
import RefreshIcon from '@mui/icons-material/Refresh'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import SendIcon from '@mui/icons-material/Send'
import CloseIcon from '@mui/icons-material/Close'
import CheckIcon from '@mui/icons-material/Check'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import DragIndicatorIcon from '@mui/icons-material/DragIndicator'
import { api } from '@/lib/api'
import ReactFlow, {
  Node,
  Edge,
  addEdge,
  Connection,
  useNodesState,
  useEdgesState,
  Controls,
  Background,
  NodeProps,
  EdgeProps,
  getBezierPath,
  BaseEdge,
  EdgeLabelRenderer,
  useReactFlow,
  ReactFlowProvider,
  Handle,
  Position,
} from 'reactflow'
import 'reactflow/dist/style.css'

// JOIN类型配置
const JOIN_TYPES = {
  INNER: { label: '内连接', color: '#2196f3', sqlKeyword: 'INNER JOIN' },
  LEFT: { label: '左连接', color: '#4caf50', sqlKeyword: 'LEFT JOIN' },
  RIGHT: { label: '右连接', color: '#ff9800', sqlKeyword: 'RIGHT JOIN' },
  FULL: { label: '全连接', color: '#9c27b0', sqlKeyword: 'FULL OUTER JOIN' },
  CROSS: { label: '交叉连接', color: '#f44336', sqlKeyword: 'CROSS JOIN' },
} as const

type JoinType = keyof typeof JOIN_TYPES

interface ColumnInfo {
  name: string
  dataType: string
  isNullable: boolean
  length?: number
}

interface TableInfo {
  tableSchema: string
  tableName: string
  columns: ColumnInfo[]
}

interface TableNodeData {
  table: TableInfo
  onFieldDragStart: (tableId: string, fieldName: string) => void
  selectedFields: Set<string>
  onFieldToggle: (tableId: string, fieldName: string, selected: boolean) => void
  onRemove?: (tableId: string) => void
  // 画布是否处于拖线状态（用于指针反馈）
  draggingEdgeActive?: boolean
  // 从端口开始拖线的回调
  onStartDragEdge: (tableId: string, fieldName: string, side: 'left'|'right', clientX: number, clientY: number) => void
  // 卡片hover事件
  onCardHover?: (tableId: string) => void
  onCardLeave?: () => void
  isHighlighted?: boolean
  // 有连接的字段名称集合
  connectedFields?: Set<string>
}

// 自定义表节点组件
function TableNode({ data }: NodeProps<TableNodeData>) {
  const { table, onFieldDragStart, selectedFields, onFieldToggle, onRemove, draggingEdgeActive, onStartDragEdge, onCardHover, onCardLeave, isHighlighted, connectedFields } = data
  const tableId = `${table.tableSchema}.${table.tableName}`
  const listRef = useRef<HTMLDivElement | null>(null)
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const [rowCenters, setRowCenters] = useState<Record<string, number>>({})
  const rafRef = useRef<number | null>(null)

  const recalcPositions = useCallback(() => {
    if (rafRef.current != null) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      const lr = listRef.current?.getBoundingClientRect()
      if (!lr) return
      const centers: Record<string, number> = {}
      table.columns.forEach(col => {
        const el = rowRefs.current[col.name]
        if (!el) return
        const r = el.getBoundingClientRect()
        centers[col.name] = r.top - lr.top + r.height / 2
      })
      // 只有在值变化时才更新，减少不必要重绘
      const changed = Object.keys(centers).some(k => centers[k] !== rowCenters[k]) || Object.keys(rowCenters).length !== Object.keys(centers).length
      if (changed) setRowCenters(centers)
    })
  }, [table.columns, rowCenters])

  // 确保有连接的字段在可见区域
  useEffect(() => {
    if (!connectedFields || connectedFields.size === 0 || !listRef.current) return
    
    const scrollContainer = listRef.current
    const containerHeight = scrollContainer.clientHeight
    const scrollTop = scrollContainer.scrollTop
    const scrollBottom = scrollTop + containerHeight
    
    // 检查所有有连接的字段
    connectedFields.forEach(fieldName => {
      const fieldElement = rowRefs.current[fieldName]
      if (!fieldElement) return
      
      const fieldRect = fieldElement.getBoundingClientRect()
      const containerRect = scrollContainer.getBoundingClientRect()
      const fieldTop = fieldElement.offsetTop
      const fieldBottom = fieldTop + fieldElement.offsetHeight
      
      // 如果字段不在可见区域，滚动到该字段
      if (fieldTop < scrollTop || fieldBottom > scrollBottom) {
        // 滚动到字段居中位置
        const targetScroll = fieldTop - containerHeight / 2 + fieldElement.offsetHeight / 2
        scrollContainer.scrollTo({
          top: Math.max(0, targetScroll),
          behavior: 'smooth'
        })
      }
    })
  }, [connectedFields])

  useEffect(() => {
    recalcPositions()
    const el = listRef.current
    const onScroll = () => recalcPositions()
    window.addEventListener('resize', onScroll)
    el?.addEventListener('scroll', onScroll)
    return () => {
      window.removeEventListener('resize', onScroll)
      el?.removeEventListener('scroll', onScroll)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [recalcPositions])

  return (
    <Paper 
      className="nowheel"
      elevation={0}
      onMouseEnter={() => onCardHover?.(tableId)}
      onMouseLeave={() => onCardLeave?.()}
      sx={{ 
        width: 280,
        borderRadius: '8px',
        overflow: 'visible',
        border: isHighlighted ? '2px solid' : '1px solid',
        borderColor: isHighlighted ? '#1976d2' : '#e0e0e0',
        boxShadow: isHighlighted 
          ? '0 8px 24px rgba(25,118,210,0.25)' 
          : '0 4px 12px rgba(0,0,0,0.08)',
        transition: 'all 0.3s ease',
        bgcolor: isHighlighted ? '#f5f9ff' : '#ffffff',
        '&:hover': {
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          borderColor: '#1976d2',
          borderWidth: '2px'
        }
      }}
    >
      {/* 表头 */}
      <Box 
        className="drag-handle"
        sx={{ 
          p: 1.5, 
          background: 'linear-gradient(135deg, #1976d2 0%, #42a5f5 100%)',
          color: '#ffffff',
          position: 'relative',
          cursor: 'move',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          minHeight: 56,
          '&::before': {
            content: '"≡"',
            position: 'absolute',
            left: 8,
            fontSize: '1.2rem',
            opacity: 0.6
          }
        }}
      >
        <Box sx={{ flex: 1, minWidth: 0, ml: 3 }}>
          <Typography variant="subtitle2" sx={{ 
            fontSize: '14px', 
            fontWeight: 600,
            color: '#ffffff',
            wordBreak: 'break-word',
            lineHeight: 1.4,
            mb: 0.3
          }}>
            {table.tableSchema}.{table.tableName}
          </Typography>
          <Typography variant="caption" sx={{ 
            fontSize: '12px',
            color: 'rgba(255,255,255,0.9)',
            display: 'block',
            lineHeight: 1.3
          }}>
            {table.columns.length} 个字段
          </Typography>
        </Box>
        
        {/* 关闭按钮 */}
        <IconButton
          size="small"
          onClick={(e) => {
            e.stopPropagation()
            onRemove?.(tableId)
          }}
          sx={{
            color: '#ffffff',
            width: 24,
            height: 24,
            ml: 1,
            '&:hover': {
              bgcolor: 'rgba(255,255,255,0.2)',
              transform: 'scale(1.1)'
            }
          }}
        >
          <CloseIcon sx={{ fontSize: '1rem' }} />
        </IconButton>
      </Box>
      
      {/* 字段列表 */}
      <Divider sx={{ borderColor: '#e0e0e0' }} />

      <Box 
        className="nodrag nowheel"
        sx={{ 
          position: 'relative',
          maxHeight: 400,
          minHeight: 120,
          overflowY: table.columns.length > 10 ? 'auto' : 'visible',
          overflowX: 'visible',
          cursor: draggingEdgeActive ? 'crosshair' : 'default',
          bgcolor: '#ffffff',
          scrollbarWidth: 'thin',
          scrollbarColor: '#bdbdbd #f5f5f5',
          '&::-webkit-scrollbar': {
            width: '6px'
          },
          '&::-webkit-scrollbar-track': {
            background: '#f5f5f5'
          },
          '&::-webkit-scrollbar-thumb': {
            background: '#bdbdbd',
            borderRadius: '3px',
            '&:hover': {
              background: '#9e9e9e'
            }
          }
        }}
        ref={listRef}
      >
        {table.columns.map((col, idx) => {
          const fieldKey = `${tableId}-${col.name}`
          const isSelected = selectedFields.has(fieldKey)
          
          const hasConnection = connectedFields?.has(col.name)
          return (
            <Box
              key={idx}
              className="nodrag field-row"
              data-field-name={col.name}
              data-table-id={tableId}
              /*ref={(el) => { rowRefs.current[col.name] = el }}*/
              ref={(el: HTMLDivElement | null) => {   
                rowRefs.current[col.name] = el 
                }}
              sx={{
                display: 'flex',
                alignItems: 'center',
                py: 1,
                px: 1.5,
                borderBottom: idx < table.columns.length - 1 ? '1px solid' : 'none',
                borderColor: '#f0f0f0',
                position: 'relative',
                minHeight: 40,
                '&:hover': { 
                  bgcolor: '#f5f5f5'
                },
                bgcolor: isSelected ? '#e3f2fd' : (idx % 2 === 0 ? '#ffffff' : '#fafafa'),
                transition: 'all 0.2s ease',
                cursor: draggingEdgeActive ? 'crosshair' : 'default',
                // 连接点常显：在有连接或正在拖线时提升端口与 Handle 的可见性
                '& .field-port': {
                  opacity: hasConnection || draggingEdgeActive ? 1 : 0,
                },
                '& .rf-field-handle': {
                  opacity: hasConnection || draggingEdgeActive ? 1 : 0,
                },
              }}


            >
              {/* ReactFlow Handle - 左侧连接点 */}
              <Handle
                className="rf-field-handle rf-field-handle-left"
                type="source"
                position={Position.Left}
                id={`${tableId}-${col.name}-left`}
                style={{
                  left: -6,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  border: '2px solid #1976d2',
                  background: '#ffffff',
                  zIndex: 11,
                  pointerEvents: 'none',
                  opacity: 0
                }}
              />
              <Handle
                className="rf-field-handle rf-field-handle-left"
                type="target"
                position={Position.Left}
                id={`${tableId}-${col.name}-left`}
                style={{
                  left: -6,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  border: '2px solid #1976d2',
                  background: '#ffffff',
                  zIndex: 11,
                  pointerEvents: 'none',
                  opacity: 0
                }}
              />
              
              {/* 字段选择复选框 */}
              <Checkbox
                size="small"
                checked={isSelected}
                onChange={(e) => onFieldToggle(tableId, col.name, e.target.checked)}
                onClick={(e) => e.stopPropagation()}
                onDoubleClick={(e) => e.stopPropagation()}
                sx={{ 
                  p: 0.5,
                  cursor: 'pointer',
                  '& .MuiSvgIcon-root': { 
                    fontSize: '1.1rem',
                    color: isSelected ? '#1976d2' : '#9e9e9e'
                  }
                }}
              />
              
              {/* 字段文本区域（不触发拖线） */}
              <Box sx={{ 
                flex: 1, 
                ml: 1, 
                minWidth: 0,
                overflow: 'hidden',
              }}>
                <Typography variant="body2" sx={{ 
                  fontWeight: isSelected ? 600 : 500, 
                  fontSize: '13px',
                  color: '#212121',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  lineHeight: 1.4,
                  mb: 0.2
                }}>
                  {col.name}
                </Typography>
                <Typography variant="caption" sx={{ 
                  fontSize: '11px',
                  color: '#757575',
                  display: 'block',
                  lineHeight: 1.3,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}>
                  {col.dataType}{col.length ? `(${col.length})` : ''} {col.isNullable ? '' : 'NOT NULL'}
                </Typography>
              </Box>

              {/* 左右端口：十字圆，可拖拽建立连接 */}
              <Box 
                className="field-port"
                data-table-id={tableId}
                data-field-name={col.name}
                data-side="left"
                onMouseDown={(e) => {
                  e.stopPropagation()
                  onStartDragEdge(tableId, col.name, 'left', e.clientX, e.clientY)
                }}
                sx={{
                  position: 'absolute',
                  left: -6,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  border: '2px solid #1976d2',
                  bgcolor: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 10,
                  cursor: 'crosshair',
                  transition: 'all 0.2s ease',
                  opacity: draggingEdgeActive ? 1 : 0,
                  '&::before': {
                    content: '""',
                    position: 'absolute',
                    left: '50%',
                    top: '50%',
                    width: 6,
                    height: 2,
                    background: '#1976d2',
                    borderRadius: 1,
                    transform: 'translate(-50%, -50%)',
                  },
                  '&::after': {
                    content: '""',
                    position: 'absolute',
                    left: '50%',
                    top: '50%',
                    width: 2,
                    height: 6,
                    background: '#1976d2',
                    borderRadius: 1,
                    transform: 'translate(-50%, -50%)',
                  },
                  '.field-row:hover &': {
                    opacity: 1,
                    transform: 'translateY(-50%) scale(1.2)'
                  },
                  '&:hover': {
                    boxShadow: '0 0 8px rgba(25,118,210,0.5)',
                    transform: 'translateY(-50%) scale(1.3) !important'
                  }
                }}
              />
              <Box 
                className="field-port"
                data-table-id={tableId}
                data-field-name={col.name}
                data-side="right"
                onMouseDown={(e) => {
                  e.stopPropagation()
                  onStartDragEdge(tableId, col.name, 'right', e.clientX, e.clientY)
                }}
                sx={{
                  position: 'absolute',
                  right: -6,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  border: '2px solid #1976d2',
                  bgcolor: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 10,
                  cursor: 'crosshair',
                  transition: 'all 0.2s ease',
                  opacity: draggingEdgeActive ? 1 : 0,
                  '&::before': {
                    content: '""',
                    position: 'absolute',
                    left: '50%',
                    top: '50%',
                    width: 6,
                    height: 2,
                    background: '#1976d2',
                    borderRadius: 1,
                    transform: 'translate(-50%, -50%)',
                  },
                  '&::after': {
                    content: '""',
                    position: 'absolute',
                    left: '50%',
                    top: '50%',
                    width: 2,
                    height: 6,
                    background: '#1976d2',
                    borderRadius: 1,
                    transform: 'translate(-50%, -50%)',
                  },
                  '.field-row:hover &': {
                    opacity: 1,
                    transform: 'translateY(-50%) scale(1.2)'
                  },
                  '&:hover': {
                    boxShadow: '0 0 8px rgba(25,118,210,0.5)',
                    transform: 'translateY(-50%) scale(1.3) !important'
                  }
                }}
              />
              
              {/* ReactFlow Handle - 右侧连接点 */}
              <Handle
                className="rf-field-handle rf-field-handle-right"
                type="source"
                position={Position.Right}
                id={`${tableId}-${col.name}-right`}
                style={{
                  right: -6,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  border: '2px solid #1976d2',
                  background: '#ffffff',
                  zIndex: 11,
                  pointerEvents: 'none',
                  opacity: 0
                }}
              />
              <Handle
                className="rf-field-handle rf-field-handle-right"
                type="target"
                position={Position.Right}
                id={`${tableId}-${col.name}-right`}
                style={{
                  right: -6,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  border: '2px solid #1976d2',
                  background: '#ffffff',
                  zIndex: 11,
                  pointerEvents: 'none',
                  opacity: 0
                }}
              />


            </Box>
          )
        })}

      </Box>
    </Paper>
  )
}

// 自定义连接线组件
function JoinEdge({ 
  id,
  sourceX, 
  sourceY, 
  targetX, 
  targetY, 
  sourcePosition, 
  targetPosition,
  data,
  selected,
}: EdgeProps) {
  const [menuPos, setMenuPos] = useState<{ mouseX: number; mouseY: number } | null>(null)
  const [tooltipOpen, setTooltipOpen] = useState(false)
  const { setEdges } = useReactFlow()
  
  const joinType = (data?.joinType || 'INNER') as JoinType
  const isHighlighted = data?.isHighlighted || false
  
  const joinConfig = JOIN_TYPES[joinType]
  
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })

  const handleLabelClick = (event: React.MouseEvent<HTMLElement>) => {
    event.stopPropagation()
    event.preventDefault()
    setMenuPos({ mouseX: event.clientX, mouseY: event.clientY })
  }

  const handleJoinTypeChange = (newType: JoinType) => {
    setEdges((edges) => 
      edges.map((edge) => 
        edge.id === id 
          ? { ...edge, data: { ...edge.data, joinType: newType } }
          : edge
      )
    )
    setMenuPos(null)
  }

  const handleDeleteEdge = () => {
    setEdges((edges) => edges.filter(e => e.id !== id))
  }

  const handleClose = () => {
    setMenuPos(null)
  }

  // 根据高亮状态和选中状态决定样式
  const strokeColor = isHighlighted 
    ? joinConfig.color
    : (selected ? '#1976d2' : joinConfig.color)
  const strokeWidth = isHighlighted ? 4 : (selected ? 3 : 2)
  const opacity = isHighlighted ? 1 : (data?.dimmed ? 0.2 : 1)

  return (
    <>
      <Tooltip 
        title={joinConfig.sqlKeyword}
        arrow
        placement="top"
        open={tooltipOpen}
        disableInteractive
        slotProps={{
          tooltip: {
            sx: {
              bgcolor: joinConfig.color,
              fontSize: '13px',
              fontWeight: 600,
              py: 0.75,
              px: 1.5,
              '& .MuiTooltip-arrow': {
                color: joinConfig.color
              }
            }
          }
        }}
      >
        <g
          onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setMenuPos({ mouseX: e.clientX, mouseY: e.clientY }); }}
        >
          <BaseEdge 
            id={id}
            path={edgePath} 
            style={{ 
              stroke: opacity < 1 ? '#bdbdbd' : strokeColor,
              strokeWidth,
              opacity,
              filter: isHighlighted ? `drop-shadow(0 0 8px ${joinConfig.color}80)` : 'none',
              transition: 'all 0.2s ease'
            }} 
          />
        </g>
      </Tooltip>
      
      <EdgeLabelRenderer>
        <div
          style={{ position: 'absolute', transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`, zIndex: 1000 }}
        >
          <Box
            onClick={handleLabelClick}
            onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setMenuPos({ mouseX: e.clientX, mouseY: e.clientY }); }}
            onMouseEnter={() => setTooltipOpen(true)}
            onMouseLeave={() => setTooltipOpen(false)}
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 1,
              bgcolor: 'rgba(255,255,255,0.9)',
              border: `1px solid ${joinConfig.color}`,
              borderRadius: '12px',
              px: 1,
              py: 0.25,
              color: joinConfig.color,
              boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              '&:hover': {
                transform: 'scale(1.03)',
                boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
              }
            }}
          >
            <Typography sx={{ fontSize: '11px', fontWeight: 700 }}>
              {joinConfig.sqlKeyword}
            </Typography>
          </Box>
        </div>
      </EdgeLabelRenderer>

      <Menu
        anchorReference="anchorPosition"
        anchorPosition={menuPos ? { top: menuPos.mouseY, left: menuPos.mouseX } : undefined}
        open={!!menuPos}
        onClose={handleClose}
        PaperProps={{ sx: { borderRadius: '8px', minWidth: 220, boxShadow: '0 4px 16px rgba(0,0,0,0.15)' } }}
      >
        {Object.entries(JOIN_TYPES).map(([key, cfg]) => (
          <MenuItem key={key} onClick={() => { handleJoinTypeChange(key as JoinType); }} sx={{ py: 1, px: 2 }}>
            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: cfg.color, mr: 1 }} />
            <Typography sx={{ fontSize: 13, mr: 1 }}>{cfg.sqlKeyword}</Typography>
            <Typography sx={{ fontSize: 12, color: '#757575' }}>（{cfg.label}）</Typography>
            {joinType === (key as JoinType) && <CheckIcon sx={{ fontSize: 16, ml: 'auto', color: cfg.color }} />}
          </MenuItem>
        ))}
        <Divider sx={{ my: 0.5 }} />
        <MenuItem onClick={() => { handleDeleteEdge(); handleClose(); }} sx={{ py: 1, px: 2 }}>
          <DeleteOutlineIcon sx={{ fontSize: 16, mr: 1 }} /> 删除连接线
        </MenuItem>
      </Menu>
    </>
  )
}

const nodeTypes = {
  table: TableNode,
}

const edgeTypes = {
  joinEdge: JoinEdge,
}

// 内部主组件
function ErdNewInner() {
  const [schema, setSchema] = useState('public')
  const [useCustomSql, setUseCustomSql] = useState(false)
  const [customSql, setCustomSql] = useState(`SELECT 
    table_schema, table_name, column_name, data_type, 
    is_nullable, character_maximum_length
FROM information_schema.columns 
WHERE table_schema = 'public' 
ORDER BY table_name, ordinal_position`)
  const [tables, setTables] = useState<TableInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [tableSearch, setTableSearch] = useState('')
  const [includeSchema, setIncludeSchema] = useState(true)
  
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const { screenToFlowPosition, getViewport, setViewport } = useReactFlow() // 获取viewport信息用于坐标转换
  
  const draggedField = useRef<{ tableId: string; fieldName: string } | null>(null)
  
  // 拖线临时状态
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const [draggingEdge, setDraggingEdge] = useState<{
    source: { tableId: string; fieldName: string; side: 'left' | 'right' }
    startClient: { x: number; y: number }
    currentClient: { x: number; y: number }
  } | null>(null)

  // SQL 生成和显示相关状态
  const [generatedSql, setGeneratedSql] = useState('')
  const [showSqlPanel, setShowSqlPanel] = useState(false)
  const [sqlPanelHeight, setSqlPanelHeight] = useState(200)
  const [isDragging, setIsDragging] = useState(false)
  const dragStartY = useRef(0)
  const dragStartHeight = useRef(0)
  
  // 字段选择状态 (tableId-fieldName -> boolean)
  const [selectedFields, setSelectedFields] = useState<Set<string>>(new Set())
  
  // 高亮相关状态
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)
  const [highlightedEdges, setHighlightedEdges] = useState<Set<string>>(new Set())
  const edgesByTableRef = useRef<Map<string, Set<string>>>(new Map())
  
  // 计算每个表的有连接的字段
  const connectedFieldsByTable = useRef<Map<string, Set<string>>>(new Map())
  
  useEffect(() => {
    const fieldsMap = new Map<string, Set<string>>()
    
    edges.forEach(edge => {
      const sourceTable = edge.source
      const targetTable = edge.target
      const sourceField = edge.data?.sourceField
      const targetField = edge.data?.targetField
      
      if (sourceField) {
        if (!fieldsMap.has(sourceTable)) {
          fieldsMap.set(sourceTable, new Set())
        }
        fieldsMap.get(sourceTable)!.add(sourceField)
      }
      
      if (targetField) {
        if (!fieldsMap.has(targetTable)) {
          fieldsMap.set(targetTable, new Set())
        }
        fieldsMap.get(targetTable)!.add(targetField)
      }
    })
    
    connectedFieldsByTable.current = fieldsMap
  }, [edges])

  // 从localStorage加载状态
  useEffect(() => {
    const savedStateJSON = localStorage.getItem('erdState');
    if (savedStateJSON) {
      try {
        const savedState = JSON.parse(savedStateJSON);
        if (savedState && savedState.nodes && savedState.nodes.length > 0) {
          setNodes(savedState.nodes);
          setEdges(savedState.edges || []);
          setSelectedFields(new Set(savedState.selectedFields || []));
          setGeneratedSql(savedState.generatedSql || '');
          setIncludeSchema(savedState.includeSchema ?? true);
          if (savedState.generatedSql) {
            setShowSqlPanel(true);
          }
          if (savedState.viewport) {
            // The viewport is sometimes not applied correctly on initial load, so we give it a moment.
            setTimeout(() => setViewport(savedState.viewport), 100);
          }
        }
      } catch (e) {
        console.error("Failed to parse ERD state from localStorage", e);
        localStorage.removeItem('erdState');
      }
    }
  }, []); // 空依赖数组确保只在挂载时运行一次

  // 在组件卸载时保存状态到localStorage
  useEffect(() => {
    return () => {
      // 仅当画布上有节点时才保存
      if (nodes.length > 0) {
        const viewport = getViewport();
        const erdState = {
          nodes,
          edges,
          selectedFields: Array.from(selectedFields),
          generatedSql,
          viewport,
          includeSchema,
        };
        localStorage.setItem('erdState', JSON.stringify(erdState));
      } else {
        // 如果画布为空，则清除存储
        localStorage.removeItem('erdState');
      }
    };
  }, [nodes, edges, selectedFields, generatedSql, getViewport]);
  


  const fetchStandard = async () => {
    setLoading(true)
    try {
      const { data } = await api.get(`/api/schematools/erd?schema=${encodeURIComponent(schema)}`)
      setTables(data || [])
    } catch (e: any) {
      console.error(e)
      alert(`拉取失败：${e?.response?.data?.error || e?.message || '未知错误'}`)
    } finally {
      setLoading(false)
    }
  }

  const fetchCustom = async () => {
    setLoading(true)
    try {
      const { data } = await api.post('/api/sql/execute', { sqlText: customSql, readOnly: true })
      const rows: any[] = data?.results?.[0]?.rows || []
      
      // 解析自定义SQL结果
      const tableMap = new Map<string, TableInfo>()
      rows.forEach((row: any) => {
        const schema = row.table_schema || row.tableSchema || row.schema_name || 'public'
        const tableName = row.table_name || row.tableName || row.name
        const columnName = row.column_name || row.columnName || row.field_name || row.name
        const dataType = row.data_type || row.dataType || row.type || 'unknown'
        const isNullable = (row.is_nullable || row.isNullable || row.nullable || 'YES').toString().toUpperCase() === 'YES'
        const length = row.character_maximum_length || row.length || row.max_length

        const fullTableName = `${schema}.${tableName}`
        if (!tableMap.has(fullTableName)) {
          tableMap.set(fullTableName, {
            tableSchema: schema,
            tableName,
            columns: []
          })
        }
        
        const table = tableMap.get(fullTableName)!
        table.columns.push({
          name: columnName,
          dataType,
          isNullable,
          length: length ? parseInt(length) : undefined
        })
      })
      
      setTables(Array.from(tableMap.values()))
    } catch (e: any) {
      console.error(e)
      alert(`拉取失败：${e?.response?.data?.error || e?.message || '未知错误'}`)
    } finally {
      setLoading(false)
    }
  }

  const refresh = () => {
    if (useCustomSql) fetchCustom()
    else fetchStandard()
  }

  const handleFieldToggle = (tableId: string, fieldName: string, selected: boolean) => {
    const fieldKey = `${tableId}-${fieldName}`
    setSelectedFields(prev => {
      const newSet = new Set(prev)
      if (selected) {
        newSet.add(fieldKey)
      } else {
        newSet.delete(fieldKey)
      }
      return newSet
    })
  }

  // 卡片hover事件处理
  const handleCardHover = useCallback((tableId: string) => {
    setHoveredNodeId(tableId)
    // 查找与该表相关的所有边
    const relatedEdges = edgesByTableRef.current.get(tableId) || new Set()
    setHighlightedEdges(relatedEdges)
  }, [])

  const handleCardLeave = useCallback(() => {
    setHoveredNodeId(null)
    setHighlightedEdges(new Set())
  }, [])

  // 构建边-表映射缓存
  useEffect(() => {
    const edgesByTable = new Map<string, Set<string>>()
    
    edges.forEach(edge => {
      const sourceId = edge.source
      const targetId = edge.target
      
      if (!edgesByTable.has(sourceId)) {
        edgesByTable.set(sourceId, new Set())
      }
      edgesByTable.get(sourceId)!.add(edge.id)
      
      if (!edgesByTable.has(targetId)) {
        edgesByTable.set(targetId, new Set())
      }
      edgesByTable.get(targetId)!.add(edge.id)
    })
    
    edgesByTableRef.current = edgesByTable
  }, [edges])

  const removeTableFromCanvas = (tableId: string) => {
    // 移除节点
    setNodes(prev => prev.filter(node => node.id !== tableId))
    
    // 移除相关的边
    setEdges(prev => prev.filter(edge => 
      edge.source !== tableId && edge.target !== tableId
    ))
    
    // 移除相关的选中字段
    setSelectedFields(prev => {
      const newSet = new Set(prev)
      Array.from(prev).forEach(fieldKey => {
        if (fieldKey.startsWith(tableId + '-')) {
          newSet.delete(fieldKey)
        }
      })
      return newSet
    })
  }

  const addTableToCanvas = (table: TableInfo) => {
    const tableId = `${table.tableSchema}.${table.tableName}`
    
    // 检查是否已存在
    if (nodes.find(n => n.id === tableId)) {
      alert('表已在画布中')
      return
    }

    // 计算新节点位置（优化网格布局）
    const existingNodes = nodes.length
    const x = (existingNodes % 3) * 320 + 50
    const y = Math.floor(existingNodes / 3) * 200 + 50

    // 默认选择前3个字段
    const defaultSelectedFields = table.columns.slice(0, 3).map(col => `${tableId}-${col.name}`)
    setSelectedFields(prev => {
      const newSet = new Set(prev)
      defaultSelectedFields.forEach(field => newSet.add(field))
      return newSet
    })

    const newNode: Node<TableNodeData> = {
      id: tableId,
      type: 'table',
      position: { x, y },
      data: {
        table,
        onFieldDragStart: (tableId: string, fieldName: string) => {
          draggedField.current = { tableId, fieldName }
        },
        selectedFields,
        onFieldToggle: handleFieldToggle,
        onRemove: removeTableFromCanvas,
        draggingEdgeActive: !!draggingEdge,
        onStartDragEdge: (tid, fname, side, clientX, clientY) => {
          setDraggingEdge({
            source: { tableId: tid, fieldName: fname, side },
            startClient: { x: clientX, y: clientY },
            currentClient: { x: clientX, y: clientY }
          })
        }

      },
      draggable: true,
      selectable: true,
      dragHandle: '.drag-handle'
    }

    setNodes(prev => [...prev, newNode])
  }

  const onConnect = useCallback((params: Connection) => {
    console.log('=== onConnect 被调用 ===')
    console.log('params:', params)
    
    // 解析连接信息
    const sourceInfo = params.sourceHandle?.split('-')
    const targetInfo = params.targetHandle?.split('-')
    
    console.log('sourceInfo:', sourceInfo)
    console.log('targetInfo:', targetInfo)
    
    if (!sourceInfo || !targetInfo || sourceInfo.length < 3 || targetInfo.length < 3) {
      console.log('信息不完整，跳过')
      return
    }

    const sourceTable = sourceInfo.slice(0, -2).join('-')
    const sourceField = sourceInfo[sourceInfo.length - 2]
    const targetTable = targetInfo.slice(0, -2).join('-')
    const targetField = targetInfo[targetInfo.length - 2]
    
    console.log('解析后:', { sourceTable, sourceField, targetTable, targetField })
   
    const newEdge: Edge = {
      ...params,
    source: params.source || 'default-source',
    target: params.target || 'default-target',
    id: `${params.source || 'default-source'}-${params.target || 'default-target'}-${sourceField}-${targetField}-${Date.now()}`,
    type: 'joinEdge',   
    data: {
        sourceTable,
        sourceField,
        targetTable,
        targetField,
        joinType: 'INNER', // 默认为INNER JOIN
        isHighlighted: false,
        dimmed: false
      }
    }
    
    console.log('创建的边:', newEdge)

    setEdges(prev => {
      console.log('当前边数量:', prev.length)
      const updated = addEdge(newEdge, prev)
      console.log('更新后边数量:', updated.length)
      return updated
    })
  }, [setEdges])

  const generateSql = () => {
    if (nodes.length === 0) {
      alert('请先添加表到画布')
      return
    }

    if (selectedFields.size === 0) {
      alert('请至少选择一个字段')
      return
    }

    // 收集所有选中的字段
    const selectFieldsList: string[] = []
    nodes.forEach(node => {
      const table = node.data.table
      const tableId = `${table.tableSchema}.${table.tableName}`
      
      table.columns.forEach((col: { name: any }) => {
        const fieldKey = `${tableId}-${col.name}`
        if (selectedFields.has(fieldKey)) {
          const fieldRef = includeSchema ? `"${table.tableSchema}"."${table.tableName}"."${col.name}"` : `"${table.tableName}"."${col.name}"`
          selectFieldsList.push(fieldRef)
        }
      })
    })

    if (selectFieldsList.length === 0) {
      alert('请至少选择一个字段')
      return
    }

    // 生成SQL
    const mainTable = nodes[0]
    const mainTableName = mainTable.data.table.tableName
    const mainSchema = mainTable.data.table.tableSchema
    
    const selectFields = selectFieldsList.join(',\n  ')
    const mainTableRef = includeSchema ? `"${mainSchema}"."${mainTableName}"` : `"${mainTableName}"`
    let sql = `SELECT\n  ${selectFields}\nFROM ${mainTableRef}`

    // 添加JOIN - 使用JOIN类型配置映射为SQL关键字
    edges.forEach(edge => {
      const joinType = (edge.data?.joinType || 'INNER') as JoinType
      const joinConfig = JOIN_TYPES[joinType]
      const sourceTable = edge.data?.sourceTable
      const targetTable = edge.data?.targetTable
      const sourceField = edge.data?.sourceField
      const targetField = edge.data?.targetField

      if (sourceTable && targetTable && sourceField && targetField) {
        const sParts = (sourceTable || '').split('.')
        const tParts = (targetTable || '').split('.')
        const sTableRef = includeSchema && sParts.length > 1 
          ? `"${sParts[0]}"."${sParts[1]}"` 
          : `"${sParts[sParts.length - 1]}"`
        const tTableRef = includeSchema && tParts.length > 1 
          ? `"${tParts[0]}"."${tParts[1]}"` 
          : `"${tParts[tParts.length - 1]}"`
        sql += `\n${joinConfig.sqlKeyword} ${tTableRef} ON ${sTableRef}."${sourceField}" = ${tTableRef}."${targetField}"`
      }
    })

    sql += ';'

    // 显示SQL面板
    setGeneratedSql(sql)
    setShowSqlPanel(true)
    setGeneratedSql(sql)
    setShowSqlPanel(true)
  }

  const insertSqlAndReturn = () => {
    // 保存到localStorage并跳转回编辑器
    console.log('ERD: 保存SQL到localStorage:', generatedSql.substring(0, 100) + '...')
    
    // 添加时间戳和唯一标识确保每次都创建新页签
    const timestamp = new Date().toLocaleString()
    const uniqueId = Date.now()
    const sqlWithTimestamp = `-- ERD生成SQL (${timestamp}) [ID:${uniqueId}]
${generatedSql}`
    
    localStorage.setItem('erd_generated_sql', sqlWithTimestamp)
    localStorage.setItem('erd_create_new_tab', 'true')
    localStorage.setItem('erd_timestamp', uniqueId.toString())
    
    console.log('ERD: 设置localStorage完成，准备跳转')
    console.log('ERD: SQL长度:', sqlWithTimestamp.length)
    console.log('ERD: 唯一ID:', uniqueId)
    
    window.location.hash = ''
  }

  // 处理分割条拖拽
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true)
    dragStartY.current = e.clientY
    dragStartHeight.current = sqlPanelHeight
    e.preventDefault()
  }

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return
    
    const deltaY = dragStartY.current - e.clientY
    const newHeight = Math.max(100, Math.min(500, dragStartHeight.current + deltaY))
    setSqlPanelHeight(newHeight)
  }, [isDragging])

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      return () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [isDragging, handleMouseMove, handleMouseUp])

  const clearCanvas = () => {
    setNodes([])
    setEdges([])
    setSelectedFields(new Set())
    setGeneratedSql('')
    setShowSqlPanel(false)
    localStorage.removeItem('erdState')
  }

  // 更新节点数据以包含最新的selectedFields、拖线状态、高亮状态和connectedFields
  useEffect(() => {
    setNodes(prevNodes => 
      prevNodes.map(node => {
        const connectedFields = connectedFieldsByTable.current.get(node.id) || new Set()
        return {
          ...node,
          data: {
            ...node.data,
            selectedFields,
            onFieldToggle: handleFieldToggle,
            onRemove: removeTableFromCanvas,
            draggingEdgeActive: !!draggingEdge,
            onStartDragEdge: (tid: any, fname: any, side: any, clientX: any, clientY: any) => {
              setDraggingEdge({
                source: { tableId: tid, fieldName: fname, side },
                startClient: { x: clientX, y: clientY },
                currentClient: { x: clientX, y: clientY }
              })
            },
            onCardHover: handleCardHover,
            onCardLeave: handleCardLeave,
            isHighlighted: node.id === hoveredNodeId,
            connectedFields
          },
          draggable: true,
          selectable: true,
          dragHandle: '.drag-handle'
        }
      })
    )
  }, [selectedFields, draggingEdge, hoveredNodeId, handleCardHover, handleCardLeave, edges])

  // 更新边数据以包含高亮状态
  useEffect(() => {
    setEdges(prevEdges => 
      prevEdges.map(edge => ({
        ...edge,
        data: {
          ...edge.data,
          isHighlighted: highlightedEdges.has(edge.id),
          dimmed: hoveredNodeId !== null && !highlightedEdges.has(edge.id)
        }
      }))
    )
  }, [highlightedEdges, hoveredNodeId])

  useEffect(() => {
    refresh()
  }, [])

  // Esc 取消连接/拖线；拖线时跟随鼠标移动更新临时线坐标
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDraggingEdge(null)
      }
    }
    const onMouseMove = (e: MouseEvent) => {
      // 直接使用函数式更新，避免闭包问题
      setDraggingEdge(prev => {
        if (!prev) return null
        console.log('鼠标移动 - clientX:', e.clientX, 'clientY:', e.clientY)
        return { ...prev, currentClient: { x: e.clientX, y: e.clientY } }
      })
    }
    const onMouseUp = (e: MouseEvent) => {
      setDraggingEdge(prev => {
        if (!prev) return null
        console.log('=== 鼠标释放事件 ===')
        console.log('释放位置:', e.clientX, e.clientY)
        
        // 在鼠标松开位置命中最近的字段行来完成连接
        const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null
        console.log('命中元素:', el?.className, el?.tagName)
        
        const portEl = el?.closest?.('.field-port') as HTMLElement | null
        console.log('端口元素:', portEl)
        
        if (!portEl) {
          console.log('未找到端口元素，取消连接')
          return null
        }
        
        const targetTableId = portEl.getAttribute('data-table-id') || ''
        const targetFieldName = portEl.getAttribute('data-field-name') || ''
        const targetSide = (portEl.getAttribute('data-side') || 'left') as 'left' | 'right'
        console.log('目标:', { targetTableId, targetFieldName, targetSide })
        
        const source = prev.source
        console.log('源:', source)
        
        if (!targetTableId || !targetFieldName) {
          console.log('目标信息不完整，取消连接')
          return null
        }
        
        if (source.tableId === targetTableId && source.fieldName === targetFieldName && source.side === targetSide) {
          console.log('源和目标相同，取消连接')
          return null
        }
        
        const sourceHandle = `${source.tableId}-${source.fieldName}-${source.side}`
        const targetHandle = `${targetTableId}-${targetFieldName}-${targetSide}`
        const connection: Connection = {
          source: source.tableId,
          sourceHandle,
          target: targetTableId,
          targetHandle
        }
        
        console.log('创建连接:', connection)
        onConnect(connection)
        return null
      })
    }
    
    console.log('事件监听器已绑定')
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      console.log('事件监听器已移除')
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [onConnect]) // 只依赖onConnect，不依赖draggingEdge

  // 拖线时设置鼠标样式并禁用文本选择，结束后恢复；同步字段行样式
  useEffect(() => {
    const el = canvasRef.current
    if (el) {
      el.style.cursor = draggingEdge ? 'crosshair' : 'default'
      el.style.setProperty('cursor', draggingEdge ? 'crosshair' : 'default', 'important')
    }
    document.body.style.setProperty('cursor', draggingEdge ? 'crosshair' : 'default', 'important')
    document.body.style.setProperty('user-select', draggingEdge ? 'none' : 'auto', 'important')

    const rows = document.querySelectorAll('.field-row')
    rows.forEach(row => {
      (row as HTMLElement).style.setProperty('cursor', draggingEdge ? 'crosshair' : 'default', 'important')
    })

    return () => {
      if (el) el.style.setProperty('cursor', 'default', 'important')
      document.body.style.setProperty('cursor', 'default', 'important')
      document.body.style.setProperty('user-select', 'auto', 'important')
      const rows = document.querySelectorAll('.field-row')
      rows.forEach(row => {
        (row as HTMLElement).style.setProperty('cursor', 'default', 'important')
      })
    }
  }, [draggingEdge])



  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <AppBar position="static">
        <Toolbar>
          <Button
            startIcon={<ArrowBackIcon />}
            color="inherit"
            onClick={() => { window.location.hash = '' }}
          >
            返回编辑器
          </Button>
          <Typography variant="h6" sx={{ flex: 1, ml: 2 }}>
            数据表实体关系图 (已更新)
          </Typography>
          <Stack direction="row" spacing={1} alignItems="center">
            <Button
              variant="outlined"
              sx={{ color: '#fff', borderColor: '#fff' }}
              onClick={generateSql}
              disabled={nodes.length === 0}
            >
              生成SQL
            </Button>
            <Button
              variant="outlined"
              sx={{ color: '#fff', borderColor: '#fff' }}
              onClick={clearCanvas}
              disabled={nodes.length === 0}
            >
              清空画布
            </Button>
          </Stack>
        </Toolbar>
      </AppBar>

      <Box sx={{ display: 'flex', height: 'calc(100vh - 64px)' }}>
        {/* 左侧面板 */}
        <Paper sx={{ width: 300, p: 2, height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <Stack spacing={2} sx={{ flex: 1, minHeight: 0 }}>
            <Typography variant="h6">数据源配置</Typography>
            
            <FormControlLabel
              control={
                <Switch
                  checked={useCustomSql}
                  onChange={(e) => setUseCustomSql(e.target.checked)}
                />
              }
              label="使用自定义结构SQL"
            />

            {!useCustomSql ? (
              <TextField
                label="Schema"
                value={schema}
                onChange={(e) => setSchema(e.target.value)}
                size="small"
              />
            ) : (
              <TextField
                label="自定义SQL"
                multiline
                rows={6}
                value={customSql}
                onChange={(e) => setCustomSql(e.target.value)}
                size="small"
              />
            )}

            <Button
              variant="outlined"
              startIcon={<RefreshIcon />}
              onClick={refresh}
              disabled={loading}
            >
              {loading ? <CircularProgress size={20} /> : '刷新'}
            </Button>

            <FormControlLabel
              control={<Switch checked={includeSchema} onChange={(e) => setIncludeSchema(e.target.checked)} />}
              label="包含 schema（限定表名）"
            />

            <Typography variant="h6">可用表 ({tables.filter(t => `${t.tableSchema}.${t.tableName}`.toLowerCase().includes(tableSearch.toLowerCase())).length})</Typography>

            <TextField
              placeholder="搜索表名或Schema"
              size="small"
              value={tableSearch}
              onChange={(e) => setTableSearch(e.target.value)}
            />
            
            {tables.length === 0 && !loading && (
              <Alert severity="info">暂无数据，请先刷新</Alert>
            )}
            {tables.length > 0 && tables.filter(t => `${t.tableSchema}.${t.tableName}`.toLowerCase().includes(tableSearch.toLowerCase())).length === 0 && (
              <Alert severity="info">无匹配，请调整关键字</Alert>
            )}

            <Stack spacing={1} sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
              {tables
                .filter(t => `${t.tableSchema}.${t.tableName}`.toLowerCase().includes(tableSearch.toLowerCase()))
                .map((table, idx) => (
                <Paper
                  key={idx}
                  sx={{
                    p: 1,
                    cursor: 'pointer',
                    '&:hover': { bgcolor: 'grey.100' }
                  }}
                  onClick={() => { addTableToCanvas(table) }}
                >
                  <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                    {table.tableSchema}.{table.tableName}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {table.columns.length} 个字段
                  </Typography>
                </Paper>
              ))}
            </Stack>


          </Stack>
        </Paper>

        {/* 右侧画布区域 */}
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          {/* 画布 */}
          <Box sx={{ 
            flex: 1, 
            position: 'relative',
            height: showSqlPanel ? `calc(100% - ${sqlPanelHeight}px - 4px)` : '100%'
          }} ref={canvasRef}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              fitView
              fitViewOptions={{ maxZoom: 1.2 }}
              attributionPosition="bottom-left"
              zoomOnScroll={true}
              zoomOnPinch={true}
              panOnScroll={false}
              zoomOnDoubleClick={false}
              preventScrolling={true}
              nodesDraggable={true}
              nodesConnectable={true}
              elementsSelectable={true}
              minZoom={0.1}
              maxZoom={3}
              defaultViewport={{ x: 0, y: 0, zoom: 1 }}

            >
              <Controls />
              <Background />
            </ReactFlow>
            
            {/* 临时拖线渲染层：使用 SVG 在画布上绘制当前拖拽线段 */}
            {draggingEdge && (() => {
              try {
                // 获取viewport信息（缩放和平移）
                const viewport = getViewport()
                
                // 将屏幕坐标转换为画布坐标
                const startPos = screenToFlowPosition({
                  x: draggingEdge.startClient.x,
                  y: draggingEdge.startClient.y
                })
                const endPos = screenToFlowPosition({
                  x: draggingEdge.currentClient.x,
                  y: draggingEdge.currentClient.y
                })
                
                // 应用viewport变换，将画布坐标转换为视口坐标
                const sx = startPos.x * viewport.zoom + viewport.x
                const sy = startPos.y * viewport.zoom + viewport.y
                const tx = endPos.x * viewport.zoom + viewport.x
                const ty = endPos.y * viewport.zoom + viewport.y
                
                const mx = (sx + tx) / 2
                const path = `M ${sx} ${sy} C ${mx} ${sy}, ${mx} ${ty}, ${tx} ${ty}`
                
                return (
                  <svg 
                    style={{ 
                      position: 'absolute', 
                      inset: 0, 
                      pointerEvents: 'none',
                      width: '100%',
                      height: '100%',
                      zIndex: 1000,
                      overflow: 'visible'
                    }}
                  >
                    <path 
                      d={path} 
                      stroke="#2196f3" 
                      strokeWidth="3" 
                      fill="none"
                      strokeDasharray="5,5"
                      opacity="0.8"
                    />
                    {/* 调试：在终点画一个红色圆圈 */}
                    <circle 
                      cx={tx} 
                      cy={ty} 
                      r="8" 
                      fill="red" 
                      opacity="0.7"
                    />
                  </svg>
                )
              } catch (e) {
                console.error('Error rendering drag edge:', e)
                return null
              }
            })()}
            
            {nodes.length === 0 && (
              <Box
                sx={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  textAlign: 'center',
                  color: 'text.secondary'
                }}
              >
                <Typography variant="h6">点击左侧表名添加到画布</Typography>
                <Typography variant="body2">
                  将鼠标移到字段行上，两端会出现“十字圆端口”。按住其中一个端口拖到其它字段的端口即可建立连接。
                </Typography>
              </Box>
            )}
          </Box>



          {/* 可拖拽分割条 */}
          {showSqlPanel && (
            <Box
              sx={{
                height: 4,
                bgcolor: 'divider',
                cursor: 'row-resize',
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                '&:hover': { 
                  bgcolor: 'primary.main',
                  '& .drag-indicator': {
                    opacity: 1
                  }
                },
                transition: 'background-color 0.2s'
              }}
              onMouseDown={handleMouseDown}
            >
              <Box
                className="drag-indicator"
                sx={{
                  position: 'absolute',
                  top: '100%',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  bgcolor: 'primary.main',
                  color: 'white',
                  borderRadius: '0 0 4px 4px',
                  px: 1.5,
                  py: 0.5,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.5,
                  fontSize: '11px',
                  fontWeight: 600,
                  opacity: 0.7,
                  transition: 'opacity 0.2s ease',
                  pointerEvents: 'none',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                  zIndex: 1,
                  mt: 0
                }}
              >
                <DragIndicatorIcon sx={{ fontSize: '14px' }} />
                拖动调整高度
              </Box>
            </Box>
          )}

          {/* SQL 显示面板 */}
          {showSqlPanel && (
            <Paper 
              sx={{ 
                height: sqlPanelHeight,
                display: 'flex',
                flexDirection: 'column',
                borderRadius: 0,
                borderTop: '1px solid',
                borderColor: 'divider'
              }}
            >
              <Box sx={{ p: 2, borderBottom: '1px solid #eee', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>生成的SQL</Typography>
                <Stack direction="row" spacing={1}>
                  <Button 
                    size="small" 
                    onClick={() => navigator.clipboard.writeText(generatedSql)}
                    disabled={!generatedSql}
                  >
                    复制
                  </Button>
                  <Button 
                    size="small" 
                    variant="contained" 
                    startIcon={<SendIcon />} 
                    onClick={insertSqlAndReturn}
                    disabled={!generatedSql}
                  >
                    插入编辑器并返回
                  </Button>
                </Stack>
              </Box>
              <Box sx={{ flex: 1, p: 2, overflow: 'auto', bgcolor: '#f5f5f5', fontFamily: 'monospace', fontSize: '13px' }}>
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                  {generatedSql}
                </pre>
              </Box>
            </Paper>
          )}
        </Box>
      </Box>
    </Box>
  );
}

// ReactFlowProvider HOC
function ErdPage() {
  return (
    <ReactFlowProvider>
      <ErdNewInner />
    </ReactFlowProvider>
  )
}

export default ErdPage;
