import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { analyticsAPI } from './api'   // ✅ fixed import

// ── Color palettes ─────────────────────────────────────────────────────────
const INTENT_COLOR = {
  track:           '#2563eb',
  complain:        '#ef4444',
  schedule_pickup: '#10b981',
  faq:             '#8b5cf6',
  escalate:        '#f59e0b',
  greeting:        '#06b6d4',
  modify_pickup:   '#f97316',
  cancel_pickup:   '#ec4899',
  unknown:         '#94a3b8',
}
const PIE_COLORS  = ['#2563eb','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#f97316']
const STATUS_CLR  = { open:'#ef4444', investigating:'#f59e0b', resolved:'#10b981', closed:'#94a3b8' }
const PICKUP_CLR  = { scheduled:'#2563eb', confirmed:'#10b981', completed:'#8b5cf6', cancelled:'#ef4444' }

// ── Framer stagger ─────────────────────────────────────────────────────────
const STAGGER = { hidden:{ opacity:0 }, show:{ opacity:1, transition:{ staggerChildren:0.06 } } }
const ITEM    = { hidden:{ opacity:0, y:14 }, show:{ opacity:1, y:0, transition:{ duration:0.28 } } }

// ── Subcomponents ──────────────────────────────────────────────────────────
const Tip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 shadow-lg text-xs">
      {label && <p className="font-semibold text-slate-600 dark:text-slate-300 mb-1.5">{label}</p>}
      {payload.map((p,i) => (
        <p key={i} style={{ color: p.color }}>
          {p.name}: <strong>{typeof p.value === 'number' ? p.value.toLocaleString() : p.value}</strong>
        </p>
      ))}
    </div>
  )
}

function StatCard({ icon, label, value, sub, accent = '#2563eb' }) {
  return (
    <motion.div variants={ITEM}
      className="card p-5 flex items-start gap-4">
      <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-xl shrink-0"
        style={{ background: accent + '18', color: accent }}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-1 truncate">{label}</p>
        <p className="text-2xl font-bold text-slate-900 dark:text-white leading-none">{value}</p>
        {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
      </div>
    </motion.div>
  )
}

function SectionTitle({ title, sub }) {
  return (
    <div className="mb-5">
      <h2 className="font-bold text-slate-900 dark:text-white text-sm">{title}</h2>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  )
}

function ProgressBar({ label, value, max, color, count }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div>
      <div className="flex justify-between items-center mb-1.5">
        <span className="text-sm text-slate-700 dark:text-slate-300 capitalize">{label}</span>
        <span className="text-xs font-bold" style={{ color }}>{pct}% <span className="text-slate-400 font-normal">({count})</span></span>
      </div>
      <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }} animate={{ width: `${pct}%` }}
          transition={{ duration: 0.7, ease: 'easeOut' }}
          className="h-full rounded-full" style={{ background: color }}
        />
      </div>
    </div>
  )
}

function ComplaintBadge({ status }) {
  const cfg = {
    open:          { bg:'bg-red-50 dark:bg-red-900/20',    text:'text-red-700 dark:text-red-300',   label:'Open' },
    investigating: { bg:'bg-amber-50 dark:bg-amber-900/20',text:'text-amber-700 dark:text-amber-300',label:'Investigating' },
    resolved:      { bg:'bg-green-50 dark:bg-green-900/20',text:'text-green-700 dark:text-green-300',label:'Resolved' },
    closed:        { bg:'bg-slate-100 dark:bg-slate-800',  text:'text-slate-500 dark:text-slate-400',label:'Closed' },
  }
  const c = cfg[status] || cfg.open
  return <span className={`badge ${c.bg} ${c.text} text-[10px] px-2 py-0.5 rounded-full font-medium`}>{c.label}</span>
}

