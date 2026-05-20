import axios from 'axios'

const BASE = import.meta.env.VITE_API_URL || '/api'

const api = axios.create({
  baseURL: BASE,
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000,
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// ── Auth ──────────────────────────────────────────────
export const authAPI = {
  register: (data) => api.post('/auth/register', data),
  login:    (data) => api.post('/auth/login', data),
  me:       ()     => api.get('/auth/me'),
}

// ── Chat ──────────────────────────────────────────────
export const chatAPI = {
  send:      (session_id, message) => api.post('/chat/', { session_id, message }),
  history:   (session_id)          => api.get(`/chat/history/${session_id}`),
  escalate:  (session_id)          => api.post('/chat/escalate', { session_id }),
  streamUrl: (session_id, message) =>
    `${BASE}/chat/stream?session_id=${encodeURIComponent(session_id)}&message=${encodeURIComponent(message)}`,
  // Escalation status polling
  escalationStatus: (session_id) => api.get(`/chat/escalation/status/${session_id}`),
}

// ── Agent ──────────────────────────────────────────────
export const agentAPI = {
  status:    ()         => api.get('/chat/agents/status'),
  heartbeat: (agent_id) => api.post(`/chat/agents/heartbeat?agent_id=${agent_id}`),
  offline:   (agent_id) => api.post(`/chat/agents/offline?agent_id=${agent_id}`),
  pendingEscalations: () => api.get('/chat/escalation/pending'),
  acceptEscalation: (escalationId) => api.post(`/chat/escalation/accept/${escalationId}`),
}

// ── Shipments ─────────────────────────────────────────
export const shipmentAPI = {
  track: (tracking_number) => api.get(`/shipments/${tracking_number}`),
}

// ── Complaints ────────────────────────────────────────
export const complaintAPI = {
  create: (data)    => api.post('/complaints/', data),
  get:    (case_id) => api.get(`/complaints/case/${case_id}`),
  list:   ()        => api.get('/complaints/'),
}

// ── Pickups ───────────────────────────────────────────
export const pickupAPI = {
  create: (data)       => api.post('/pickups/', data),
  get:    (booking_id) => api.get(`/pickups/${booking_id}`),
  cancel: (booking_id) => api.delete(`/pickups/${booking_id}`),
}

// ── Feedback ──────────────────────────────────────────
export const feedbackAPI = {
  submit: (data) => api.post('/feedback/', data),
}

// ── Analytics ─────────────────────────────────────────
export const analyticsAPI = {
  summary: (days = 30) => api.get(`/analytics/summary?days=${days}`),
}

// ── QR / Refund ───────────────────────────────────────
export const qrAPI = {
  getShipment: (tracking_number) =>
    api.get(`/chat/qr/shipment/${tracking_number}`),
  submitFeedback: (tracking_number, data) =>
    api.post('/chat/qr/feedback', null, {
      params: {
        tracking_number,
        rating:          data.rating,
        delivery_speed:  data.delivery_speed,
        packaging:       data.packaging,
        rider_behaviour: data.rider_behaviour,
        accuracy:        data.accuracy,
        comment:         data.comment || undefined,
      },
    }),
  submitRefund: (tracking_number, reason, refund_type = 'full') =>
    api.post('/chat/qr/refund', null, {
      params: { tracking_number, reason, refund_type },
    }),
}