import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { qrAPI } from './api'

// ── Star Rating Component ─────────────────────────────────────────────────────
function StarRating({ label, value, onChange, description }) {
  return (
    <div className="mb-5">
      <div className="flex justify-between items-center mb-1">
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">{label}</p>
        {value > 0 && (
          <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">
            {['','Poor','Fair','Good','Very Good','Excellent'][value]}
          </span>
        )}
      </div>
      {description && <p className="text-xs text-slate-400 mb-2">{description}</p>}
      <div className="flex gap-2">
        {[1,2,3,4,5].map(s => (
          <button
            key={s}
            onClick={() => onChange(s)}
            className={`flex-1 py-2.5 rounded-xl text-lg transition-all duration-150 active:scale-95 ${
              s <= value
                ? 'bg-amber-400 text-white shadow-sm shadow-amber-200'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-400 hover:bg-amber-100 dark:hover:bg-amber-900/20'
            }`}
          >
            ★
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Shipment Status Badge ─────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const cfg = {
    PENDING:          { emoji: '🕐', bg: 'bg-slate-100 dark:bg-slate-800',   text: 'text-slate-600 dark:text-slate-400',   label: 'Pending' },
    PICKED_UP:        { emoji: '📦', bg: 'bg-blue-50 dark:bg-blue-900/30',   text: 'text-blue-700 dark:text-blue-300',     label: 'Picked Up' },
    IN_TRANSIT:       { emoji: '🚚', bg: 'bg-indigo-50 dark:bg-indigo-900/30', text: 'text-indigo-700 dark:text-indigo-300', label: 'In Transit' },
    OUT_FOR_DELIVERY: { emoji: '🛵', bg: 'bg-orange-50 dark:bg-orange-900/30', text: 'text-orange-700 dark:text-orange-300', label: 'Out for Delivery' },
    DELIVERED:        { emoji: '✅', bg: 'bg-green-50 dark:bg-green-900/30',  text: 'text-green-700 dark:text-green-300',   label: 'Delivered' },
    FAILED:           { emoji: '❌', bg: 'bg-red-50 dark:bg-red-900/30',     text: 'text-red-700 dark:text-red-300',       label: 'Failed' },
    RETURNED:         { emoji: '↩️', bg: 'bg-amber-50 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-300',   label: 'Returned' },
  }
  const c = cfg[status] || cfg.PENDING
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold ${c.bg} ${c.text}`}>
      {c.emoji} {c.label}
    </span>
  )
}

// ── Feedback Modal ────────────────────────────────────────────────────────────
function FeedbackModal({ shipment, onClose, onSubmit }) {
  const [ratings, setRatings] = useState({
    rating: 0, delivery_speed: 0, packaging: 0, rider_behaviour: 0, accuracy: 0,
  })
  const [comment, setComment]   = useState('')
  const [loading, setLoading]   = useState(false)
  const [done, setDone]         = useState(false)

  const set = (k) => (v) => setRatings(r => ({ ...r, [k]: v }))

  const handleSubmit = async () => {
    if (ratings.rating === 0) return
    setLoading(true)
    try {
      await onSubmit({ ...ratings, comment: comment.trim() || undefined })
      setDone(true)
    } catch (e) {
      alert('Failed to submit. Please try again.')
    } finally { setLoading(false) }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <motion.div
        initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
        exit={{ y: 80, opacity: 0 }}
        transition={{ type: 'spring', damping: 28, stiffness: 200 }}
        className="w-full sm:max-w-md bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden"
      >
        {/* Handle bar (mobile) */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 bg-slate-200 dark:bg-slate-700 rounded-full" />
        </div>

        <div className="px-6 pt-4 pb-6 max-h-[90vh] overflow-y-auto">
          {done ? (
            <div className="text-center py-8">
              <div className="text-6xl mb-4">🎉</div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Thank You!</h2>
              <p className="text-slate-500 text-sm mb-6">Your feedback helps us deliver better service.</p>
              <button onClick={onClose} className="btn-primary w-full">Done</button>
            </div>
          ) : (
            <>
              <div className="flex justify-between items-start mb-5">
                <div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">Rate Your Delivery</h2>
                  <p className="text-xs text-slate-400 mt-0.5 font-mono">{shipment.tracking_number}</p>
                </div>
                <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">✕</button>
              </div>

              <StarRating label="Overall Experience *" value={ratings.rating} onChange={set('rating')}
                description="How was your overall experience?" />
              <StarRating label="Delivery Speed" value={ratings.delivery_speed} onChange={set('delivery_speed')}
                description="Was the package delivered on time?" />
              <StarRating label="Packaging Condition" value={ratings.packaging} onChange={set('packaging')}
                description="Was your package well-protected?" />
              <StarRating label="Rider Behaviour" value={ratings.rider_behaviour} onChange={set('rider_behaviour')}
                description="Was our delivery rider professional?" />
              <StarRating label="Item Accuracy" value={ratings.accuracy} onChange={set('accuracy')}
                description="Did you receive the correct item?" />

              <div className="mb-6">
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  Additional Comments (optional)
                </label>
                <textarea
                  value={comment}
                  onChange={e => setComment(e.target.value)}
                  placeholder="Tell us more about your experience…"
                  rows={3}
                  className="input resize-none text-sm"
                />
              </div>

              {ratings.rating === 0 && (
                <p className="text-xs text-red-500 mb-3 text-center">Please rate your overall experience to continue.</p>
              )}

              <button
                onClick={handleSubmit}
                disabled={loading || ratings.rating === 0}
                className="btn-primary w-full"
              >
                {loading ? '⏳ Submitting…' : '⭐ Submit Feedback'}
              </button>
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}

// ── Refund Modal ──────────────────────────────────────────────────────────────
function RefundModal({ shipment, onClose, onSubmit }) {
  const [refundType, setRefundType] = useState('full')
  const [reason, setReason]         = useState('')
  const [loading, setLoading]       = useState(false)
  const [done, setDone]             = useState(false)
  const [result, setResult]         = useState(null)

  const handleSubmit = async () => {
    if (!reason.trim()) return
    setLoading(true)
    try {
      const res = await onSubmit(reason.trim(), refundType)
      setResult(res)
      setDone(true)
    } catch (e) {
      alert('Failed to submit. Please try again.')
    } finally { setLoading(false) }
  }

  const types = [
    { value: 'full',     label: '💰 Full Refund',      desc: 'Return item and get full refund' },
    { value: 'partial',  label: '💵 Partial Refund',    desc: 'Keep item, get partial compensation' },
    { value: 'exchange', label: '🔄 Exchange',          desc: 'Replace with correct or new item' },
  ]

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <motion.div
        initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
        exit={{ y: 80, opacity: 0 }}
        transition={{ type: 'spring', damping: 28, stiffness: 200 }}
        className="w-full sm:max-w-md bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden"
      >
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 bg-slate-200 dark:bg-slate-700 rounded-full" />
        </div>
        <div className="px-6 pt-4 pb-6 max-h-[90vh] overflow-y-auto">
          {done ? (
            <div className="text-center py-8">
              <div className="text-6xl mb-4">✅</div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Request Submitted!</h2>
              <p className="text-slate-500 text-sm mb-2">{result?.message}</p>
              <p className="text-xs text-slate-400 mb-6">Request ID: <span className="font-mono text-blue-600">#{result?.refund_id}</span></p>
              <button onClick={onClose} className="btn-primary w-full">Done</button>
            </div>
          ) : (
            <>
              <div className="flex justify-between items-start mb-5">
                <div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">Refund / Exchange</h2>
                  <p className="text-xs text-slate-400 mt-0.5 font-mono">{shipment.tracking_number}</p>
                </div>
                <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">✕</button>
              </div>

              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Request Type</p>
              <div className="space-y-2 mb-5">
                {types.map(t => (
                  <button
                    key={t.value}
                    onClick={() => setRefundType(t.value)}
                    className={`w-full text-left px-4 py-3 rounded-xl border-2 transition-all duration-150 ${
                      refundType === t.value
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-slate-200 dark:border-slate-700 hover:border-blue-300'
                    }`}
                  >
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{t.label}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{t.desc}</p>
                  </button>
                ))}
              </div>

              <div className="mb-6">
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  Reason *
                </label>
                <textarea
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  placeholder="Describe why you want a refund or exchange…"
                  rows={3}
                  className="input resize-none text-sm"
                  required
                />
              </div>

              <button
                onClick={handleSubmit}
                disabled={loading || !reason.trim()}
                className="btn-primary w-full"
              >
                {loading ? '⏳ Submitting…' : '📤 Submit Request'}
              </button>
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}

// ── Main QR Scanner Page ──────────────────────────────────────────────────────
export default function QRScannerPage() {
  const [scanning, setScanning]       = useState(false)
  const [manualInput, setManualInput] = useState('')
  const [shipment, setShipment]       = useState(null)
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState('')
  const [modal, setModal]             = useState(null) // 'feedback' | 'refund'
  const [isMobile, setIsMobile]       = useState(false)
  const videoRef                      = useRef(null)
  const canvasRef                     = useRef(null)
  const streamRef                     = useRef(null)
  const scanIntervalRef               = useRef(null)

  useEffect(() => {
    setIsMobile(/iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || window.innerWidth < 768)
    return () => stopCamera()
  }, [])

  // ── Camera & QR scanning ──────────────────────────────────────────────────
  const startCamera = async () => {
    setError('')
    setScanning(true)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        }
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.play()
        startQRScanning()
      }
    } catch (e) {
      setScanning(false)
      setError('Camera access denied. Please use manual input below or allow camera permission in your browser settings.')
    }
  }

  const stopCamera = () => {
    if (scanIntervalRef.current) clearInterval(scanIntervalRef.current)
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    setScanning(false)
  }

  const startQRScanning = () => {
    // Use BarcodeDetector API (Chrome/Edge/Android) — best for production
    if ('BarcodeDetector' in window) {
      const detector = new window.BarcodeDetector({ formats: ['qr_code', 'code_128', 'code_39', 'ean_13'] })
      scanIntervalRef.current = setInterval(async () => {
        if (!videoRef.current || videoRef.current.readyState < 2) return
        try {
          const barcodes = await detector.detect(videoRef.current)
          if (barcodes.length > 0) {
            const value = barcodes[0].rawValue.trim()
            stopCamera()
            handleQRResult(value)
          }
        } catch {}
      }, 300)
      return
    }

    // Fallback: canvas + jsQR (loaded dynamically)
    scanIntervalRef.current = setInterval(async () => {
      if (!videoRef.current || !canvasRef.current || videoRef.current.readyState < 2) return
      const canvas = canvasRef.current
      const ctx    = canvas.getContext('2d')
      canvas.width  = videoRef.current.videoWidth
      canvas.height = videoRef.current.videoHeight
      ctx.drawImage(videoRef.current, 0, 0)
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      try {
        // Dynamic import jsQR
        const jsQR = (await import('https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js')).default
        const code = jsQR(imageData.data, imageData.width, imageData.height)
        if (code) {
          stopCamera()
          handleQRResult(code.data.trim())
        }
      } catch {}
    }, 400)
  }

  // ── Handle scanned / entered tracking number ──────────────────────────────
  const handleQRResult = async (value) => {
    // Extract tracking number from various QR formats
    // QR might contain just "PK2024001234" or a URL like "https://courierbot.pk/track/PK2024001234"
    const trackingMatch = value.match(/([A-Z]{2,3}\d{8,12}|\d{10,14})/)
    const trackingNumber = trackingMatch ? trackingMatch[1] : value.toUpperCase()

    setManualInput(trackingNumber)
    await fetchShipment(trackingNumber)
  }

  const fetchShipment = async (trackingNumber) => {
    if (!trackingNumber.trim()) return
    setLoading(true); setError(''); setShipment(null)
    try {
      const r = await qrAPI.getShipment(trackingNumber.trim().toUpperCase())
      setShipment(r.data)
    } catch (e) {
      setError(
        e.response?.status === 404
          ? `No shipment found for "${trackingNumber}". Check the tracking number.`
          : 'Could not fetch shipment details. Please try again.'
      )
    } finally { setLoading(false) }
  }

  const handleManualSubmit = (e) => {
    e.preventDefault()
    fetchShipment(manualInput)
  }

  // ── Feedback & Refund handlers ─────────────────────────────────────────────
  const handleFeedbackSubmit = async (data) => {
    const res = await qrAPI.submitFeedback(shipment.tracking_number, data)
    return res.data
  }

  const handleRefundSubmit = async (reason, refundType) => {
    const res = await qrAPI.submitRefund(shipment.tracking_number, reason, refundType)
    return res.data
  }

  // ── Shipment detail card ───────────────────────────────────────────────────
  const isDelivered = shipment?.status === 'DELIVERED'

  return (
    <div className="h-full overflow-y-auto bg-slate-50 dark:bg-slate-950">
      <div className="max-w-lg mx-auto px-4 py-6">

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">QR Scanner</h1>
          <p className="text-slate-400 text-sm mt-1">
            Scan a parcel QR code or enter tracking number to verify delivery details
          </p>
        </div>

        {/* Scanner area */}
        <div className="card p-5 mb-5">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4 flex items-center gap-2">
            <span>📷</span> Scan QR Code
          </h2>

          {!scanning ? (
            <div className="space-y-3">
              <button
                onClick={startCamera}
                className="btn-primary w-full flex items-center justify-center gap-2 py-3"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {isMobile ? 'Open Camera & Scan QR' : 'Scan with Webcam'}
              </button>
              {!isMobile && (
                <p className="text-xs text-slate-400 text-center">
                  📱 On mobile, point your camera at the parcel's QR code for instant scanning
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {/* Video viewfinder */}
              <div className="relative bg-black rounded-2xl overflow-hidden" style={{ aspectRatio: '4/3' }}>
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  autoPlay
                  className="w-full h-full object-cover"
                />
                <canvas ref={canvasRef} className="hidden" />

                {/* Scanning overlay */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="relative w-48 h-48">
                    {/* Corner brackets */}
                    {['tl','tr','bl','br'].map(c => (
                      <div key={c} className={`absolute w-8 h-8 border-blue-400 border-4 ${
                        c==='tl' ? 'top-0 left-0 border-b-0 border-r-0 rounded-tl-lg' :
                        c==='tr' ? 'top-0 right-0 border-b-0 border-l-0 rounded-tr-lg' :
                        c==='bl' ? 'bottom-0 left-0 border-t-0 border-r-0 rounded-bl-lg' :
                        'bottom-0 right-0 border-t-0 border-l-0 rounded-br-lg'
                      }`} />
                    ))}
                    {/* Scanning line animation */}
                    <motion.div
                      className="absolute left-2 right-2 h-0.5 bg-blue-400 shadow-lg shadow-blue-400/50"
                      animate={{ top: ['10%', '90%', '10%'] }}
                      transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                    />
                  </div>
                </div>

                {/* Scanning label */}
                <div className="absolute bottom-3 inset-x-0 text-center">
                  <span className="bg-black/60 text-white text-xs px-3 py-1.5 rounded-full backdrop-blur-sm">
                    Point at QR code on parcel
                  </span>
                </div>
              </div>

              <button onClick={stopCamera} className="w-full py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                ✕ Cancel Scanning
              </button>
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="flex items-center gap-3 mb-5">
          <div className="flex-1 h-px bg-slate-200 dark:bg-slate-800" />
          <span className="text-xs text-slate-400 font-medium">OR ENTER MANUALLY</span>
          <div className="flex-1 h-px bg-slate-200 dark:bg-slate-800" />
        </div>

        {/* Manual input */}
        <form onSubmit={handleManualSubmit} className="flex gap-2 mb-6">
          <input
            value={manualInput}
            onChange={e => setManualInput(e.target.value.toUpperCase())}
            placeholder="e.g. PK2024001234"
            className="input flex-1 font-mono text-sm"
          />
          <button type="submit" disabled={loading || !manualInput.trim()} className="btn-primary px-5 shrink-0">
            {loading ? '⏳' : '→'}
          </button>
        </form>

        {/* Quick demo */}
        <div className="flex flex-wrap gap-2 mb-6 -mt-3">
          <p className="w-full text-xs text-slate-400">Try demo tracking numbers:</p>
          {['PK2024001234','PK2024009999','PK2024005678'].map(n => (
            <button key={n} onClick={() => { setManualInput(n); fetchShipment(n) }}
              className="text-xs font-mono text-blue-600 dark:text-blue-400 underline hover:no-underline">
              {n}
            </button>
          ))}
        </div>

        {/* Error */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-4 mb-5 text-sm text-red-700 dark:text-red-300"
            >
              ❌ {error}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Loading */}
        {loading && (
          <div className="card p-8 text-center mb-5">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-slate-400">Fetching shipment details…</p>
          </div>
        )}

        {/* Shipment details */}
        <AnimatePresence>
          {shipment && !loading && (
            <motion.div
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              {/* Main card */}
              <div className="card p-5">
                <div className="flex items-start justify-between mb-4 flex-wrap gap-2">
                  <div>
                    <p className="text-xs text-slate-400 mb-0.5">Tracking Number</p>
                    <p className="font-mono font-bold text-slate-900 dark:text-white text-lg leading-none">
                      {shipment.tracking_number}
                    </p>
                  </div>
                  <StatusBadge status={shipment.status} />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'From',              value: shipment.origin },
                    { label: 'To',                value: shipment.destination },
                    { label: 'Current Location',  value: shipment.current_location || 'Updating…' },
                    { label: 'Est. Delivery',     value: shipment.estimated_delivery ? new Date(shipment.estimated_delivery).toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' }) : 'TBD' },
                    { label: 'Sender',            value: shipment.sender_name },
                    { label: 'Receiver',          value: shipment.receiver_name },
                    { label: 'Weight',            value: `${shipment.weight_kg} kg` },
                    { label: 'Shipped On',        value: shipment.created_at ? new Date(shipment.created_at).toLocaleDateString('en-PK', { day: 'numeric', month: 'short' }) : '—' },
                  ].map(item => (
                    <div key={item.label} className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3">
                      <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-0.5">{item.label}</p>
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">{item.value}</p>
                    </div>
                  ))}
                </div>

                {shipment.notes && (
                  <div className="mt-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3 text-sm text-amber-700 dark:text-amber-300">
                    📝 {shipment.notes}
                  </div>
                )}

                {/* Active complaints */}
                {shipment.complaints?.length > 0 && (
                  <div className="mt-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3">
                    <p className="text-xs font-semibold text-red-700 dark:text-red-300 mb-1">⚠️ Active Complaints</p>
                    {shipment.complaints.map((c, i) => (
                      <p key={i} className="text-xs text-red-600 dark:text-red-400 font-mono">
                        {c.case_id} · {c.complaint_type?.replace('_',' ')} · {c.status}
                      </p>
                    ))}
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div className="grid grid-cols-2 gap-3">
                {/* Feedback — always available for delivered */}
                <button
                  onClick={() => setModal('feedback')}
                  className={`flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all duration-150 active:scale-95 ${
                    isDelivered
                      ? 'border-amber-300 bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  <span className="text-3xl">⭐</span>
                  <div className="text-center">
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Rate Delivery</p>
                    <p className="text-[10px] text-slate-400">Share your experience</p>
                  </div>
                </button>

                {/* Refund/Exchange */}
                <button
                  onClick={() => setModal('refund')}
                  className="flex flex-col items-center gap-2 p-4 rounded-2xl border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all duration-150 active:scale-95"
                >
                  <span className="text-3xl">🔄</span>
                  <div className="text-center">
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Refund / Exchange</p>
                    <p className="text-[10px] text-slate-400">Request return or swap</p>
                  </div>
                </button>
              </div>

              {/* Delivered confirmation */}
              {isDelivered && (
                <div className="card p-4 bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-900">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">✅</span>
                    <div>
                      <p className="text-sm font-bold text-green-700 dark:text-green-400">Package Delivered!</p>
                      <p className="text-xs text-green-600 dark:text-green-500">
                        Delivered on {shipment.actual_delivery
                          ? new Date(shipment.actual_delivery).toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' })
                          : 'recently'}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Scan another */}
              <button
                onClick={() => { setShipment(null); setManualInput(''); setError('') }}
                className="w-full py-3 text-sm text-slate-500 hover:text-blue-600 transition-colors border border-slate-200 dark:border-slate-700 rounded-2xl hover:border-blue-300"
              >
                🔍 Scan Another Parcel
              </button>
            </motion.div>
          )}
        </AnimatePresence>

      </div>

      {/* Modals */}
      <AnimatePresence>
        {modal === 'feedback' && shipment && (
          <FeedbackModal
            shipment={shipment}
            onClose={() => setModal(null)}
            onSubmit={handleFeedbackSubmit}
          />
        )}
        {modal === 'refund' && shipment && (
          <RefundModal
            shipment={shipment}
            onClose={() => setModal(null)}
            onSubmit={handleRefundSubmit}
          />
        )}
      </AnimatePresence>
    </div>
  )
}