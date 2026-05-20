import { Outlet, NavLink, useLocation } from 'react-router-dom'
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from './useAuth'

const NAV = [
  { to: '/chat',       emoji: '💬', label: 'Chat',            desc: 'Talk to CourierBot', role: 'all' },
  { to: '/track',      emoji: '📦', label: 'Track Shipment',  desc: 'Real-time tracking', role: 'all' },
  { to: '/complaints', emoji: '📋', label: 'Complaints',      desc: 'File & manage cases', role: 'all' },
  { to: '/qr',         emoji: '📷', label: 'QR Scanner',      desc: 'Scan parcel QR code', role: 'all' },
  { to: '/analytics',  emoji: '📊', label: 'Analytics',       desc: 'Usage dashboard', role: 'agent' },
]

function Avatar({ name = '?' }) {
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  return (
    <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 flex items-center justify-center text-xs font-bold shrink-0">
      {initials}
    </div>
  )
}

function Sidebar({ dark, onDark }) {
  const { user, logout } = useAuth()
  const isAgent = user?.is_agent === true

  return (
    <aside className="w-64 flex flex-col bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 h-full shrink-0">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-700 rounded-2xl flex items-center justify-center shadow-md shadow-blue-500/20">
            <span className="text-white text-lg font-bold">C</span>
          </div>
          <div>
            <p className="font-bold text-slate-900 dark:text-white text-sm leading-tight">CourierBot</p>
            <p className="text-xs text-slate-400">AI Support System</p>
          </div>
        </div>
      </div>

      {/* Online status */}
      <div className="px-5 py-3 border-b border-slate-50 dark:border-slate-800/50">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-xs text-slate-500 dark:text-slate-400">All systems operational</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-3 mb-2">Navigation</p>
        {NAV.filter(item => item.role === 'all' || (item.role === 'agent' && isAgent)).map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-150 group ` +
              (isActive
                ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 font-semibold shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium')
            }
          >
            {({ isActive }) => (
              <>
                <span className={`text-base transition-transform duration-150 ${isActive ? 'scale-110' : 'group-hover:scale-110'}`}>
                  {item.emoji}
                </span>
                <div className="min-w-0">
                  <p className="leading-tight">{item.label}</p>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 font-normal leading-tight">{item.desc}</p>
                </div>
                {isActive && (
                  <div className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-500" />
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      { isAgent && (
        <NavLink
          to="/agent"
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-150 group ` +
            (isActive
              ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 font-semibold shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium')
          }
        >
          <span className="text-base">🧑‍💼</span>
          <div>
            <p className="leading-tight">Agent Dashboard</p>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 font-normal">Manage escalations</p>
          </div>
        </NavLink>
      )}

      {/* Footer */}
      <div className="px-3 pb-4 pt-3 border-t border-slate-100 dark:border-slate-800 space-y-1">
        <button
          onClick={onDark}
          className="btn-ghost w-full text-left text-sm flex items-center gap-3 text-slate-600 dark:text-slate-400"
        >
          <span>{dark ? '☀️' : '🌙'}</span>
          <span>{dark ? 'Light Mode' : 'Dark Mode'}</span>
        </button>

        {user ? (
          <div className="flex items-center gap-3 px-3 py-2.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl mt-1">
            <Avatar name={user.name} />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">{user.name}</p>
              <p className="text-[10px] text-slate-400 truncate">{user.email}</p>
              {isAgent && <span className="text-[10px] text-blue-500 font-medium mt-0.5 block">Agent</span>}
            </div>
            <button onClick={logout} className="text-[10px] text-red-500 hover:text-red-600 transition-colors font-medium shrink-0" title="Sign out">
              ↩
            </button>
          </div>
        ) : (
          <NavLink to="/login" className="btn-ghost w-full text-left text-sm flex items-center gap-3 text-slate-600 dark:text-slate-400">
            <span>🔑</span> Sign In
          </NavLink>
        )}
      </div>
    </aside>
  )
}

export default function Layout() {
  const [dark, setDark] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()

  const toggleDark = () => {
    setDark(d => !d)
    document.documentElement.classList.toggle('dark')
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-slate-950">
      <div className="hidden md:flex">
        <Sidebar dark={dark} onDark={toggleDark} />
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
              className="fixed inset-0 bg-black/40 z-30 md:hidden"
            />
            <motion.div
              initial={{ x: -280 }} animate={{ x: 0 }} exit={{ x: -280 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed left-0 top-0 h-full z-40 md:hidden"
            >
              <Sidebar dark={dark} onDark={toggleDark} />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="md:hidden flex items-center gap-3 px-4 py-3 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
          <button onClick={() => setMobileOpen(true)} className="btn-ghost p-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center text-white text-sm font-bold">C</div>
            <span className="font-bold text-slate-900 dark:text-white text-sm">CourierBot</span>
          </div>
        </div>
        <main className="flex-1 overflow-hidden page-enter" key={location.pathname}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}