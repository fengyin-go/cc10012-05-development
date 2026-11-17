/** 纯前端数据层的公共类型：与全栈版后端返回的结构保持一致，换回后端时页面不用改。 */

export type EntryRow = {
  id: number
  status: string
  pending: boolean
  abnormal: boolean
  [field: string]: string | number | boolean
}

export type ModuleMeta = {
  key: string
  name: string
  entity: string
  desc: string
  fields: string[]
  statuses: string[]
  actions: string[]
  actionTargets: Record<string, string>
  metrics: string[]
}

export type PageResult = {
  items: EntryRow[]
  total: number
  page: number
  size: number
}

export type ActionResult = {
  ok: boolean
  message: string
}

export type OverviewResult = {
  cards: { label: string; value: number }[]
  modules: { name: string; created: number; pending: number; abnormal: number }[]
}


/** 源表样本里的一格：值保持原始形状，便于按数值/文本判定类型。 */
export type SampleCell = string | number | boolean | null

export type SourceSampleField = {
  name: string
  declaredType: string
}

/** 本地数据层模拟的源表样本：报告会把它连同源标识一起持久化，作为校验依据。 */
export type SourceSample = {
  sourceId: number
  sourceCode: string
  connectionType: string
  sourceTable: string
  sampleQuery: string
  fields: SourceSampleField[]
  rows: Record<string, SampleCell>[]
}

export type ObservedType = '数值' | '文本' | '时间' | '布尔' | '空值'

export type FieldTypeCount = {
  type: Exclude<ObservedType, '空值'>
  count: number
}

export type FieldQualityEntry = {
  field: string
  declaredType: string
  observedTypes: FieldTypeCount[]
  typeDistribution: string
  dominantType: string
  nullCount: number
  nullRate: number
  nullRateText: string
  typeConflict: boolean
  conflictRoute: string
  conflictReason: string
  sampleValues: string[]
  sampleRowIndexes: number[]
  sampleSource: string
}

export type QualityReportStatus = '通过' | '关注' | '失败'

/** 一份字段质量报告同时承载接入配置快照与源表样本，刷新后仍可逐字段核对。 */
export type QualityReport = {
  sourceId: number
  sourceCode: string
  sourceTable: string
  connectionType: string
  connectionAddress: string
  version: number
  submittedAt: string
  extractedAt: string
  status: QualityReportStatus
  ok: boolean
  connectionVerified: boolean
  failureReason: string
  configSnapshot: EntryRow
  sampleQuery: string
  sampleCount: number
  sampleRows: Record<string, SampleCell>[]
  fields: FieldQualityEntry[]
  conflictFieldCount: number
  averageNullRate: number
  averageNullRateText: string
  maxNullRate: number
  maxNullRateText: string
}

export type QualitySubmitResult = {
  ok: boolean
  sourceId: number
  sourceCode: string
  version: number
  status: QualityReportStatus
  message: string
  report: QualityReport | null
}

export type QualityReportView = {
  report: QualityReport
  connection: QualityConnectionCheck
}

/** 数据集管理按字段名组织画像时使用的扁平行：仍然带源标识和样本依据。 */
export type FieldQualityProfileRow = FieldQualityEntry & {
  sourceId: number
  sourceCode: string
  sourceTable: string
  connectionType: string
  version: number
  reportStatus: QualityReportStatus
  reportOk: boolean
  reportSubmittedAt: string
  groupMode: QualityProfileMode
  groupKey: string
  crossSourceTypes: string
  crossSourceNote: string
  conflictRoute: string
  sourceCount: number
}

export type QualityProfileMode = 'source' | 'field'

/** 报告与当前连接配置的复核结果：报告本身留下提交时的快照，复核时再看配置有没有变。 */
export type QualityConnectionCheck = {
  ok: boolean
  checkedAt: string
  message: string
  currentStatus: string
}
