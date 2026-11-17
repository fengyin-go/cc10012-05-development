import { listRows } from './local-store'
import type { QualityConnectionCheck, QualityReport } from './types'

// 字段质量报告单独存一份 localStorage：与接入配置列表分开，刷新、切换页面都还在。
// 报告是「一份一份」保存的，同一接入配置只保留最新版本，不会越点越多。
const QUALITY_STORAGE_KEY = 'data-explore-studio:quality-reports'

export type QualityReportBook = Record<string, QualityReport>

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function readStorage(): QualityReportBook {
  if (typeof window === 'undefined' || !window.localStorage) {
    return {}
  }
  const raw = window.localStorage.getItem(QUALITY_STORAGE_KEY)
  if (!raw) {
    return {}
  }
  try {
    const parsed = JSON.parse(raw) as QualityReportBook
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {}
    }
    return parsed
  } catch {
    return {}
  }
}

let cache: QualityReportBook | null = null

export function allReports(): QualityReportBook {
  if (cache === null) {
    cache = readStorage()
  }
  return cache
}

export function reportForSource(sourceId: number): QualityReport | null {
  return allReports()[String(sourceId)] ?? null
}

/** 同一接入配置连续提交时覆盖旧版本，返回给页面的就是最终留下的那一份。 */
export function saveReport(report: QualityReport): void {
  const next = { ...allReports(), [String(report.sourceId)]: clone(report) }
  cache = next
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(QUALITY_STORAGE_KEY, JSON.stringify(next))
  }
}

export function dropReport(sourceId: number): void {
  const next = { ...allReports() }
  delete next[String(sourceId)]
  cache = next
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(QUALITY_STORAGE_KEY, JSON.stringify(next))
  }
}

export function clearReports(): void {
  cache = {}
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.removeItem(QUALITY_STORAGE_KEY)
  }
}

/**
 * 报告里的接入配置快照要与当前列表重新核对：配置改了或断开，报告就不能算数。
 * 报告本身保留（字段、空值率、样本依据都还在），只是不能再被数据集管理引用。
 */
export function checkReportConnection(report: QualityReport): QualityConnectionCheck {
  const row = listRows('source').find((item) => Number(item.id) === Number(report.sourceId))
  const checkedAt = new Date().toISOString()
  if (!row) {
    return {
      ok: false,
      checkedAt,
      message: '接入配置已不存在，字段质量报告无法核对连接',
      currentStatus: '缺失',
    }
  }
  if (String(row.status) !== '已连接') {
    return {
      ok: false,
      checkedAt,
      message: `接入配置当前状态「${String(row.status)}」，不是已连接，字段质量报告不能作为依据`,
      currentStatus: String(row.status),
    }
  }
  const snapshot = report.configSnapshot ?? row
  const drift: string[] = []
  for (const field of ['配置编号', '连接类型', '接入地址']) {
    if (String(snapshot[field] ?? '') !== String(row[field] ?? '')) {
      drift.push(field)
    }
  }
  if (drift.length > 0) {
    return {
      ok: false,
      checkedAt,
      message: `接入配置的${drift.join('、')}在出报告后改过，请重新提交校验`,
      currentStatus: String(row.status),
    }
  }
  return {
    ok: true,
    checkedAt,
    message: `连接配置 ${String(row["配置编号"])} 状态「已连接」，与报告快照一致`,
    currentStatus: String(row.status),
  }
}

export { QUALITY_STORAGE_KEY }
