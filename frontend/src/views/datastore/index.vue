<template>
  <section class="page" data-module="datastore">
    <header class="page-head">
      <div>
        <h2>数据集管理管理</h2>
        <p class="page-desc">
          维护数据集定义；字段质量画像直接读取数据源接入的字段质量报告，按源或按字段名查看都带源标识与样本依据。
        </p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="openCreate">登记数据集定义</button>
        <button class="btn" type="button" @click="exportRows">导出数据集管理清单</button>
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

    <form class="filter-bar" @submit.prevent="reload">
      <label v-for="field in filterFields" :key="field" class="filter-item">
        <span>{{ field }}</span>
        <input v-model="filters[field]" :placeholder="`按${field}检索`" />
      </label>
      <button class="btn" type="submit">查询</button>
      <button class="btn ghost" type="button" @click="resetFilters">重置条件</button>
    </form>

    <table class="data-table">
      <thead>
        <tr>
          <th v-for="column in columns" :key="column">{{ column }}</th>
          <th>当前状态</th>
          <th>可执行动作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="String(row.id)">
          <td v-for="column in columns" :key="column">{{ row[column] ?? '—' }}</td>
          <td>{{ row.status }}</td>
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
          <td :colspan="columns.length + 2" class="empty-state">暂无数据集管理数据，可先登记数据集定义</td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <span>共 {{ total }} 条数据集管理记录</span>
      <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
    </footer>

    <section class="panel" data-testid="quality-profiles">
      <header class="panel-head">
        <div>
          <h3>字段质量画像</h3>
          <p class="panel-desc">
            来自数据源接入的字段质量报告；同名同段在不同源表里可以同时是文本和数值，这里不合并解释。
          </p>
        </div>
        <div class="segmented" role="group" aria-label="画像组织方式">
          <button
            v-for="option in profileModes"
            :key="option.value"
            class="segmented-item"
            :class="{ active: profileMode === option.value }"
            type="button"
            @click="switchProfileMode(option.value)"
          >
            {{ option.label }}
          </button>
        </div>
      </header>

      <div class="source-picker" data-testid="report-sources">
        <label
          v-for="item in reportSources"
          :key="item.report.sourceId"
          class="source-chip"
          :class="{ disabled: !item.selectable }"
        >
          <input
            type="checkbox"
            :checked="selectedSources.includes(item.report.sourceId)"
            :disabled="!item.selectable"
            @change="toggleSource(item.report.sourceId)"
          />
          <span>{{ item.report.sourceCode }}</span>
          <span class="muted">v{{ item.report.version }} · {{ item.report.status }}</span>
          <span v-if="!item.selectable" class="error-text">{{ item.reason }}</span>
        </label>
        <span v-if="!reportSources.length" class="muted">
          还没有字段质量报告，请到「数据源接入」勾选配置并抽取样本。
        </span>
        <button v-if="selectedSources.length" class="link" type="button" @click="selectedSources = []">
          清除源选择
        </button>
      </div>

      <p class="muted">
        当前组织方式：{{ profileMode === 'source' ? '按源' : '按字段名' }}；已选 {{ selectedSources.length }}
        个源，展示 {{ visibleProfiles.length }} 条字段记录。
      </p>

      <table v-if="visibleProfiles.length" class="data-table">
        <thead>
          <tr>
            <th>源标识</th>
            <th>源表</th>
            <th>报告版本</th>
            <th>字段</th>
            <th>声明类型</th>
            <th>样本类型分布</th>
            <th>空值率</th>
            <th>类型冲突</th>
            <th>冲突判定路线</th>
            <th>样本依据</th>
          </tr>
        </thead>
        <tbody v-for="group in profileGroups" :key="group.key">
          <tr class="group-row">
            <td :colspan="10">
              <strong>{{ group.title }}</strong>
              <span class="muted"> · {{ group.rows.length }} 个字段 · {{ group.meta }}</span>
              <span v-if="group.note" class="muted block">{{ group.note }}</span>
            </td>
          </tr>
          <tr
            v-for="item in group.rows"
            :key="`${item.sourceId}-${item.field}`"
            :data-field="item.field"
            :data-source="item.sourceCode"
          >
            <td>{{ item.sourceCode }}</td>
            <td>{{ item.sourceTable }}</td>
            <td>v{{ item.version }}</td>
            <td>
              {{ item.field }}
              <span v-if="profileMode === 'field' && item.sourceCount > 1" class="badge">
                同名 {{ item.sourceCount }}
              </span>
            </td>
            <td>{{ item.declaredType }}</td>
            <td>{{ item.typeDistribution }}</td>
            <td>{{ item.nullRateText }}</td>
            <td :class="item.typeConflict ? 'error-text' : 'ok-text'">
              {{ item.typeConflict ? '有冲突' : '无冲突' }}
            </td>
            <td>
              {{ item.conflictRoute }}
              <span v-if="item.crossSourceNote" class="muted block">{{ item.crossSourceNote }}</span>
            </td>
            <td>{{ item.sampleSource }}</td>
          </tr>
        </tbody>
      </table>
      <p v-else class="empty-state">没有可展示的字段质量记录</p>
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
import {
  loadFieldQualityProfiles,
  latestReports,
  qualityEligibleSources,
  reportView,
} from '@/api/quality-service'
import type { EntryRow, FieldQualityProfileRow, QualityProfileMode } from '@/data/types'

