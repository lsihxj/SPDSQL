// API响应类型定义

/**
 * 单个查询结果
 */
export interface QueryResult {
  sql: string
  success: boolean
  rows?: Array<Record<string, any>>
  affectedRows?: number
  duration?: string
  error?: string
  index: number
}

/**
 * 多查询执行响应
 */
export interface MultiExecuteResponse {
  success: boolean
  results: QueryResult[]
  totalDuration?: string
}

/**
 * 执行请求
 */
export interface ExecuteRequest {
  sqlText: string
  runSelectedOnly: boolean
  selectedText?: string
  readOnly: boolean
  maxRows: number
  timeoutSeconds: number
  useTransaction: boolean
}
