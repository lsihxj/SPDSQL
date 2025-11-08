using System.Text;

namespace SPDSQL.Server.Services;

/// <summary>
/// SQL解析器，用于将多条SQL语句按分号分割，同时处理字符串、注释等特殊上下文
/// </summary>
public class SqlParser
{
    private enum ParseState
    {
        Normal,
        InSingleQuote,
        InDoubleQuote,
        InLineComment,
        InBlockComment,
        InDollarQuote
    }

    /// <summary>
    /// 解析SQL文本，返回独立的SQL语句列表
    /// </summary>
    public static List<string> ParseStatements(string sqlText)
    {
        if (string.IsNullOrWhiteSpace(sqlText))
        {
            return new List<string>();
        }

        var statements = new List<string>();
        var currentStatement = new StringBuilder();
        var state = ParseState.Normal;
        var dollarTag = string.Empty;

        for (int i = 0; i < sqlText.Length; i++)
        {
            char c = sqlText[i];
            char? next = i + 1 < sqlText.Length ? sqlText[i + 1] : null;

            switch (state)
            {
                case ParseState.Normal:
                    if (c == '\'' && !IsEscaped(sqlText, i))
                    {
                        state = ParseState.InSingleQuote;
                        currentStatement.Append(c);
                    }
                    else if (c == '"' && !IsEscaped(sqlText, i))
                    {
                        state = ParseState.InDoubleQuote;
                        currentStatement.Append(c);
                    }
                    else if (c == '-' && next == '-')
                    {
                        state = ParseState.InLineComment;
                        currentStatement.Append(c);
                    }
                    else if (c == '/' && next == '*')
                    {
                        state = ParseState.InBlockComment;
                        currentStatement.Append(c);
                    }
                    else if (c == '$')
                    {
                        // 检测dollar-quoted字符串（如 $$ 或 $tag$）
                        var tag = ExtractDollarTag(sqlText, i);
                        if (!string.IsNullOrEmpty(tag))
                        {
                            state = ParseState.InDollarQuote;
                            dollarTag = tag;
                            currentStatement.Append(tag);
                            i += tag.Length - 1; // 跳过标签部分
                        }
                        else
                        {
                            currentStatement.Append(c);
                        }
                    }
                    else if (c == ';')
                    {
                        // 遇到分号，结束当前语句
                        var stmt = currentStatement.ToString().Trim();
                        if (!string.IsNullOrWhiteSpace(stmt) && !IsOnlyComment(stmt))
                        {
                            statements.Add(stmt);
                        }
                        currentStatement.Clear();
                    }
                    else
                    {
                        currentStatement.Append(c);
                    }
                    break;

                case ParseState.InSingleQuote:
                    currentStatement.Append(c);
                    if (c == '\'' && !IsEscaped(sqlText, i))
                    {
                        // 检查是否是转义的单引号（PostgreSQL中''表示单引号）
                        if (next == '\'')
                        {
                            currentStatement.Append(next.Value);
                            i++; // 跳过下一个引号
                        }
                        else
                        {
                            state = ParseState.Normal;
                        }
                    }
                    break;

                case ParseState.InDoubleQuote:
                    currentStatement.Append(c);
                    if (c == '"' && !IsEscaped(sqlText, i))
                    {
                        state = ParseState.Normal;
                    }
                    break;

                case ParseState.InLineComment:
                    currentStatement.Append(c);
                    if (c == '\n')
                    {
                        state = ParseState.Normal;
                    }
                    break;

                case ParseState.InBlockComment:
                    currentStatement.Append(c);
                    if (c == '*' && next == '/')
                    {
                        currentStatement.Append(next.Value);
                        i++; // 跳过'/'
                        state = ParseState.Normal;
                    }
                    break;

                case ParseState.InDollarQuote:
                    currentStatement.Append(c);
                    // 检查是否遇到结束标签
                    if (c == '$')
                    {
                        var endTag = ExtractDollarTag(sqlText, i);
                        if (endTag == dollarTag)
                        {
                            currentStatement.Append(endTag.Substring(1)); // 已经添加了第一个$
                            i += endTag.Length - 1;
                            state = ParseState.Normal;
                            dollarTag = string.Empty;
                        }
                    }
                    break;
            }
        }

        // 处理最后一条语句（没有分号结尾的情况）
        var lastStmt = currentStatement.ToString().Trim();
        if (!string.IsNullOrWhiteSpace(lastStmt) && !IsOnlyComment(lastStmt))
        {
            statements.Add(lastStmt);
        }

        return statements;
    }

    /// <summary>
    /// 检查字符是否被转义
    /// </summary>
    private static bool IsEscaped(string text, int index)
    {
        if (index == 0) return false;
        return text[index - 1] == '\\';
    }

    /// <summary>
    /// 提取dollar-quoted字符串的标签（如 $$ 或 $tag$）
    /// </summary>
    private static string ExtractDollarTag(string text, int startIndex)
    {
        if (startIndex >= text.Length || text[startIndex] != '$')
            return string.Empty;

        var sb = new StringBuilder();
        sb.Append('$');

        int i = startIndex + 1;
        while (i < text.Length)
        {
            char c = text[i];
            if (c == '$')
            {
                sb.Append(c);
                return sb.ToString();
            }
            else if (char.IsLetterOrDigit(c) || c == '_')
            {
                sb.Append(c);
                i++;
            }
            else
            {
                // 无效的dollar tag
                return string.Empty;
            }
        }

        return string.Empty;
    }

    /// <summary>
    /// 判断语句是否只包含注释和空白
    /// </summary>
    private static bool IsOnlyComment(string stmt)
    {
        var trimmed = stmt.Trim();
        if (string.IsNullOrWhiteSpace(trimmed))
            return true;

        // 移除所有注释后检查是否还有内容
        var withoutComments = RemoveComments(trimmed);
        return string.IsNullOrWhiteSpace(withoutComments);
    }

    /// <summary>
    /// 移除SQL中的注释
    /// </summary>
    private static string RemoveComments(string sql)
    {
        var result = new StringBuilder();
        var state = ParseState.Normal;

        for (int i = 0; i < sql.Length; i++)
        {
            char c = sql[i];
            char? next = i + 1 < sql.Length ? sql[i + 1] : null;

            switch (state)
            {
                case ParseState.Normal:
                    if (c == '-' && next == '-')
                    {
                        state = ParseState.InLineComment;
                    }
                    else if (c == '/' && next == '*')
                    {
                        state = ParseState.InBlockComment;
                    }
                    else
                    {
                        result.Append(c);
                    }
                    break;

                case ParseState.InLineComment:
                    if (c == '\n')
                    {
                        state = ParseState.Normal;
                        result.Append(c);
                    }
                    break;

                case ParseState.InBlockComment:
                    if (c == '*' && next == '/')
                    {
                        i++; // 跳过'/'
                        state = ParseState.Normal;
                    }
                    break;
            }
        }

        return result.ToString();
    }
}
