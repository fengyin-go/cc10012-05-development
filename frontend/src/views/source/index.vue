<template>
  <section class="page" data-module="source">
    <header class="page-head">
      <div>
        <h2>数据源接入管理</h2>
        <p class="page-desc">
          维护数据源接入配置；勾选多个已连接配置后可从源表样本抽取字段质量报告，集中查看空值率与类型冲突。
        </p>
      </div>
      <div class="page-actions">
        <button class="btn" type="button" @click="openCreate">登记接入配置</button>
        <button class="btn primary" type="button" :disabled="submitting" @click="submitSelected">
          {{ submitting ? '正在抽取样本…' : `抽取并提交质量报告（已选 ${selectedIds.length}）` }}
        </button>
        <button class="btn" type="button" @click="exportRows">导出数据源接入清单</button>
      </div>
    </header>

    <div class="stat-row">
      <article v-for="item in stats" :key="item.label" class="stat-card">
        <span class="stat-label">{{ item.label }}</span>
        <strong class="stat-value">{{ item.value }}</strong>
      </article>
    </div>

    <p class="status-legend">
      <span v-for="item in statusSummary" :key="item.status" class="legend-item">
        {{ item.status }}：{{ item.count }}
      </span>
    </p>

    <form class="filter-bar" @submit.prevent="applyFilters">
      <label v-for="field in filterFields" :key="field" class="filter-item">
        <span>{{ field }}</span>
        <input v-model="filters[field]" :placeholder="`按${field}检索`" />
      </label>
      <button class="btn" type="submit">查询</button>
      <button class="btn ghost" type="button" @click="resetFilters">重置条件</button>
    </form>

    <table class="data-table quality-table">
      <thead>
        <tr>
          <th class="check-cell">
            <input
              type="checkbox"
              :checked="allVisibleSelected"
              :indeterminate.prop="someVisibleSelected && !allVisibleSelected"
              aria-label="全选当前列表"
              @change="toggleAllVisible"
            />
          </th>
          <th v-for="column in columns" :key="column">{{ column }}</th>
          <th>当前状态</th>
          <th>字段质量报告</th>
          <th>可执行动作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="String(row.id)" :class="{ 'row-selected': isSelected(row) }">
          <td class="check-cell">
            <input
              type="checkbox"
              :checked="isSelected(row)"
              :aria-label="`选择${row['配置编号']}抽取样本`"
              @change="toggleSelected(row)"
            />
          </td>
          <td v-for="column in columns" :key="column">{{ row[column] ?? '—' }}</td>
          <td>{{ row.status }}</td>
          <td>
            <template v-if="reportBook[String(row.id)]">
              <button
                class="link"
                type="button"
                :data-report-source="row['配置编号']"
                @click="openReport(Number(row.id))"
              >
                v{{ reportBook[String(row.id)].version }} · {{ reportBook[String(row.id)].status }}
              </button>
              <span v-if="reportBook[String(row.id)].conflictFieldCount > 0" class="warn-text">
                冲突 {{ reportBook[String(row.id)].conflictFieldCount }}
              </span>
              <span class="muted block">连接核对：{{ connectionState(Number(row.id)) }}</span>
            </template>
            <span v-else class="muted">尚无报告</span>
          </td>
          <td class="row-actions">
            <button
              v-for="action in actions"
              :key="action"
              class="link"
              type="button"
              @click="runAction(action, row)"
            >
              {{ action }}
            </button>
          </td>
        </tr>
        <tr v-if="!rows.length">
          <td :colspan="columns.length + 4" class="empty-state">暂无数据源接入数据，可先登记接入配置</td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <span>共 {{ total }} 条数据源接入记录；已生成 {{ reportCount }} 份字段质量报告</span>
      <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
    </footer>

    <section v-if="submitResults.length" class="panel" data-testid="submit-results">
      <header class="panel-head">
        <h3>本次提交结果</h3>
        <button class="link" type="button" @click="submitResults = []">清除结果</button>
      </header>
      <ul class="result-list">
        <li v-for="item in submitResults" :key="`${item.sourceId}-${item.version}`" :class="item.ok ? 'ok-text' : 'error-text'">
          <strong>{{ item.sourceCode || `#${item.sourceId}` }}</strong>
          · 版本 v{{ item.version }} · {{ item.status }} · {{ item.message }}
        </li>
      </ul>
    </section>

    <section v-if="activeReport" class="panel" data-testid="quality-report">
      <header class="panel-head">
        <div>
          <h3>
            字段质量报告 · {{ activeReport.report.sourceCode }} · {{ activeReport.report.sourceTable }}
            <span class="badge">v{{ activeReport.report.version }}</span>
          </h3>
          <p class="panel-desc">
            提交时间 {{ formatTime(activeReport.report.submittedAt) }} · 样本口径
            <code>{{ activeReport.report.sampleQuery }}</code>
          </p>
        </div>
        <button class="link" type="button" @click="activeReport = null">收起</button>
      </header>

      <p :class="activeReport.connection.ok ? 'ok-text' : 'error-text'" data-testid="connection-check">
        连接配置核对：{{ activeReport.connection.message }}
      </p>

      <div class="stat-row compact">
        <article class="stat-card">
          <span class="stat-label">报告状态</span>
          <strong class="stat-value">{{ activeReport.report.status }}</strong>
        </article>
        <article class="stat-card">
          <span class="stat-label">样本行数</span>
          <strong class="stat-value">{{ activeReport.report.sampleCount }}</strong>
        </article>
        <article class="stat-card">
          <span class="stat-label">类型冲突字段</span>
          <strong class="stat-value">{{ activeReport.report.conflictFieldCount }}</strong>
        </article>
        <article class="stat-card">
          <span class="stat-label">最高空值率</span>
          <strong class="stat-value">{{ activeReport.report.maxNullRateText }}</strong>
        </article>
        <article class="stat-card">
          <span class="stat-label">平均空值率</span>
          <strong class="stat-value">{{ activeReport.report.averageNullRateText }}</strong>
        </article>
      </div>

      <p v-if="activeReport.report.failureReason" class="error-text">
        失败原因：{{ activeReport.report.failureReason }}
      </p>

      <details v-if="activeReport.report.sampleRows.length" class="sample-detail">
        <summary>查看源表样本原始行（{{ activeReport.report.sampleRows.length }} 行）</summary>
        <table class="data-table">
          <thead>
            <tr>
              <th>样本行</th>
              <th v-for="field in activeReport.report.fields" :key="field.field">{{ field.field }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(sample, index) in activeReport.report.sampleRows" :key="index">
              <td>第{{ index + 1 }}行</td>
              <td v-for="field in activeReport.report.fields" :key="field.field">
                {{ sample[field.field] === null || sample[field.field] === '' ? '（空）' : sample[field.field] }}
              </td>
            </tr>
          </tbody>
        </table>
      </details>

      <table v-if="activeReport.report.fields.length" class="data-table">
        <thead>
          <tr>
            <th>字段</th>
            <th>声明类型</th>
            <th>样本类型分布</th>
            <th>空值率</th>
            <th>类型冲突</th>
            <th>判定路线</th>
            <th>判定说明</th>
            <th>样本来源</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="field in activeReport.report.fields" :key="field.field">
            <td>{{ field.field }}</td>
            <td>{{ field.declaredType }}</td>
            <td>{{ field.typeDistribution }}</td>
            <td>{{ field.nullRateText }}（{{ field.nullCount }} 行）</td>
            <td :class="field.typeConflict ? 'error-text' : 'ok-text'">
              {{ field.typeConflict ? '有冲突' : '无冲突' }}
            </td>
            <td>{{ field.conflictRoute }}</td>
            <td>{{ field.conflictReason }}</td>
            <td>{{ field.sampleSource }}</td>
          </tr>
        </tbody>
      </table>
      <p v-else class="muted">这个源本次没有产出可核对字段，详见失败原因。</p>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import {
  downloadEntries,
  listEntries,
  moduleMeta,
  runAction as applyAction,
} from '@/api/local-service'
import { reportView, submitQualityReports } from '@/api/quality-service'
import { allReports } from '@/data/quality-store'
import type { EntryRow, QualityReport, QualityReportView, QualitySubmitResult } from '@/data/types'

const meta = moduleMeta('source')
const columns = ["配置编号", "连接类型", "接入地址", "认证凭证", "连接池大小", "超时秒数", "重试上限", "负责人"]
const actions = ["提交校验", "建立连接", "断开连接"]
const statuses = ["草稿", "待校验", "已连接", "已断开"]
const stats = [{"label": "接入配置总数", "value": 0}, {"label": "已连接接入", "value": 0}, {"label": "待校验接入", "value": 0}]

const rows = ref<EntryRow[]>([])
const total = ref(0)
const errorMessage = ref('')
const filters = ref<Record<string, string>>({})
const filterFields = columns.slice(0, 3)
const selectedIds = ref<number[]>([])
const submitting = ref(false)
const submitResults = ref<QualitySubmitResult[]>([])
const reportBook = ref<Record<string, QualityReport>>({})
const activeReport = ref<QualityReportView | null>(null)

const statusSummary = computed(() =>
  statuses.map((status: string) => ({
    status,
    count: rows.value.filter((row) => String(row.status) === status).length,
  })),
)

const reportCount = computed(() => Object.keys(reportBook.value).length)
const allVisibleSelected = computed(
  () => rows.value.length > 0 && rows.value.every((row) => isSelected(row)),
)
const someVisibleSelected = computed(() => rows.value.some((row) => isSelected(row)))

function isSelected(row: EntryRow): boolean {
  return selectedIds.value.includes(Number(row.id))
}

function toggleSelected(row: EntryRow) {
  const id = Number(row.id)
  selectedIds.value = isSelected(row)
    ? selectedIds.value.filter((item) => item !== id)
    : [...selectedIds.value, id]
}

function toggleAllVisible() {
  const visibleIds = rows.value.map((row) => Number(row.id))
  if (allVisibleSelected.value) {
    selectedIds.value = selectedIds.value.filter((id) => !visibleIds.includes(id))
    return
  }
  selectedIds.value = [...new Set([...selectedIds.value, ...visibleIds])]
}

function openCreate() {
  errorMessage.value = '接入配置登记入口尚未接入审批流'
}

function formatTime(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false })
}

