import { useState, useEffect } from 'react'
import { complaintAPI } from './api'
import { useAuth } from './useAuth'

const COMPLAINT_TYPES = [
  { value: 'delay', label: '⏰ Delivery Delay' },
  { value: 'damage', label: '💔 Damaged Package' },
  { value: 'missing', label: '❓ Missing Package' },
  { value: 'wrong_item', label: '🔄 Wrong Item' },
  { value: 'other', label: '📝 Other Issue' },
]

const STATUS_COLORS = {
  open: 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300',
  investigating: 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300',
  resolved: 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300',
  closed: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
}

export default function ComplaintsPage() {
  const { user } = useAuth()
  const isAgent = user?.is_agent === true

  const [tab, setTab] = useState('file')
  const [form, setForm] = useState({ tracking_number: '', complaint_type: 'delay', description: '' })
  const [submitted, setSubmitted] = useState(null)
  const [loading, setLoading] = useState(false)
  const [complaints, setComplaints] = useState([])
  const [lookupId, setLookupId] = useState('')
  const [lookupResult, setLookupResult] = useState(null)
  const [lookupError, setLookupError] = useState('')

  useEffect(() => {
    if (tab === 'list') {
      complaintAPI.list().then(r => setComplaints(r.data)).catch(() => {})
    }
  }, [tab])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const r = await complaintAPI.create(form)
      setSubmitted(r.data)
      setForm({ tracking_number: '', complaint_type: 'delay', description: '' })
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to file complaint')
    } finally { setLoading(false) }
  }

  const handleLookup = async (e) => {
    e.preventDefault()
    setLookupError(''); setLookupResult(null)
    try {
      const r = await complaintAPI.get(lookupId)
      setLookupResult(r.data)
    } catch { setLookupError('Complaint not found. Check your Case ID.') }
  }

  // Build tabs array – "All Complaints" only for agents
  const tabs = [
    ['file', '📝 File Complaint'],
    ['lookup', '🔍 Lookup Case'],
  ]
  if (isAgent) {
    tabs.push(['list', '📋 All Complaints'])
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Complaints</h1>
        <p className="text-slate-500 text-sm mb-6">File a new complaint or track an existing one.</p>

        {/* Tabs */}
        <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl mb-8">
          {tabs.map(([id, label]) => (
            <button
              key={id}
              onClick={() => { setTab(id); setSubmitted(null) }}
              className={`flex-1 text-sm py-2 rounded-lg font-medium transition-all ${
                tab === id
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* File Complaint */}
        {tab === 'file' && (
          submitted ? (
            <div className="card p-6 text-center animate-slide-up">
              <div className="text-5xl mb-4">✅</div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Complaint Filed!</h2>
              <p className="text-slate-500 text-sm mb-4">Your complaint has been registered successfully.</p>
              <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4 mb-4 space-y-2 text-left">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Case ID</span>
                  <span className="font-mono font-bold text-blue-600">{submitted.case_id}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Type</span>
                  <span className="font-medium">{submitted.complaint_type}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Status</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[submitted.status]}`}>{submitted.status}</span>
                </div>
              </div>
              <p className="text-xs text-slate-400 mb-4">Save your Case ID — you'll need it to track this complaint.</p>
              <button onClick={() => setSubmitted(null)} className="btn-primary w-full">File Another Complaint</button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="card p-6 space-y-4 animate-fade-in">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Tracking Number *</label>
                <input
                  value={form.tracking_number}
                  onChange={e => setForm(f => ({ ...f, tracking_number: e.target.value.toUpperCase() }))}
                  placeholder="e.g. PK2024001234"
                  className="input font-mono"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Complaint Type *</label>
                <select value={form.complaint_type} onChange={e => setForm(f => ({ ...f, complaint_type: e.target.value }))} className="input">
                  {COMPLAINT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Description *</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Describe the issue in detail..."
                  rows={4}
                  className="input resize-none"
                  required
                  minLength={10}
                />
              </div>
              <button type="submit" disabled={loading} className="btn-primary w-full">
                {loading ? '⏳ Filing...' : '📋 File Complaint'}
              </button>
            </form>
          )
        )}

        {/* Lookup */}
        {tab === 'lookup' && (
          <div className="space-y-4 animate-fade-in">
            <form onSubmit={handleLookup} className="flex gap-3">
              <input value={lookupId} onChange={e => setLookupId(e.target.value.toUpperCase())} placeholder="e.g. CMP12345678" className="input flex-1 font-mono" />
              <button type="submit" className="btn-primary px-6">🔍 Lookup</button>
            </form>
            {lookupError && <p className="text-sm text-red-600">{lookupError}</p>}
            {lookupResult && (
              <div className="card p-5 animate-slide-up space-y-3">
                <div className="flex justify-between items-center">
                  <span className="font-mono font-bold text-blue-600">{lookupResult.case_id}</span>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[lookupResult.status]}`}>{lookupResult.status}</span>
                </div>
                <div className="text-sm space-y-1">
                  <p><span className="text-slate-500">Tracking:</span> <span className="font-mono">{lookupResult.tracking_number}</span></p>
                  <p><span className="text-slate-500">Type:</span> {lookupResult.complaint_type}</p>
                  <p><span className="text-slate-500">Filed:</span> {new Date(lookupResult.created_at).toLocaleDateString()}</p>
                  <p className="pt-2 text-slate-700 dark:text-slate-300">{lookupResult.description}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* List (visible only for agents) */}
        {tab === 'list' && isAgent && (
          <div className="space-y-3 animate-fade-in">
            {complaints.length === 0 && <p className="text-slate-400 text-sm text-center py-12">No complaints found.</p>}
            {complaints.map(c => (
              <div key={c.case_id} className="card p-4 hover:shadow-md transition-shadow">
                <div className="flex justify-between items-start mb-2">
                  <span className="font-mono text-sm font-bold text-blue-600">{c.case_id}</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[c.status]}`}>{c.status}</span>
                </div>
                <p className="text-xs text-slate-500 mb-1">Tracking: <span className="font-mono">{c.tracking_number}</span> · {c.complaint_type}</p>
                <p className="text-sm text-slate-700 dark:text-slate-300 line-clamp-2">{c.description}</p>
                <p className="text-xs text-slate-400 mt-2">{new Date(c.created_at).toLocaleDateString()}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}