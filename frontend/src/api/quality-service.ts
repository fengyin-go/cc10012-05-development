import { sampleForSource } from '@/data/source-samples'
import { allReports, checkReportConnection, saveReport } from '@/data/quality-store'
import { listRows } from '@/data/local-store'
import type {
  EntryRow,
  FieldQualityEntry,
  FieldQualityProfileRow,
  FieldTypeCount,
  ObservedType,
  QualityProfileMode,
  QualityReport,
  QualityReportStatus,
  QualityReportView,
  QualitySubmitResult,
  SampleCell,
  SourceSample,
} from '@/data/types'

// 字段校验：只对样本里实际出现的值下结论，样本来源逐字段记下来，
// 报告里既能按源核对，也能按字段名横向比较；跨源同名不等于同一个字段。

const TYPE_ORDER: Exclude<ObservedType, '空值'>[] = ['数值', '文本', '时间', '布尔']

const NUMERIC_PATTERN = /^-?\d+(\.\d+)?$/
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2})?)?$/
const BOOLEAN_PATTERN = /^(true|false)$/i

function isBlank(value: SampleCell): boolean {
  return value === null || value === undefined || String(value).trim() === ''
}

function classifyCell(value: SampleCell): ObservedType {
  if (isBlank(value)) {
    return '空值'
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? '数值' : '文本'
  }
  if (typeof value === 'boolean') {
    return '布尔'
  }
  const text = String(value).trim()
  if (NUMERIC_PATTERN.test(text)) {
    return '数值'
  }
  if (BOOLEAN_PATTERN.test(text)) {
    return '布尔'
  }
  if (DATE_PATTERN.test(text)) {
    return '时间'
  }
  return '文本'
}

