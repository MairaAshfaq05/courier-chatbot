import { useState, useRef, useEffect, useCallback } from 'react'
import { v4 as uuidv4 } from 'uuid'
import ReactMarkdown from 'react-markdown'
import { feedbackAPI, chatAPI } from './api'
import { useAuth } from './useAuth'

const SESSION_KEY = 'chatbot_session_id'

const QUICK_ACTIONS = [
  { label: '📦 Track Package', msg: 'I want to track my shipment' },
  { label: '📋 File Complaint', msg: 'I want to file a complaint' },
  { label: '🗓️ Schedule Pickup', msg: 'I want to schedule a pickup' },
  { label: '🧑‍💼 Talk to Agent', msg: 'I want to speak to a human agent' },
]

function TypingIndicator() {
  return (
    <div className="flex items-end gap-2 animate-fade-in">
      <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0">CB</div>
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl rounded-bl-sm px-4 py-3">
        <div className="flex gap-1">
          <span className="typing-dot" style={{ animationDelay: '0ms' }} />
          <span className="typing-dot" style={{ animationDelay: '150ms' }} />
          <span className="typing-dot" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  )
}

function Message({ msg, onFeedback }) {
  const isBot = msg.role === 'bot'
  const isAgent = msg.role === 'agent'
  const [rated, setRated] = useState(null)

  const handleFeedback = async (rating) => {
    setRated(rating)
    if (msg.id) {
      try { await feedbackAPI.submit({ message_id: msg.id, rating }) } catch {}
    }
  }

  return (
    <div className={`flex items-end gap-2 animate-slide-up ${isBot || isAgent ? '' : 'flex-row-reverse'}`}>
      {(isBot || isAgent) && (
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 ${isAgent ? 'bg-green-600' : 'bg-blue-600'}`}>
          {isAgent ? 'AG' : 'CB'}
        </div>
      )}
      <div className={`max-w-[75%] ${isBot || isAgent ? '' : 'items-end'} flex flex-col`}>
        <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${
          isBot || isAgent
            ? 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-bl-sm text-slate-800 dark:text-slate-200'
            : 'bg-blue-600 text-white rounded-br-sm'
        }`}>
          {isBot || isAgent ? (
            <div className="chat-markdown">
              <ReactMarkdown>{msg.content}</ReactMarkdown>
            </div>
          ) : (
            <p>{msg.content}</p>
          )}
        </div>
        <div className={`flex items-center gap-2 mt-1 px-1 ${isBot ? '' : 'flex-row-reverse'}`}>
          <span className="text-xs text-slate-400">
            {new Date(msg.created_at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
          {isBot && !rated && (
            <div className="flex gap-1">
              <button onClick={() => handleFeedback(5)} className="text-xs hover:scale-125 transition-transform" title="Good response">👍</button>
              <button onClick={() => handleFeedback(1)} className="text-xs hover:scale-125 transition-transform" title="Bad response">👎</button>
            </div>
          )}
          {rated && <span className="text-xs text-slate-400">{rated === 5 ? '👍 Thanks!' : '👎 Noted'}</span>}
        </div>
      </div>
    </div>
  )
}

export default function ChatPage() {
  const { user } = useAuth()
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [streamingText, setStreamingText] = useState('')
  const [escalated, setEscalated] = useState(false)
  const [waitingForAgent, setWaitingForAgent] = useState(false)
  const [agentJoined, setAgentJoined] = useState(false)
  const sessionId = useRef(null)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)
  const eventSourceRef = useRef(null)

  // Generate or retrieve session ID based on user
  useEffect(() => {
    if (user) {
      sessionId.current = `user_${user.id}`
      localStorage.setItem(SESSION_KEY, sessionId.current)
    } else {
      let id = localStorage.getItem(SESSION_KEY)
      if (!id) { id = uuidv4(); localStorage.setItem(SESSION_KEY, id) }
      sessionId.current = id
    }

    if (sessionId.current) {
      chatAPI.history(sessionId.current).then(r => {
        if (r.data.messages?.length) setMessages(r.data.messages)
        if (r.data.is_escalated) setEscalated(true)
      }).catch(() => {})
    }
  }, [user])

  // Poll for escalation acceptance
  useEffect(() => {
    let interval
    if (waitingForAgent && !agentJoined) {
      interval = setInterval(async () => {
        try {
          const res = await chatAPI.escalationStatus(sessionId.current)
          if (res.data.escalated) {
            setWaitingForAgent(false)
            setAgentJoined(true)
            setEscalated(true)
            // Reload conversation to show agent's join message
            const historyRes = await chatAPI.history(sessionId.current)
            if (historyRes.data.messages?.length) {
              setMessages(historyRes.data.messages)
            }
          }
        } catch (err) {}
      }, 3000)
    }
    return () => clearInterval(interval)
  }, [waitingForAgent, agentJoined, sessionId.current])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingText])

  const clearChat = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
    if (user) {
      sessionId.current = `user_${user.id}_${Date.now()}`
      localStorage.setItem(SESSION_KEY, sessionId.current)
    } else {
      const newId = uuidv4()
      localStorage.setItem(SESSION_KEY, newId)
      sessionId.current = newId
    }
    setMessages([])
    setStreaming(false)
    setStreamingText('')
    setEscalated(false)
    setWaitingForAgent(false)
    setAgentJoined(false)
  }

  const sendMessage = useCallback(async (text) => {
    if (!text.trim() || streaming) return
    const userMsg = { role: 'user', content: text, created_at: new Date().toISOString() }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setStreaming(true)
    setStreamingText('')

    if (eventSourceRef.current) eventSourceRef.current.close()

    const url = chatAPI.streamUrl(sessionId.current, text)
    const es = new EventSource(url)
    eventSourceRef.current = es
    let accum = ''

    es.onmessage = (e) => {
      const data = JSON.parse(e.data)
      if (data.done) {
        es.close()
        setStreaming(false)
        const botMsg = {
          role: 'bot',
          content: accum,
          intent: data.intent,
          id: data.message_id,
          created_at: new Date().toISOString(),
          suggestions: data.suggestions,
        }
        setMessages(prev => [...prev, botMsg])
        setStreamingText('')
        if (data.intent === 'escalate') setEscalated(true)
      } else {
        accum += data.token
        setStreamingText(accum)
      }
    }
    es.onerror = () => {
      es.close()
      setStreaming(false)
      chatAPI.send(sessionId.current, text).then(r => {
        setMessages(prev => [...prev, {
          role: 'bot', content: r.data.reply, id: r.data.message_id, created_at: new Date().toISOString()
        }])
        setStreamingText('')
        if (r.data.intent === 'escalate') setEscalated(true)
      })
    }
  }, [streaming])

  const handleSubmit = (e) => {
    e.preventDefault()
    sendMessage(input)
  }

  const handleEscalate = async () => {
    if (escalated || waitingForAgent) return
    try {
      const r = await chatAPI.escalate(sessionId.current)
      if (r.data.escalated) {
        setEscalated(true)
        setAgentJoined(true)
        setWaitingForAgent(false)
        setMessages(prev => [...prev, {
          role: 'agent',
          content: `🧑‍💼 **Agent Connected**\n\n**${r.data.agent_name}** has joined the chat.\n**Ticket:** \`${r.data.ticket_number}\`\n\nHello! I'm ${r.data.agent_name}, a live support agent. I can see your conversation history. How can I help you today?`,
          created_at: new Date().toISOString(),
        }])
      } else {
        setWaitingForAgent(true)
        setMessages(prev => [...prev, {
          role: 'bot',
          content: `🧑‍💼 **Escalation requested**\n\nYour request has been sent to a human agent. Please wait — an agent will join shortly.\n\n**Ticket:** \`${r.data.ticket_number}\``,
          created_at: new Date().toISOString(),
        }])
      }
    } catch (err) {
      console.error(err)
      alert('Failed to escalate. Please try again.')
    }
  }

  const isEmpty = messages.length === 0 && !streaming

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold">CB</div>
            <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-white dark:border-slate-900" />
          </div>
          <div>
            <p className="font-semibold text-slate-900 dark:text-white text-sm">CourierBot AI</p>
            <p className="text-xs text-green-500">{escalated ? '🧑‍💼 Agent Connected' : waitingForAgent ? '⏳ Waiting for agent...' : '● Online — 24/7 Support'}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={clearChat}
            className="text-xs text-slate-500 hover:text-red-600 transition-colors border border-slate-200 dark:border-slate-700 px-3 py-1.5 rounded-lg hover:border-red-300"
            title="Clear chat history"
          >
            🗑️ Clear Chat
          </button>
          {!escalated && !waitingForAgent && (
            <button
              onClick={handleEscalate}
              className="text-xs text-slate-500 hover:text-blue-600 transition-colors border border-slate-200 dark:border-slate-700 px-3 py-1.5 rounded-lg hover:border-blue-300"
            >
              🧑‍💼 Human Agent
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {isEmpty && (
          <div className="flex flex-col items-center justify-center h-full text-center animate-fade-in">
            <div className="w-16 h-16 bg-blue-50 dark:bg-blue-900/30 rounded-2xl flex items-center justify-center text-3xl mb-4">🤖</div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">How can I help you?</h2>
            <p className="text-slate-500 text-sm mb-8 max-w-xs">Track shipments, file complaints, schedule pickups, or ask about our policies.</p>
            <div className="grid grid-cols-2 gap-2 w-full max-w-sm">
              {QUICK_ACTIONS.map(a => (
                <button
                  key={a.label}
                  onClick={() => sendMessage(a.msg)}
                  className="text-left px-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium text-slate-700 dark:text-slate-300 hover:border-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all duration-150"
                >
                  {a.label}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((msg, i) => <Message key={i} msg={msg} onFeedback={()=>{}} />)}
        {streaming && (
          streamingText
            ? <div className="flex items-end gap-2 animate-fade-in">
                <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0">CB</div>
                <div className="max-w-[75%] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl rounded-bl-sm px-4 py-3 text-sm text-slate-800 dark:text-slate-200">
                  <div className="chat-markdown"><ReactMarkdown>{streamingText}</ReactMarkdown></div>
                  <span className="inline-block w-0.5 h-4 bg-blue-500 animate-pulse ml-0.5 align-middle" />
                </div>
              </div>
            : <TypingIndicator />
        )}
        <div ref={bottomRef} />
      </div>

      {/* Suggestions */}
      {messages.length > 0 && messages[messages.length - 1]?.suggestions?.length > 0 && !streaming && (
        <div className="px-6 pb-2 flex gap-2 overflow-x-auto">
          {messages[messages.length - 1].suggestions.map((s, i) => (
            <button
              key={i}
              onClick={() => sendMessage(s)}
              className="shrink-0 text-xs px-3 py-1.5 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 rounded-full hover:bg-blue-100 transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="px-6 py-4 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800">
        <form onSubmit={handleSubmit} className="flex gap-3">
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Type your message… (e.g. Track PK2024001234)"
            className="input flex-1"
            disabled={streaming}
          />
          <button
            type="submit"
            disabled={!input.trim() || streaming}
            className="btn-primary px-5 flex items-center gap-2"
          >
            <span>{streaming ? '⏳' : '↑'}</span>
          </button>
        </form>
        <p className="text-xs text-slate-400 text-center mt-2">
          Try: <button onClick={() => sendMessage('Track PK2024001234')} className="underline hover:text-blue-500">Track PK2024001234</button>
          {' · '}
          <button onClick={() => sendMessage('What items are restricted?')} className="underline hover:text-blue-500">Restricted items</button>
          {' · '}
          <button onClick={clearChat} className="underline hover:text-red-500">Clear chat history</button>
        </p>
      </div>
    </div>
  )
}