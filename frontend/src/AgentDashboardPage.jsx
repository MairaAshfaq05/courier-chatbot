import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from './useAuth'
import { agentAPI } from './api'

export default function AgentDashboardPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [pending, setPending] = useState([])
  const [loading, setLoading] = useState(true)
  const [accepting, setAccepting] = useState(null)

  useEffect(() => {
    if (!user?.is_agent) {
      navigate('/chat')
      return
    }
    fetchPending()
    const interval = setInterval(fetchPending, 5000)
    return () => clearInterval(interval)
  }, [user])

  const fetchPending = async () => {
    try {
      const res = await agentAPI.pendingEscalations()
      setPending(res.data.pending)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const acceptEscalation = async (escalationId, sessionId) => {
    setAccepting(escalationId)
    try {
      await agentAPI.acceptEscalation(escalationId)
      fetchPending()
    } catch (err) {
      alert('Failed to accept')
    } finally {
      setAccepting(null)
    }
  }

  if (!user?.is_agent) return null

  return (
    <div className="h-full overflow-y-auto p-6">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Agent Dashboard</h1>
      <p className="text-slate-500 mb-6">Pending escalation requests from customers</p>

      {loading ? (
        <div className="flex justify-center">Loading...</div>
      ) : pending.length === 0 ? (
        <div className="card p-8 text-center text-slate-400">No pending escalations</div>
      ) : (
        <div className="space-y-4">
          {pending.map(req => (
            <div key={req.id} className="card p-5">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white">
                    {req.user_name || 'Anonymous User'}
                  </h3>
                  <p className="text-sm text-slate-500">{req.user_email || 'No email'}</p>
                  <p className="text-xs text-slate-400 mt-1">
                    Requested at: {new Date(req.created_at).toLocaleString()}
                  </p>
                </div>
                <button
                  onClick={() => acceptEscalation(req.id, req.session_id)}
                  disabled={accepting === req.id}
                  className="btn-primary text-sm px-4 py-2"
                >
                  {accepting === req.id ? 'Accepting...' : 'Accept'}
                </button>
              </div>
              {req.last_tracking_number && (
                <div className="text-sm bg-slate-50 dark:bg-slate-800 p-2 rounded-lg mb-2">
                  <span className="font-semibold">Last tracking:</span> {req.last_tracking_number}
                </div>
              )}
              <div className="text-sm">
                <p className="font-semibold mb-1">Last messages:</p>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {req.last_messages.map((msg, i) => (
                    <div key={i} className="text-xs">
                      <span className="font-mono text-blue-600 dark:text-blue-400">{msg.role}:</span> {msg.content.substring(0, 100)}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}