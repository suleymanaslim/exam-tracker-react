import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Suspense, useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import type { Session } from '@supabase/supabase-js'

import { Login, Dashboard, Plan, Study, History, Stats, Settings, Topics, MonthlyPlan, Admin, Results, VideoPlan, QuestionPlan } from './lib/routes'
import AppLayout from './components/AppLayout'
import RouteBoundary from './components/RouteBoundary'

import { useGlobalTimer } from './lib/useGlobalTimer'

function TimerRuntime({ userId }: { userId: string | null }) {
  useGlobalTimer(userId)
  return null
}

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)


  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  if (loading) {
    return <div className="flex h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950 text-zinc-500">Yükleniyor...</div>
  }

  return (
    <BrowserRouter>
      <TimerRuntime userId={session?.user.id || null} />
      <RouteBoundary><Suspense fallback={<div className="route-loading" role="status">Sayfa hazırlanıyor…</div>}>
      <Routes>
        <Route 
          path="/login" 
          element={!session ? <Login /> : <Navigate to="/" />} 
        />
        
        <Route
          path="/"
          element={session ? <AppLayout userId={session.user.id} /> : <Navigate to="/login" />}
        >
          <Route index element={<Dashboard />} />
          <Route path="plan" element={<Plan />} />
          <Route path="study" element={<Study />} />
          <Route path="timed-mock-exam" element={<Study mockExam />} />
          <Route path="history" element={<History />} />
          <Route path="stats"     element={<Stats />} />
          <Route path="results"   element={<Results />} />
          <Route path="videos"    element={<VideoPlan />} />
          <Route path="questions" element={<QuestionPlan />} />
          <Route path="topics"    element={<Topics />} />
          <Route path="monthly-plan" element={<MonthlyPlan />} />
          <Route path="settings"  element={<Settings />} />
          <Route path="admin"     element={<Admin />} />
        </Route>
      </Routes>
      </Suspense></RouteBoundary>
    </BrowserRouter>
  )
}

export default App
