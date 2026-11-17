import type { SourceSample } from './types'

// 源表样本：纯前端仓库没有真实数据库，这里按接入配置准备可复现的样本，
// 质量报告抽取的就是这份数据。两个 PostgreSQL 源表里都有「客户编码」字段，
// 一个存文本、一个存数值，正好用来验证跨源同名字段不能混在一起解释。
export const SOURCE_SAMPLES: Record<number, SourceSample> = {
  1: {
    sourceId: 1,
    sourceCode: 'SOUR-0001',
    connectionType: 'PostgreSQL',
    sourceTable: 'public.customer_profile',
    sampleQuery: 'SELECT * FROM public.customer_profile LIMIT 10',
    fields: [
      { name: '客户编码', declaredType: 'text' },
      { name: '客户名称', declaredType: 'text' },
      { name: '注册日期', declaredType: 'date' },
      { name: '信用额度', declaredType: 'numeric' },
      { name: '是否有效', declaredType: 'boolean' },
    ],
    rows: [
      { 客户编码: 'C0001', 客户名称: '华信商贸', 注册日期: '2024-01-05', 信用额度: 120000, 是否有效: true },
      { 客户编码: 'C0002', 客户名称: '东港物流', 注册日期: '2024-02-11', 信用额度: 80000, 是否有效: true },
      { 客户编码: 'C0003', 客户名称: '', 注册日期: '2024-03-02', 信用额度: 45000.5, 是否有效: false },
      { 客户编码: 'C0004', 客户名称: '中原制造', 注册日期: '', 信用额度: 0, 是否有效: true },
      { 客户编码: 'C0005', 客户名称: '北方能源', 注册日期: '2024-04-18', 信用额度: 260000, 是否有效: true },
      { 客户编码: 'C0006', 客户名称: '海通零售', 注册日期: '2024-05-09', 信用额度: 32000, 是否有效: false },
      { 客户编码: 'C0007', 客户名称: '云岭科技', 注册日期: '2024-05-30', 信用额度: 150000, 是否有效: true },
      { 客户编码: 'C0008', 客户名称: '恒盛建材', 注册日期: '2024-06-14', 信用额度: 61000, 是否有效: true },
      { 客户编码: 'C0009', 客户名称: '', 注册日期: '2024-07-01', 信用额度: 98000, 是否有效: true },
      { 客户编码: 'C0010', 客户名称: '瑞丰农业', 注册日期: '2024-07-22', 信用额度: 27500, 是否有效: true },
    ],
  },
  2: {
    sourceId: 2,
    sourceCode: 'SOUR-0002',
    connectionType: 'MySQL',
    sourceTable: 'sales.order_detail',
    sampleQuery: 'SELECT * FROM sales.order_detail LIMIT 8',
    fields: [
      { name: '订单号', declaredType: 'varchar' },
      { name: '下单时间', declaredType: 'datetime' },
      { name: '商品数量', declaredType: 'int' },
      { name: '成交金额', declaredType: 'decimal' },
    ],
    rows: [
      { 订单号: 'ORD-1001', 下单时间: '2024-08-01 09:12:00', 商品数量: 3, 成交金额: 299.5 },
      { 订单号: 'ORD-1002', 下单时间: '2024-08-01 10:05:00', 商品数量: 1, 成交金额: 89 },
      { 订单号: 'ORD-1003', 下单时间: '2024-08-02 14:30:00', 商品数量: 12, 成交金额: 1450 },
      { 订单号: '', 下单时间: '2024-08-02 15:45:00', 商品数量: 2, 成交金额: 156.8 },
      { 订单号: 'ORD-1005', 下单时间: '', 商品数量: 5, 成交金额: 640 },
      { 订单号: 'ORD-1006', 下单时间: '2024-08-03 08:20:00', 商品数量: '四', 成交金额: 320 },
      { 订单号: 'ORD-1007', 下单时间: '2024-08-03 11:00:00', 商品数量: 8, 成交金额: '' },
      { 订单号: 'ORD-1008', 下单时间: '2024-08-04 16:40:00', 商品数量: 4, 成交金额: 512.25 },
    ],
  },
  3: {
    sourceId: 3,
    sourceCode: 'SOUR-0003',
    connectionType: 'PostgreSQL',
    sourceTable: 'dw.customer_fact',
    sampleQuery: 'SELECT * FROM dw.customer_fact LIMIT 10',
    fields: [
      { name: '客户编码', declaredType: 'bigint' },
      { name: '客户名称', declaredType: 'text' },
      { name: '更新日期', declaredType: 'date' },
      { name: '信用额度', declaredType: 'numeric' },
      { name: '是否有效', declaredType: 'boolean' },
    ],
    rows: [
      { 客户编码: 1001, 客户名称: '华信商贸', 更新日期: '2024-08-01', 信用额度: 120000, 是否有效: true },
      { 客户编码: 1002, 客户名称: '东港物流', 更新日期: '2024-08-02', 信用额度: 80000, 是否有效: true },
      { 客户编码: 1003, 客户名称: '远洋渔业', 更新日期: '2024-08-03', 信用额度: 66000, 是否有效: true },
      { 客户编码: 1004, 客户名称: '中原制造', 更新日期: '', 信用额度: 0, 是否有效: true },
      { 客户编码: 1005, 客户名称: '北方能源', 更新日期: '2024-08-05', 信用额度: 260000, 是否有效: true },
      { 客户编码: 1006, 客户名称: '', 更新日期: '2024-08-06', 信用额度: 32000, 是否有效: false },
      { 客户编码: null, 客户名称: '云岭科技', 更新日期: '2024-08-07', 信用额度: 150000, 是否有效: true },
      { 客户编码: 1008, 客户名称: '恒盛建材', 更新日期: '2024-08-08', 信用额度: 61000, 是否有效: true },
      { 客户编码: 1009, 客户名称: '瑞丰农业', 更新日期: '2024-08-09', 信用额度: 27500, 是否有效: true },
      { 客户编码: 1010, 客户名称: '西部矿业', 更新日期: '2024-08-10', 信用额度: 430000, 是否有效: true },
    ],
  },
}

export function sampleForSource(sourceId: number): SourceSample | null {
  return SOURCE_SAMPLES[sourceId] ?? null
}