function openReport(sourceId: number) {
  activeReport.value = reportView(sourceId)
}

function connectionState(sourceId: number): string {
  const view = reportView(sourceId)
  if (!view) {
    return '无报告'
  }
  return view.connection.ok ? '通过' : `不可用（${view.connection.currentStatus}）`
}

function refreshReports() {
  reportBook.value = allReports()
}

function applyFilters() {
  errorMessage.value = ''
  reload()
}

function resetFilters() {
  filters.value = {}
  applyFilters()
}

function exportRows() {
  downloadEntries(meta.key, filters.value)
}

function runAction(action: string, row: EntryRow) {
  errorMessage.value = ''
  const result = applyAction(meta.key, Number(row.id), action)
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  if (activeReport.value && activeReport.value.report.sourceId === Number(row.id)) {
    // 报告留着，但连接配置一改就在这里重新核对，避免拿旧快照当依据。
    activeReport.value = reportView(Number(row.id))
  }
  reload()
}

function submitSelected() {
  errorMessage.value = ''
  if (selectedIds.value.length === 0) {
    errorMessage.value = '请先勾选要抽取样本的接入配置'
    return
  }
  submitting.value = true
  try {
    // 逐源提交：每个源的报告独立生成并各自落库，一个源失败不会覆盖其他源的报告。
    submitResults.value = submitQualityReports(selectedIds.value)
    const failed = submitResults.value.filter((item) => !item.ok)
    if (failed.length > 0) {
      errorMessage.value = `${failed.length} 个源没有通过校验，其余源已各自生成报告`
    }
    const lastOk = [...submitResults.value].reverse().find((item) => item.ok)
    if (lastOk) {
      activeReport.value = reportView(lastOk.sourceId)
    }
  } finally {
    submitting.value = false
    reload()
  }
}

function reload() {
  try {
    const payload = listEntries(meta.key, filters.value)
    rows.value = payload.items
    total.value = payload.total
    const all = listEntries(meta.key).items
    stats[0].value = all.length
    stats[1].value = all.filter((row) => String(row.status) === '已连接').length
    stats[2].value = all.filter((row) => String(row.status) === '待校验').length
    refreshReports()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '数据源接入列表读取失败'
  }
}

onMounted(reload)
</script>