const meta = moduleMeta('datastore')
const columns = ["数据集编号", "数据集名称", "来源表名", "字段列表", "更新策略", "数据采样比例", "生命周期天数", "缓存开关"]
const actions = ["提交审核", "生效发布", "废弃下线"]
const statuses = ["草稿", "待审核", "已生效", "已废弃"]
const stats = [{"label": "数据集定义总数", "value": 0}, {"label": "已生效数据集", "value": 0}, {"label": "待审核数据集", "value": 0}]

const profileModes: { value: QualityProfileMode; label: string }[] = [
  { value: 'source', label: '按源组织' },
  { value: 'field', label: '按字段名组织' },
]

const rows = ref<EntryRow[]>([])
const total = ref(0)
const errorMessage = ref('')
const filters = ref<Record<string, string>>({})
const filterFields = columns.slice(0, 3)
const profileMode = ref<QualityProfileMode>('source')
const profiles = ref<FieldQualityProfileRow[]>([])
const selectedSources = ref<number[]>([])
const reportSources = ref<
  { report: ReturnType<typeof latestReports>[number]; selectable: boolean; reason: string }[]
>([])

const statusSummary = computed(() =>
  statuses.map((status: string) => ({
    status,
    count: rows.value.filter((row) => String(row.status) === status).length,
  })),
)

const visibleProfiles = computed(() => {
  if (selectedSources.value.length === 0) {
    return profiles.value
  }
  return profiles.value.filter((item) => selectedSources.value.includes(item.sourceId))
})

const profileGroups = computed(() => {
  const groups = new Map<string, FieldQualityProfileRow[]>()
  for (const row of visibleProfiles.value) {
    const list = groups.get(row.groupKey)
    if (list) {
      list.push(row)
    } else {
      groups.set(row.groupKey, [row])
    }
  }
  return [...groups.entries()].map(([key, groupRows]) => {
    const first = groupRows[0]
    const title = profileMode.value === 'source' ? `${first.sourceCode} · ${first.sourceTable}` : `字段「${key}」`
    const meta =
      profileMode.value === 'source'
        ? `${first.connectionType} · 报告 v${first.version} · ${first.reportStatus}`
        : `出现在 ${new Set(groupRows.map((row) => row.sourceCode)).size} 个源表`
    const note =
      profileMode.value === 'field'
        ? [first.crossSourceNote, first.crossSourceTypes].filter(Boolean).join('；')
        : ''
    return { key: `${profileMode.value}-${key}`, title, meta, note, rows: groupRows }
  })
})

function refreshProfiles() {
  profiles.value = loadFieldQualityProfiles(profileMode.value)
  // 能不能被数据集管理选中，只有一个口径：报告有效且当前连接配置核对通过。
  const eligible = new Set(qualityEligibleSources())
  reportSources.value = latestReports().map((report) => {
    if (eligible.has(report.sourceId)) {
      return { report, selectable: true, reason: '' }
    }
    if (!report.ok || report.status === '失败') {
      return { report, selectable: false, reason: report.failureReason || '报告状态失败' }
    }
    const connection = reportView(report.sourceId)?.connection
    return {
      report,
      selectable: false,
      reason: connection?.message || '连接配置无法核对',
    }
  })
  // 源状态可能已经变化，之前选中的失败源要被剔除，不能留在数据集管理里。
  const allowed = reportSources.value.filter((item) => item.selectable).map((item) => item.report.sourceId)
  selectedSources.value = selectedSources.value.filter((id) => allowed.includes(id))
}

function switchProfileMode(mode: QualityProfileMode) {
  profileMode.value = mode
  refreshProfiles()
}

function toggleSource(sourceId: number) {
  selectedSources.value = selectedSources.value.includes(sourceId)
    ? selectedSources.value.filter((id) => id !== sourceId)
    : [...selectedSources.value, sourceId]
}

function resetFilters() {
  filters.value = {}
  reload()
}

function exportRows() {
  downloadEntries(meta.key, filters.value)
}

function openCreate() {
  errorMessage.value = '数据集定义登记入口尚未接入审批流'
}

function runAction(action: string, row: EntryRow) {
  errorMessage.value = ''
  const result = applyAction(meta.key, Number(row.id), action)
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  reload()
}

function reload() {
  try {
    const payload = listEntries(meta.key, filters.value)
    rows.value = payload.items
    total.value = payload.total
    const all = listEntries(meta.key).items
    stats[0].value = all.length
    stats[1].value = all.filter((row) => String(row.status) === '已生效').length
    stats[2].value = all.filter((row) => String(row.status) === '待审核').length
    refreshProfiles()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '数据集管理列表读取失败'
  }
}

onMounted(reload)
</script>