// ── Page ───────────────────────────────────────────────────────────────────
export default function AnalyticsPage() {
  const [data, setData]     = useState(null)
  const [days, setDays]     = useState(30)
  const [loading, setLoad]  = useState(true)
  const [error, setError]   = useState('')

  useEffect(() => {
    setLoad(true); setError('')
    analyticsAPI.summary(days)
      .then(r => setData(r.data))
      .catch(() => setError('Could not load analytics. Make sure the backend is running.'))
      .finally(() => setLoad(false))
  }, [days])

  const stars = (r) => '★'.repeat(Math.round(r || 0)) + '☆'.repeat(5 - Math.round(r || 0))

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 py-8">

        {/* Header */}
        <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Analytics Dashboard</h1>
            <p className="text-slate-400 text-sm mt-0.5">Live data from your PostgreSQL database</p>
          </div>
          <select value={days} onChange={e => setDays(Number(e.target.value))} className="input w-38 text-sm">
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        </div>

        {loading && (
          <div className="flex flex-col items-center justify-center h-64 gap-3">
            <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-slate-400 text-sm">Fetching analytics from database…</p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-6 text-center">
            <p className="text-red-600 dark:text-red-400 font-medium">⚠️ {error}</p>
          </div>
        )}

        {data && !loading && (
          <motion.div variants={STAGGER} initial="hidden" animate="show" className="space-y-8">

            {/* ── Stat cards row 1 ─────────────────────────────────────── */}
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              <StatCard icon="💬" label="Total Conversations" value={data.total_conversations.toLocaleString()} sub={`Last ${days} days`} accent="#2563eb" />
              <StatCard icon="📨" label="Total Messages"      value={data.total_messages.toLocaleString()}      sub="User + bot combined"  accent="#8b5cf6" />
              <StatCard icon="📋" label="Complaints Filed"    value={data.total_complaints.toLocaleString()}    sub="All time"             accent="#ef4444" />
              <StatCard icon="📅" label="Pickups Scheduled"   value={data.total_pickups.toLocaleString()}       sub="All time"             accent="#10b981" />
              <StatCard icon="⭐" label="Avg. Feedback"
                value={`${(data.avg_feedback_rating || 0).toFixed(1)} / 5`}
                sub={stars(data.avg_feedback_rating)}
                accent="#f59e0b"
              />
              <StatCard icon="🧑‍💼" label="Escalation Rate"  value={`${data.escalation_rate}%`}               sub="Routed to agent"      accent="#f97316" />
            </div>

            {/* ── Daily messages area chart ────────────────────────────── */}
            <motion.div variants={ITEM} className="card p-6">
              <SectionTitle title="Daily Message Volume" sub={`User and bot messages over the last ${days} days`} />
              {data.daily_messages.length === 0 ? (
                <p className="text-slate-400 text-sm text-center py-12">No message data for this period yet.</p>
              ) : (
                <ResponsiveContainer width="100%" height={230}>
                  <AreaChart data={data.daily_messages} margin={{ top:4, right:4, left:-20, bottom:0 }}>
                    <defs>
                      <linearGradient id="gU" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#2563eb" stopOpacity={0.18} />
                        <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gB" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#10b981" stopOpacity={0.18} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.4} />
                    <XAxis dataKey="date" tick={{ fontSize:11, fill:'#94a3b8' }} tickFormatter={v => v.slice(5)} />
                    <YAxis tick={{ fontSize:11, fill:'#94a3b8' }} allowDecimals={false} />
                    <Tooltip content={<Tip />} />
                    <Legend wrapperStyle={{ fontSize:12 }} />
                    <Area type="monotone" dataKey="user_messages" name="User"    stroke="#2563eb" strokeWidth={2} fill="url(#gU)" dot={false} />
                    <Area type="monotone" dataKey="bot_messages"  name="Bot"     stroke="#10b981" strokeWidth={2} fill="url(#gB)" dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </motion.div>

            {/* ── Intent breakdown + Complaint types ───────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

              <motion.div variants={ITEM} className="card p-6">
                <SectionTitle title="Intent Distribution" sub="What users are asking about most" />
                {data.intent_breakdown.length === 0 ? (
                  <p className="text-slate-400 text-sm text-center py-10">No intent data yet.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={data.intent_breakdown} layout="vertical" margin={{ left:10, right:24 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" strokeOpacity={0.4} />
                      <XAxis type="number" tick={{ fontSize:11, fill:'#94a3b8' }} allowDecimals={false} />
                      <YAxis dataKey="intent" type="category" tick={{ fontSize:11, fill:'#94a3b8' }} width={100}
                        tickFormatter={v => v.replace(/_/g,' ')} />
                      <Tooltip content={<Tip />} />
                      <Bar dataKey="count" name="Messages" radius={[0,6,6,0]}>
                        {data.intent_breakdown.map((e,i) => (
                          <Cell key={i} fill={INTENT_COLOR[e.intent] || PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </motion.div>

              <motion.div variants={ITEM} className="card p-6">
                <SectionTitle title="Complaint Types" sub="Breakdown of all filed complaints" />
                {data.complaint_type_breakdown.length === 0 ? (
                  <p className="text-slate-400 text-sm text-center py-10">No complaints filed yet.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={data.complaint_type_breakdown} dataKey="count" nameKey="type"
                        cx="50%" cy="50%" outerRadius={78} innerRadius={46} paddingAngle={3}
                        label={({ name, percent }) => `${name} ${(percent*100).toFixed(0)}%`}
                        labelLine={false}>
                        {data.complaint_type_breakdown.map((_,i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip content={<Tip />} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </motion.div>
            </div>

            {/* ── Language + Intent % bars ─────────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

              <motion.div variants={ITEM} className="card p-6">
                <SectionTitle title="Language Breakdown" sub="Detected language per conversation" />
                <div className="space-y-4 mt-2">
                  {data.language_breakdown.length === 0
                    ? <p className="text-slate-400 text-sm">No data yet.</p>
                    : data.language_breakdown.map((l,i) => {
                        const total = data.total_conversations || 1
                        const flag  = l.language==='ur' ? '🇵🇰 Urdu' : l.language==='roman_ur' ? '🇵🇰 Roman Urdu' : '🇬🇧 English'
                        return (
                          <ProgressBar key={i}
                            label={flag} value={l.count} max={total}
                            count={l.count} color={PIE_COLORS[i] || '#94a3b8'} />
                        )
                      })}
                </div>
              </motion.div>

              <motion.div variants={ITEM} className="card p-6">
                <SectionTitle title="Top Intent Percentages" sub="Share of each user intent" />
                <div className="space-y-4 mt-2">
                  {data.intent_breakdown.slice(0,5).map((item,i) => (
                    <ProgressBar key={i}
                      label={item.intent.replace(/_/g,' ')}
                      value={item.count}
                      max={data.intent_breakdown.reduce((a,b) => a+b.count, 0) || 1}
                      count={item.count}
                      color={INTENT_COLOR[item.intent] || PIE_COLORS[i]} />
                  ))}
                </div>
              </motion.div>
            </div>

            {/* ── Complaint status + Pickup status ─────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

              <motion.div variants={ITEM} className="card p-6">
                <SectionTitle title="Complaint Status" sub="Current resolution stage of all complaints" />
                <div className="space-y-4 mt-2">
                  {data.complaint_status_breakdown.length === 0
                    ? <p className="text-slate-400 text-sm">No complaints yet.</p>
                    : data.complaint_status_breakdown.map((s,i) => (
                        <ProgressBar key={i}
                          label={s.status} value={s.count} max={data.total_complaints || 1}
                          count={s.count} color={STATUS_CLR[s.status] || '#94a3b8'} />
                      ))}
                </div>
                <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                  <p className="text-xs text-slate-400">Resolution Rate: <span className="font-bold text-green-600 dark:text-green-400">{data.resolution_rate}%</span></p>
                </div>
              </motion.div>

              <motion.div variants={ITEM} className="card p-6">
                <SectionTitle title="Pickup Status" sub="Status of all scheduled pickups" />
                <div className="space-y-4 mt-2">
                  {data.pickup_breakdown.length === 0
                    ? <p className="text-slate-400 text-sm">No pickups yet.</p>
                    : data.pickup_breakdown.map((p,i) => (
                        <ProgressBar key={i}
                          label={p.status} value={p.count} max={data.total_pickups || 1}
                          count={p.count} color={PICKUP_CLR[p.status] || '#94a3b8'} />
                      ))}
                </div>
              </motion.div>
            </div>

            {/* ── Feedback distribution + Top cities ───────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

              <motion.div variants={ITEM} className="card p-6">
                <SectionTitle title="Feedback Distribution" sub="Star ratings submitted by users" />
                {data.feedback_distribution.length === 0
                  ? <p className="text-slate-400 text-sm text-center py-8">No feedback yet.</p>
                  : (
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={data.feedback_distribution} margin={{ left:-20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.4} />
                        <XAxis dataKey="rating" tick={{ fontSize:11, fill:'#94a3b8' }}
                          tickFormatter={v => '★'.repeat(v)} />
                        <YAxis tick={{ fontSize:11, fill:'#94a3b8' }} allowDecimals={false} />
                        <Tooltip content={<Tip />} />
                        <Bar dataKey="count" name="Responses" fill="#f59e0b" radius={[4,4,0,0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
              </motion.div>

              <motion.div variants={ITEM} className="card p-6">
                <SectionTitle title="Top Cities by Pickup" sub="Most active pickup cities" />
                {data.top_cities.length === 0
                  ? <p className="text-slate-400 text-sm text-center py-8">No pickup data yet.</p>
                  : (
                    <div className="space-y-3">
                      {data.top_cities.map((c,i) => {
                        const max = data.top_cities[0].count || 1
                        return (
                          <ProgressBar key={i}
                            label={c.city} value={c.count} max={max}
                            count={c.count} color={PIE_COLORS[i % PIE_COLORS.length]} />
                        )
                      })}
                    </div>
                  )}
              </motion.div>
            </div>

            {/* ── Recent complaints table ───────────────────────────────── */}
            {data.recent_complaints.length > 0 && (
              <motion.div variants={ITEM} className="card p-6">
                <SectionTitle title="Recent Complaints" sub="Last 5 complaints filed in the system" />
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 dark:border-slate-800">
                        {['Case ID','Tracking','Type','Status','Filed'].map(h => (
                          <th key={h} className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wide pb-3 pr-4">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                      {data.recent_complaints.map((c,i) => (
                        <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                          <td className="py-3 pr-4 font-mono text-xs text-blue-600 dark:text-blue-400 font-medium">{c.case_id}</td>
                          <td className="py-3 pr-4 font-mono text-xs text-slate-600 dark:text-slate-400">{c.tracking_number}</td>
                          <td className="py-3 pr-4 text-xs capitalize text-slate-700 dark:text-slate-300">{c.complaint_type?.replace(/_/g,' ')}</td>
                          <td className="py-3 pr-4"><ComplaintBadge status={c.status} /></td>
                          <td className="py-3 text-xs text-slate-400">{c.created_at ? new Date(c.created_at).toLocaleDateString('en-PK',{day:'numeric',month:'short'}) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                   </table>
                </div>
              </motion.div>
            )}

            {/* ── System health ─────────────────────────────────────────── */}
            <motion.div variants={ITEM} className="card p-6">
              <SectionTitle title="System Health" sub="Live status of all chatbot components" />
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { name:'NLP Pipeline',      icon:'🧠' },
                  { name:'FAISS Search',       icon:'🔍' },
                  { name:'Groq LLM',           icon:'⚡' },
                  { name:'PostgreSQL',         icon:'🗄️' },
                ].map((s,i) => (
                  <div key={i} className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4 text-center">
                    <div className="text-xl mb-2">{s.icon}</div>
                    <div className="w-2 h-2 rounded-full bg-green-500 mx-auto mb-2 animate-pulse" />
                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">{s.name}</p>
                    <p className="text-[10px] text-green-600 dark:text-green-400 mt-0.5">Operational</p>
                  </div>
                ))}
              </div>
            </motion.div>

          </motion.div>
        )}
      </div>
    </div>
  )
}