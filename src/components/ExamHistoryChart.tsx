import { AreaChart, Area, XAxis, YAxis, CartesianGrid, ReferenceLine, Tooltip, ResponsiveContainer } from 'recharts'
import type { examTrend } from '../lib/examAnalytics'

interface Props {
  rows: ReturnType<typeof examTrend>
  metric: 'net' | 'points'
  average: number
  onSelect: (id: string) => void
}
const number = (value: number | null) => value == null ? '—' : value.toLocaleString('tr-TR', { maximumFractionDigits: 2 })
const date = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })

export default function ExamHistoryChart({ rows, metric, average, onSelect }: Props) {
  return <div className="result-history-canvas"><ResponsiveContainer width="100%" height="100%"><AreaChart data={rows} margin={{ top: 18, right: 16, left: -14, bottom: 2 }} onClick={event => {
    const index = event?.activeTooltipIndex
    if (index != null) { const row = rows[Number(index)]; if (row) onSelect(row.id) }
  }}>
    <defs><linearGradient id="exam-history-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#6a8cbf" stopOpacity={.25} /><stop offset="100%" stopColor="#6a8cbf" stopOpacity={.02} /></linearGradient></defs>
    <CartesianGrid vertical={false} stroke="#edf1f6" strokeDasharray="3 4" />
    <XAxis dataKey="order" tick={{ fontSize: 12, fill: '#62748b' }} axisLine={false} tickLine={false} minTickGap={22} tickFormatter={value => `${value}.`} />
    <YAxis width={48} domain={['auto', 'auto']} tick={{ fontSize: 12, fill: '#62748b' }} tickFormatter={number} axisLine={false} tickLine={false} />
    <ReferenceLine y={average} stroke="#9baabd" strokeDasharray="5 5" />
    <Tooltip cursor={{ stroke: '#c6d4e7', strokeDasharray: '3 4' }} content={({ active, payload }) => {
      const row = payload?.[0]?.payload
      if (!active || !row) return null
      return <div className="result-history-tooltip"><strong>{row.name}</strong><span>{date(row.date)}</span><b>{number(row[metric])} {metric === 'net' ? 'net' : 'puan'}</b><small>{row.correct} doğru · {row.incorrect} yanlış</small></div>
    }} />
    <Area type="linear" dataKey={metric} connectNulls={false} stroke="#4269a8" fill="url(#exam-history-fill)" strokeWidth={2.5} dot={rows.length <= 30 ? { r: 4, fill: '#fff', stroke: '#4269a8', strokeWidth: 2 } : false} activeDot={{ r: 6, fill: '#4269a8', stroke: '#fff', strokeWidth: 3 }} />
  </AreaChart></ResponsiveContainer></div>
}