function percent(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`
}

function declaredKind(declaredType: string): ObservedType {
  const lower = declaredType.toLowerCase()
  if (/int|numeric|decimal|real|double|float|money|serial/.test(lower)) {
    return '数值'
  }
  if (/bool/.test(lower)) {
    return '布尔'
  }
  if (/date|time|stamp/.test(lower)) {
    return '时间'
  }
  return '文本'
}

/**
 * 冲突判定有两条路线，按声明类型选：
 * - 声明为数值/布尔/时间：以声明类型为锚，样本里出现别的非空类型即为冲突；
 * - 声明为文本/未声明：以样本里的主导类型为锚，出现另一种可解释的类型即为冲突。
 * 两条路线都只看本源的样本，不跨源合并，因为同名文本与同名数值可以各自成立。
 */
function judgeConflict(
  declaredType: string,
  observedTypes: FieldTypeCount[],
  totalRows: number,
): { conflict: boolean; route: string; reason: string } {
  const meaningful = observedTypes.filter((item) => item.count > 0)
  if (meaningful.length === 0) {
    return { conflict: false, route: '无有效样本', reason: '样本全部为空，不下类型冲突结论' }
  }
  const declared = declaredKind(declaredType)
  const dominant = meaningful.reduce((best, item) => (item.count > best.count ? item : best))
  if (declared !== '文本') {
    const offType = meaningful.filter((item) => item.type !== declared)
    if (offType.length > 0) {
      const detail = offType.map((item) => `${item.type}${item.count}条`).join('、')
      return {
        conflict: true,
        route: '按声明类型核对',
        reason: `声明类型 ${declaredType} 属${declared}，样本里出现${detail}`,
      }
    }
    return {
      conflict: false,
      route: '按声明类型核对',
      reason: `样本非空值均为${declared}，与声明类型 ${declaredType} 一致`,
    }
  }
  if (meaningful.length > 1) {
    const detail = meaningful.map((item) => `${item.type}${item.count}条`).join('、')
    return {
      conflict: true,
      route: '按样本主导类型核对',
      reason: `声明类型为文本，样本主导类型${dominant.type}但混有${detail}`,
    }
  }
  const only = meaningful[0].type
  if (only === '文本') {
    return {
      conflict: false,
      route: '按样本主导类型核对',
      reason: '声明类型为文本，样本也全部按文本解释',
    }
  }
  return {
    conflict: false,
    route: '按样本主导类型核对',
    reason: `声明类型为文本，样本全部是${only}，按${only}解释；${totalRows} 行样本一致`,
  }
}

function buildFieldEntry(
  sample: SourceSample,
  field: { name: string; declaredType: string },
): FieldQualityEntry {
  const totalRows = sample.rows.length
  const counts: Record<Exclude<ObservedType, '空值'>, number> = {
    数值: 0,
    文本: 0,
    时间: 0,
    布尔: 0,
  }
  let nullCount = 0
  const sampleValues: string[] = []
  const sampleRowIndexes: number[] = []
  sample.rows.forEach((row, index) => {
    const value = row[field.name] ?? null
    const observed = classifyCell(value)
    if (observed === '空值') {
      nullCount += 1
      return
    }
    counts[observed] += 1
    if (sampleValues.length < 3 && !sampleValues.includes(String(value))) {
      sampleValues.push(String(value))
      sampleRowIndexes.push(index + 1)
    }
  })
  const observedTypes: FieldTypeCount[] = TYPE_ORDER.filter((type) => counts[type] > 0).map((type) => ({
    type,
    count: counts[type],
  }))
  const dominant = observedTypes.length > 0
    ? observedTypes.reduce((best, item) => (item.count > best.count ? item : best)).type
    : '空值'
  const nullRate = totalRows === 0 ? 0 : nullCount / totalRows
  const verdict = judgeConflict(field.declaredType, observedTypes, totalRows)
  const typeDistribution = observedTypes.length > 0
    ? observedTypes.map((item) => `${item.type}${item.count}`).join(' / ')
    : '无有效样本'
  return {
    field: field.name,
    declaredType: field.declaredType,
    observedTypes,
    typeDistribution,
    dominantType: dominant,
    nullCount,
    nullRate,
    nullRateText: percent(nullRate),
    typeConflict: verdict.conflict,
    conflictRoute: verdict.route,
    conflictReason: verdict.reason,
    sampleValues,
    sampleRowIndexes,
    sampleSource: `${sample.sourceCode} · ${sample.sourceTable} · 第${sampleRowIndexes.join('、') || '—'}行`,
  }
}

/**
 * 只有抽不出样本才算「失败」；抽到了样本但发现类型冲突或空值，是这份报告要说明的问题，
 * 报告本身仍然成立（数据集管理可以引用），所以记「关注」而不是「失败」。
 */
function statusOf(fields: FieldQualityEntry[]): QualityReportStatus {
  const conflicts = fields.filter((item) => item.typeConflict).length
  const worstNull = fields.reduce((max, item) => Math.max(max, item.nullRate), 0)
  return conflicts > 0 || worstNull > 0 ? '关注' : '通过'
}

function nextVersion(sourceId: number): number {
  const previous = allReports()[String(sourceId)]
  return previous ? Number(previous.version) + 1 : 1
}

function failureReport(
  row: EntryRow,
  sample: SourceSample | null,
  version: number,
  submittedAt: string,
  reason: string,
): QualityReport {
  return {
    sourceId: Number(row.id),
    sourceCode: String(row["配置编号"] ?? ''),
    sourceTable: sample?.sourceTable ?? '',
    connectionType: String(row["连接类型"] ?? ''),
    connectionAddress: String(row["接入地址"] ?? ''),
    version,
    submittedAt,
    extractedAt: submittedAt,
    status: '失败',
    ok: false,
    connectionVerified: false,
    failureReason: reason,
    configSnapshot: { ...row },
    sampleQuery: sample?.sampleQuery ?? '',
    sampleCount: 0,
    sampleRows: [],
    fields: [],
    conflictFieldCount: 0,
    averageNullRate: 0,
    averageNullRateText: '—',
    maxNullRate: 0,
    maxNullRateText: '—',
  }
}

/** 抽取单个源的样本并生成字段质量报告；失败只影响这个源。 */
export function extractQualityReport(sourceId: number): QualitySubmitResult {
  const row = listRows('source').find((item) => Number(item.id) === Number(sourceId))
  const submittedAt = new Date().toISOString()
  const version = nextVersion(sourceId)
  if (!row) {
    return {
      ok: false,
      sourceId,
      sourceCode: '',
      version,
      status: '失败',
      message: `没有找到编号为 ${sourceId} 的接入配置，样本没有抽取`,
      report: null,
    }
  }
  const sourceCode = String(row["配置编号"] ?? '')
  const sample = sampleForSource(Number(row.id))
  const baseFailure = (reason: string): QualitySubmitResult => {
    const report = failureReport(row, sample, version, submittedAt, reason)
    // 失败报告也要单独落库，这样数据集管理能明确看出「这个源这次没通过」。
    saveReport(report)
    return { ok: false, sourceId: Number(row.id), sourceCode, version, status: '失败', message: reason, report }
  }
  if (String(row.status) !== '已连接') {
    return baseFailure(`接入配置 ${sourceCode} 当前状态「${String(row.status)}」，未连接不能抽取源表样本`)
  }
  if (!sample) {
    return baseFailure(`接入配置 ${sourceCode} 没有登记源表样本，无法计算字段质量`)
  }
  if (String(sample.connectionType) !== String(row["连接类型"])) {
    return baseFailure(
      `接入配置 ${sourceCode} 的连接类型是「${String(row["连接类型"])}」，与源表样本登记的「${sample.connectionType}」不一致`,
    )
  }
  if (sample.rows.length === 0 || sample.fields.length === 0) {
    return baseFailure(`源表 ${sample.sourceTable} 的样本为空，无法计算空值率和类型冲突`)
  }
  const fields = sample.fields.map((field) => buildFieldEntry(sample, field))
  const conflictFieldCount = fields.filter((item) => item.typeConflict).length
  const averageNullRate = fields.reduce((sum, item) => sum + item.nullRate, 0) / fields.length
  const maxNullRate = fields.reduce((max, item) => Math.max(max, item.nullRate), 0)
  const status = statusOf(fields)
  const report: QualityReport = {
    sourceId: Number(row.id),
    sourceCode,
    sourceTable: sample.sourceTable,
    connectionType: String(row["连接类型"]),
    connectionAddress: String(row["接入地址"] ?? ''),
    version,
    submittedAt,
    extractedAt: submittedAt,
    status,
    ok: true,
    connectionVerified: true,
    failureReason: '',
    configSnapshot: { ...row },
    sampleQuery: sample.sampleQuery,
    sampleCount: sample.rows.length,
    sampleRows: sample.rows.map((item) => ({ ...item })),
    fields,
    conflictFieldCount,
    averageNullRate,
    averageNullRateText: percent(averageNullRate),
    maxNullRate,
    maxNullRateText: percent(maxNullRate),
  }
  saveReport(report)
  const summary =
    conflictFieldCount > 0
      ? `字段质量报告已生成，${fields.length} 个字段中 ${conflictFieldCount} 个存在类型冲突，最高空值率 ${percent(maxNullRate)}`
      : `字段质量报告已生成，${fields.length} 个字段未发现类型冲突，最高空值率 ${percent(maxNullRate)}`
  return { ok: true, sourceId: Number(row.id), sourceCode, version, status, message: summary, report }
}

/** 一次提交多条：逐条返回处理结果，失败源不会覆盖其他源已经生成的报告。 */
export function submitQualityReports(sourceIds: number[]): QualitySubmitResult[] {
  const unique: number[] = []
  for (const id of sourceIds) {
    const numeric = Number(id)
    if (Number.isFinite(numeric) && !unique.includes(numeric)) {
      unique.push(numeric)
    }
  }
  return unique.map((id) => extractQualityReport(id))
}

export function latestReports(): QualityReport[] {
  return Object.values(allReports()).sort((a, b) => a.sourceId - b.sourceId)
}

export function reportView(sourceId: number): QualityReportView | null {
  const report = allReports()[String(sourceId)]
  if (!report) {
    return null
  }
  return { report, connection: checkReportConnection(report) }
}

function crossSourceNote(rows: FieldQualityProfileRow[]): { types: string; note: string } {
  const bySource = new Map<string, Set<string>>()
  for (const row of rows) {
    if (!bySource.has(row.sourceCode)) {
      bySource.set(row.sourceCode, new Set())
    }
    const set = bySource.get(row.sourceCode)
    if (set) {
      for (const item of row.observedTypes) {
        set.add(item.type)
      }
    }
  }
  const sourceTypes = [...bySource.entries()].map(([code, types]) => `${code}：${[...types].join('+')}`)
  const distinct = new Set(
    [...bySource.values()].flatMap((types) => [...types]).filter((type) => type !== '空值'),
  )
  if (bySource.size > 1 && distinct.size > 1) {
    return {
      types: sourceTypes.join('；'),
      note: '不同源表里同名字段的样本类型不同，按源分别解释，未合并为同一个字段',
    }
  }
  if (bySource.size > 1) {
    return { types: sourceTypes.join('；'), note: '多个源表里同名字段的样本类型一致，仍按源分别保留' }
  }
  return { types: sourceTypes.join('；'), note: '单源字段，按本源样本解释' }
}

/**
 * 数据集管理读取画像：按源或按字段名组织都保留源标识与样本依据。
 * - source：同一份报告内字段按源聚合，组内就是该源的字段清单；
 * - field：跨源同名字段排在一起，但每一行仍带 sourceCode / sourceTable / sampleSource。
 */
export function loadFieldQualityProfiles(mode: QualityProfileMode = 'source'): FieldQualityProfileRow[] {
  // 失败或连接核对不过的源不进入数据集管理的画像，但仍在数据源接入页留下报告依据。
  const reports = latestReports().filter((report) => report.ok && checkReportConnection(report).ok)
  const flat: FieldQualityProfileRow[] = []
  for (const report of reports) {
    const groupKey = mode === 'source' ? `${report.sourceCode} · ${report.sourceTable}` : ''
    for (const field of report.fields) {
      flat.push({
        ...field,
        sourceId: report.sourceId,
        sourceCode: report.sourceCode,
        sourceTable: report.sourceTable,
        connectionType: report.connectionType,
        version: report.version,
        reportStatus: report.status,
        reportOk: report.ok,
        reportSubmittedAt: report.submittedAt,
        groupMode: mode,
        groupKey: groupKey || field.field,
        crossSourceTypes: '',
        crossSourceNote: '',
        conflictRoute: `按源路线｜${field.conflictRoute}`,
        sourceCount: 1,
      })
    }
  }
  if (mode === 'source') {
    return flat.sort((a, b) =>
      a.sourceCode.localeCompare(b.sourceCode) || a.field.localeCompare(b.field),
    )
  }
  const byField = new Map<string, FieldQualityProfileRow[]>()
  for (const row of flat) {
    const list = byField.get(row.field)
    if (list) {
      list.push(row)
    } else {
      byField.set(row.field, [row])
    }
  }
  const merged: FieldQualityProfileRow[] = []
  for (const [field, rows] of byField) {
    const cross = crossSourceNote(rows)
    for (const row of rows) {
      merged.push({
        ...row,
        groupKey: field,
        crossSourceTypes: cross.types,
        crossSourceNote: cross.note,
        conflictRoute: row.typeConflict
          ? `跨源路线｜同名按源独立判定｜${row.sourceCode} 冲突成立，不因同名源无冲突而改判`
          : `跨源路线｜同名按源独立判定｜${row.sourceCode} 按本源样本无冲突，不合并同名源结论`,
        sourceCount: rows.length,
      })
    }
  }
  return merged.sort(
    (a, b) => a.field.localeCompare(b.field) || a.sourceCode.localeCompare(b.sourceCode),
  )
}

/** 数据集管理只选中报告有效、且用当前接入配置复核连接仍通过的源。 */
export function qualityEligibleSources(): number[] {
  return latestReports()
    .filter((report) => report.ok && checkReportConnection(report).ok)
    .map((report) => report.sourceId)
}
