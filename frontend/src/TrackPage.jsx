import { useState } from 'react'
import { shipmentAPI } from './api'   // ✅ fixed import

const STATUS_STEPS = ['pending', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered']
const STATUS_LABELS = {
  pending: 'Pending', picked_up: 'Picked Up', in_transit: 'In Transit',
  out_for_delivery: 'Out for Delivery', delivered: 'Delivered'
}
const STATUS_ICONS = { pending: '🕐', picked_up: '📦', in_transit: '🚚', out_for_delivery: '🛵', delivered: '✅' }

export default function TrackPage() {
  const [trackNum, setTrackNum] = useState('')
  const [shipment, setShipment] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleTrack = async (e) => {
    e.preventDefault()
    if (!trackNum.trim()) return
    setLoading(true); setError(''); setShipment(null)
    try {
      const r = await shipmentAPI.track(trackNum.trim())
      setShipment(r.data)
    } catch (err) {
      setError(err.response?.status === 404 ? `No shipment found for "${trackNum}". Check your tracking number.` : 'Something went wrong. Please try again.')
    } finally { setLoading(false) }
  }

  const currentStep = shipment ? STATUS_STEPS.indexOf(shipment.status) : -1

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Track Shipment</h1>
        <p className="text-slate-500 text-sm mb-8">Enter your tracking number to get real-time status.</p>

        <form onSubmit={handleTrack} className="flex gap-3 mb-8">
          <input
            value={trackNum}
            onChange={e => setTrackNum(e.target.value.toUpperCase())}
            placeholder="e.g. PK2024001234"
            className="input flex-1 font-mono"
          />
          <button type="submit" disabled={loading} className="btn-primary px-6">
            {loading ? '⏳' : '🔍 Track'}
          </button>
        </form>

        <div className="flex gap-2 flex-wrap mb-6 -mt-4">
          {['PK2024001234', 'PK2024005678', 'PK2024009999'].map(n => (
            <button key={n} onClick={() => setTrackNum(n)} className="text-xs text-blue-600 underline font-mono">{n}</button>
          ))}
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 text-sm text-red-700 dark:text-red-300 mb-6">
            ❌ {error}
          </div>
        )}

        {shipment && (
          <div className="card p-6 animate-slide-up space-y-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-slate-400 mb-1">Tracking Number</p>
                <p className="font-mono font-bold text-lg text-slate-900 dark:text-white">{shipment.tracking_number}</p>
              </div>
              <span className="px-3 py-1 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-medium rounded-full">
                {STATUS_ICONS[shipment.status]} {STATUS_LABELS[shipment.status] || shipment.status}
              </span>
            </div>

            <div>
              <div className="flex justify-between mb-3">
                {STATUS_STEPS.map((step, i) => (
                  <div key={step} className="flex flex-col items-center gap-1.5 flex-1">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm border-2 transition-all ${
                      i <= currentStep
                        ? 'bg-blue-600 border-blue-600 text-white'
                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400'
                    }`}>
                      {i < currentStep ? '✓' : STATUS_ICONS[step]}
                    </div>
                    <span className={`text-xs text-center leading-tight ${i <= currentStep ? 'text-blue-600 dark:text-blue-400 font-medium' : 'text-slate-400'}`}>
                      {STATUS_LABELS[step]}
                    </span>
                  </div>
                ))}
              </div>
              <div className="relative h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full">
                <div
                  className="absolute h-full bg-blue-600 rounded-full transition-all duration-700"
                  style={{ width: `${Math.max(0, (currentStep / (STATUS_STEPS.length - 1)) * 100)}%` }}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-2">
              {[
                { label: 'From', value: shipment.origin },
                { label: 'To', value: shipment.destination },
                { label: 'Current Location', value: shipment.current_location },
                { label: 'Est. Delivery', value: shipment.estimated_delivery ? new Date(shipment.estimated_delivery).toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' }) : 'TBD' },
                { label: 'Sender', value: shipment.sender_name },
                { label: 'Receiver', value: shipment.receiver_name },
                { label: 'Weight', value: `${shipment.weight_kg} kg` },
              ].map(item => (
                <div key={item.label} className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3">
                  <p className="text-xs text-slate-400 mb-0.5">{item.label}</p>
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{item.value || '—'}</p>
                </div>
              ))}
            </div>

            {shipment.notes && (
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3 text-sm text-amber-700 dark:text-amber-300">
                📝 {shipment.notes}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}