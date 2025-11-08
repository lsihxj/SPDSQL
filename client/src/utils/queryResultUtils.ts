import { QueryResult } from '@/types/api'

/**
 * 生成查询结果页签标题
 */
export function generateTabTitle(result: QueryResult): string {
  const { sql, success, affectedRows, error, index } = result

  if (!success && error) {
    const errorPreview = error.length > 20 ? error.substring(0, 20) + '...' : error
    return `错误 ${index}: ${errorPreview}`
  }

  // 提取SQL类型
  const sqlType = getSqlType(sql)

  switch (sqlType) {
    case 'SELECT':
    case 'WITH':
    case 'SHOW':
    case 'EXPLAIN':
      const preview = getSqlPreview(sql, 30)
      return `查询 ${index}: ${preview}`
    
    case 'INSERT':
      return `插入 ${index}: ${affectedRows || 0}行`
    
    case 'UPDATE':
      return `更新 ${index}: ${affectedRows || 0}行`
    
    case 'DELETE':
      return `删除 ${index}: ${affectedRows || 0}行`
    
    case 'CREATE':
    case 'DROP':
    case 'ALTER':
    case 'TRUNCATE':
      return `${sqlType} ${index}`
    
    default:
      return `语句 ${index}`
  }
}

/**
 * 获取SQL语句类型
 */
function getSqlType(sql: string): string {
  const trimmed = sql.trim().toUpperCase()
  
  // 跳过注释
  let cleaned = trimmed
  while (cleaned.startsWith('--')) {
    const lineEnd = cleaned.indexOf('\n')
    cleaned = lineEnd >= 0 ? cleaned.substring(lineEnd + 1).trim() : ''
  }
  while (cleaned.startsWith('/*')) {
    const commentEnd = cleaned.indexOf('*/')
    cleaned = commentEnd >= 0 ? cleaned.substring(commentEnd + 2).trim() : ''
  }
  
  const firstWord = cleaned.split(/[\s\n\r\t]+/)[0] || ''
  return firstWord
}

/**
 * 获取SQL预览文本（用于页签标题）
 */
function getSqlPreview(sql: string, maxLength: number): string {
  // 移除注释和多余空白
  let cleaned = sql.trim()
  
  // 移除行注释
  cleaned = cleaned.replace(/--[^\n]*/g, '')
  
  // 移除块注释
  cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, '')
  
  // 压缩空白
  cleaned = cleaned.replace(/\s+/g, ' ').trim()
  
  if (cleaned.length <= maxLength) {
    return cleaned
  }
  
  return cleaned.substring(0, maxLength) + '...'
}

/**
 * 获取查询结果的图标
 */
export function getResultIcon(result: QueryResult): string {
  if (!result.success) {
    return '❌'
  }
  
  const sqlType = getSqlType(result.sql)
  
  switch (sqlType) {
    case 'SELECT':
    case 'WITH':
    case 'SHOW':
    case 'EXPLAIN':
      return '📊'
    case 'INSERT':
      return '➕'
    case 'UPDATE':
      return '✏️'
    case 'DELETE':
      return '🗑️'
    default:
      return '✅'
  }
}
