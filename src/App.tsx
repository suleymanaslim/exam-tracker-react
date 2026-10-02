import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import type { Session } from '@supabase/supabase-js'

// Import Pages
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Plan from './pages/Plan'
import Study from './pages/Study'
import History from './pages/History'
import Stats from './pages/Stats'
import Settings from './pages/Settings'
import Topics from './pages/Topics'
import Admin from './pages/Admin'
import Results from './pages/Results'
import VideoPlan from './pages/VideoPlan'
import AppLayout from './components/AppLayout'

import { useGlobalTimer } from './lib/useGlobalTimer'

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  // Global timer — sayfa değişse de çalışmaya devam eder
  useGlobalTimer()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  if (loading) {
    return <div className="flex h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950 text-zinc-500">Yükleniyor...</div>
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route 
          path="/login" 
          element={!session ? <Login /> : <Navigate to="/" />} 
        />
        
        <Route
          path="/"
          element={session ? <AppLayout /> : <Navigate to="/login" />}
        >
          <Route index element={<Dashboard />} />
          <Route path="plan" element={<Plan />} />
          <Route path="study" element={<Study />} />
          <Route path="history" element={<History />} />
          <Route path="stats"     element={<Stats />} />
          <Route path="results"   element={<Results />} />
          <Route path="videos"    element={<VideoPlan />} />
          <Route path="topics"    element={<Topics />} />
          <Route path="settings"  element={<Settings />} />
          <Route path="admin"     element={<Admin />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
