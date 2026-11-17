import { MODULE_BY_KEY } from '@/data/modules'
import { allRows, listRows, resetRows, saveRows } from '@/data/local-store'
import { allReports, checkReportConnection } from '@/data/quality-store'
import type { ActionResult, EntryRow, ModuleMeta, OverviewResult, PageResult } from '@/data/types'

// 会写进数据的「往回走」动作：命中就把这条记录标成异常态，看板上能一眼看出来。
const NEGATIVE_ACTIONS = ['撤销', '作废', '拒绝', '驳回', '停用', '忽略', '下线', '回滚']

export function moduleMeta(key: string): ModuleMeta {
  const meta = MODULE_BY_KEY.get(key)
  if (!meta) {
    throw new Error(`没有登记名为 ${key} 的业务模块`)
  }
  return meta
}

export function filterRows(rows: EntryRow[], filters: Record<string, string>): EntryRow[] {
  const pairs = Object.entries(filters).filter(([, value]) => value.trim() !== '')
  if (pairs.length === 0) {
    return rows
  }
  return rows.filter((row) =>
    pairs.every(([field, value]) => String(row[field] ?? '').includes(value.trim())),
  )
}

/** 断开连接只对已连接的接入配置有意义，避免草稿配置被直接断开。 */
const ACTION_PRECONDITIONS: Record<string, Record<string, string[]>> = {
  source: { 断开连接: ['已连接'] },
}

export function listEntries(key: string, filters: Record<string, string> = {}): PageResult {
  const matched = filterRows(listRows(key), filters)
  return { items: matched, total: matched.length, page: 1, size: matched.length }
}

export function runAction(key: string, id: number, action: string): ActionResult {
  const meta = moduleMeta(key)
  const target = meta.actionTargets[action]
  if (!target) {
    return { ok: false, message: `${meta.entity}没有登记「${action}」这个动作` }
  }
  const rows = listRows(key)
  const index = rows.findIndex((row) => Number(row.id) === id)
  if (index < 0) {
    return { ok: false, message: `没有找到编号为 ${id} 的${meta.entity}` }
  }
  const current = String(rows[index].status)
  if (current === target) {
    return { ok: false, message: `${meta.entity}已经是「${target}」，不用重复操作` }
  }
  const allowed = ACTION_PRECONDITIONS[key]?.[action]
  if (allowed && !allowed.includes(current)) {
    return { ok: false, message: `${meta.entity}当前是「${current}」，不能执行「${action}」` }
  }
  const lastStatus = meta.statuses[meta.statuses.length - 1]
  const updated: EntryRow = {
    ...rows[index],
    status: target,
    pending: target !== lastStatus,
    abnormal: NEGATIVE_ACTIONS.some((verb) => action.startsWith(verb)),
  }
  const next = [...rows]
  next[index] = updated
  saveRows(key, next)
  return { ok: true, message: `${meta.entity}已${action}，当前状态「${target}」` }
}

export function resetModule(key: string): PageResult {
  resetRows(key)
  return listEntries(key)
}

function csvCell(value: unknown): string {
  const text = String(value ?? '')
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function qualityColumns(key: string): string[] {
  return key === 'source' ? ['连接状态', '报告版本', '报告状态', '冲突字段数', '最高空值率'] : []
}

function qualityCells(key: string, row: EntryRow): string[] {
  if (key !== 'source') {
    return []
  }
  const report = allReports()[String(row.id)]
  if (!report) {
    return ['无报告', '—', '—', '—', '—']
  }
  const connection = checkReportConnection(report)
  return [
    connection.ok ? '已连接' : `不可用（${connection.currentStatus}）`,
    `v${report.version}`,
    report.status,
    String(report.conflictFieldCount),
    report.maxNullRateText,
  ]
}

/** 导出明细跟着列表的筛选条件走：页面上看到哪些行，文件里就是哪些行。 */
export function exportEntries(
  key: string,
  filters: Record<string, string> = {},
): { filename: string; content: string } {
  const meta = moduleMeta(key)
  const rows = filterRows(listRows(key), filters)
  const extra = qualityColumns(key)
  const header = ['编号', ...meta.fields, '当前状态', ...extra]
  const lines = [header.map(csvCell).join(',')]
  for (const row of rows) {
    lines.push(
      [row.id, ...meta.fields.map((field) => row[field] ?? ''), row.status, ...qualityCells(key, row)]
        .map(csvCell)
        .join(','),
    )
  }
  if (key === 'source' && rows.length > 0) {
    // 字段质量报告随文件保留：每行接入配置后面附上逐字段结论和样本依据。
    lines.push('')
    lines.push('字段质量报告明细')
    lines.push(['源标识', '源表', '字段', '声明类型', '样本类型分布', '空值率', '类型冲突', '判定说明', '样本来源'].map(csvCell).join(','))
    for (const row of rows) {
      const report = allReports()[String(row.id)]
      if (!report || report.fields.length === 0) {
        lines.push([String(row["配置编号"] ?? ''), report?.sourceTable ?? '', '—', '—', '—', '—', report ? '失败' : '无报告', report?.failureReason ?? '尚未生成字段质量报告', '—'].map(csvCell).join(','))
        continue
      }
      for (const field of report.fields) {
        lines.push([
          report.sourceCode,
          report.sourceTable,
          field.field,
          field.declaredType,
          field.typeDistribution,
          field.nullRateText,
          field.typeConflict ? '是' : '否',
          field.conflictReason,
          field.sampleSource,
        ].map(csvCell).join(','))
      }
    }
  }
  return { filename: `${meta.name}-清单.csv`, content: `\uFEFF${lines.join('\n')}` }
}

export function downloadEntries(key: string, filters: Record<string, string> = {}): void {
  const { filename, content } = exportEntries(key, filters)
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

export function loadOverview(): OverviewResult {
  const rows = allRows()
  const modules = [...MODULE_BY_KEY.values()].map((meta) => {
    const entries = rows[meta.key] ?? []
    return {
      name: meta.name,
      created: entries.length,
      pending: entries.filter((row) => row.pending).length,
      abnormal: entries.filter((row) => row.abnormal).length,
    }
  })
  const cards = [
    { label: '业务模块', value: modules.length },
    { label: '登记总量', value: modules.reduce((sum, item) => sum + item.created, 0) },
    { label: '待处理', value: modules.reduce((sum, item) => sum + item.pending, 0) },
    { label: '异常量', value: modules.reduce((sum, item) => sum + item.abnormal, 0) },
  ]
  return { cards, modules }
}
