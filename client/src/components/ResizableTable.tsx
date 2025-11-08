import { useRef, useState, useEffect } from 'react'
import { Box, Typography, Menu, MenuItem } from '@mui/material'

interface ResizableTableProps {
  data: any[]
}

export default function ResizableTable({ data }: ResizableTableProps) {
  const tableRef = useRef<HTMLDivElement>(null)
  const [columns, setColumns] = useState<string[]>([])
  const [columnWidths, setColumnWidths] = useState<{ [key: string]: number }>({})
  const [resizingColumn, setResizingColumn] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<{
    mouseX: number
    mouseY: number
    column: string | null
  } | null>(null)
  const resizeStartX = useRef(0)
  const resizeStartWidth = useRef(0)
  const measureElementRef = useRef<HTMLSpanElement | null>(null)

  useEffect(() => {
    if (data && data.length > 0) {
      const cols = Object.keys(data[0])
      setColumns(cols)
      
      // 从localStorage加载保存的列宽
      const savedWidths = localStorage.getItem('table_column_widths')
      if (savedWidths) {
        try {
          setColumnWidths(JSON.parse(savedWidths))
        } catch (e) {
          // 初始化默认宽度
          const defaultWidths: { [key: string]: number } = {}
          cols.forEach(col => {
            defaultWidths[col] = 150
          })
          setColumnWidths(defaultWidths)
        }
      } else {
        const defaultWidths: { [key: string]: number } = {}
        cols.forEach(col => {
          defaultWidths[col] = 150
        })
        setColumnWidths(defaultWidths)
      }
    }
  }, [data])

  const handleMouseDown = (e: React.MouseEvent, column: string) => {
    e.preventDefault()
    setResizingColumn(column)
    resizeStartX.current = e.clientX
    resizeStartWidth.current = columnWidths[column] || 150
  }

  const handleContextMenu = (e: React.MouseEvent, column: string) => {
    e.preventDefault()
    setContextMenu({
      mouseX: e.clientX,
      mouseY: e.clientY,
      column: column
    })
  }

  const handleCloseContextMenu = () => {
    setContextMenu(null)
  }

  // 测量文本宽度
  const measureTextWidth = (text: string, font: string): number => {
    if (!measureElementRef.current) {
      measureElementRef.current = document.createElement('span')
      measureElementRef.current.style.position = 'absolute'
      measureElementRef.current.style.visibility = 'hidden'
      measureElementRef.current.style.whiteSpace = 'nowrap'
      document.body.appendChild(measureElementRef.current)
    }

    const element = measureElementRef.current
    element.style.font = font
    element.textContent = text
    const width = element.getBoundingClientRect().width
    return width
  }

  // 组件卸载时清理测量元素
  useEffect(() => {
    return () => {
      if (measureElementRef.current && measureElementRef.current.parentNode) {
        measureElementRef.current.parentNode.removeChild(measureElementRef.current)
      }
    }
  }, [])

  // 计算最佳列宽
  const calculateOptimalWidth = (column: string): number => {
    const font = '600 0.875rem Roboto, sans-serif' // 表头字体
    const dataFont = '0.875rem Roboto, sans-serif' // 数据字体

    // 测量表头文本宽度
    let maxWidth = measureTextWidth(column, font)

    // 测量数据列（最多前100行）
    const sampleSize = Math.min(data.length, 100)
    for (let i = 0; i < sampleSize; i++) {
      const value = String(data[i][column] ?? '')
      const width = measureTextWidth(value, dataFont)
      maxWidth = Math.max(maxWidth, width)
    }

    // 加上内边距和边框
    const padding = 24 // 12px * 2
    const border = 2 // 1px * 2
    const totalWidth = maxWidth + padding + border

    // 应用最小和最大宽度限制
    const minWidth = 80
    const maxWidthLimit = 500
    return Math.min(Math.max(totalWidth, minWidth), maxWidthLimit)
  }

  // 自动适应单列宽度
  const handleAutoFitColumn = (column: string) => {
    const optimalWidth = calculateOptimalWidth(column)
    const newWidths = {
      ...columnWidths,
      [column]: optimalWidth
    }
    setColumnWidths(newWidths)
    localStorage.setItem('table_column_widths', JSON.stringify(newWidths))
    handleCloseContextMenu()
  }

  // 自动适应所有列宽度
  const handleAutoFitAllColumns = () => {
    const newWidths: { [key: string]: number } = {}
    columns.forEach(col => {
      newWidths[col] = calculateOptimalWidth(col)
    })
    setColumnWidths(newWidths)
    localStorage.setItem('table_column_widths', JSON.stringify(newWidths))
    handleCloseContextMenu()
  }

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!resizingColumn) return
      
      const delta = e.clientX - resizeStartX.current
      const newWidth = Math.max(50, resizeStartWidth.current + delta)
      
      setColumnWidths(prev => ({
        ...prev,
        [resizingColumn]: newWidth
      }))
    }

    const handleMouseUp = () => {
      if (resizingColumn) {
        // 保存到localStorage
        localStorage.setItem('table_column_widths', JSON.stringify(columnWidths))
        setResizingColumn(null)
      }
    }

    if (resizingColumn) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [resizingColumn, columnWidths])

  if (!data || data.length === 0) {
    return null
  }

  // 计算表格总宽度
  const tableMinWidth = columns.reduce((sum, col) => sum + (columnWidths[col] || 150), 0)

  return (
    <Box 
      ref={tableRef}
      sx={{ 
        width: '100%', 
        height: '100%',
        overflow: 'auto',
        border: '1px solid #ddd',
        userSelect: 'text'
      }}
    >
      <Box 
        component="table" 
        sx={{ 
          borderCollapse: 'collapse',
          fontSize: '0.875rem',
          minWidth: `${tableMinWidth}px`,
          tableLayout: 'auto'
        }}
      >
        <thead>
          <tr>
            {columns.map((col) => (
              <th 
                key={col}
                onContextMenu={(e) => handleContextMenu(e, col)}
                style={{
                  position: 'sticky',
                  top: 0,
                  textAlign: 'left',
                  border: '1px solid #e0e0e0',
                  borderBottom: '2px solid #999',
                  padding: '8px 12px',
                  backgroundColor: '#f5f5f5',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  width: `${columnWidths[col] || 150}px`,
                  minWidth: '50px',
                  boxSizing: 'border-box'
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{col}</span>
                  <Box
                    onMouseDown={(e) => handleMouseDown(e, col)}
                    sx={{
                      position: 'absolute',
                      right: 0,
                      top: 0,
                      bottom: 0,
                      width: '8px',
                      cursor: 'col-resize',
                      backgroundColor: resizingColumn === col ? '#1976d2' : 'transparent',
                      '&:hover': {
                        backgroundColor: '#1976d2',
                        opacity: 0.5
                      },
                      zIndex: 10
                    }}
                  />
                </Box>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row: any, i: number) => (
            <tr 
              key={i}
              style={{
                backgroundColor: i % 2 === 0 ? '#fff' : '#fafafa'
              }}
            >
              {columns.map((col) => (
                <td 
                  key={col}
                  style={{
                    border: '1px solid #e0e0e0',
                    padding: '6px 12px',
                    verticalAlign: 'top',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    width: `${columnWidths[col] || 150}px`,
                    maxWidth: `${columnWidths[col] || 150}px`,
                    wordBreak: 'break-word'
                  }}
                >
                  {String(row[col] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </Box>
      <style>
        {`
          tbody tr:hover {
            background-color: #f0f0f0 !important;
          }
        `}
      </style>

      {/* 右键菜单 */}
      <Menu
        open={contextMenu !== null}
        onClose={handleCloseContextMenu}
        anchorReference="anchorPosition"
        anchorPosition={
          contextMenu !== null
            ? { top: contextMenu.mouseY, left: contextMenu.mouseX }
            : undefined
        }
      >
        <MenuItem onClick={() => contextMenu?.column && handleAutoFitColumn(contextMenu.column)}>
          Auto fit this column
        </MenuItem>
        <MenuItem onClick={handleAutoFitAllColumns}>
          Auto fit all columns
        </MenuItem>
      </Menu>
    </Box>
  )
}
