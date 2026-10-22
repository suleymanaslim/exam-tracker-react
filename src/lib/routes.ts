import { lazy, type ComponentType } from 'react'
import { shouldRefreshRoute } from './routeRecovery'

function page<P extends object>(load: () => Promise<{ default: ComponentType<P> }>) {
  return lazy(async () => {
    try { return await load() }
    catch (error) {
      let retry = false
      try { retry = shouldRefreshRoute(error, window.sessionStorage, import.meta.url, navigator.onLine) } catch { /* Storage may be blocked. */ }
      if (retry) {
        window.location.reload()
        return new Promise<never>(() => {})
      }
      throw error
    }
  })
}

const loaders = {
  '/': () => import('../pages/Dashboard'),
  '/login': () => import('../pages/Login'),
  '/plan': () => import('../pages/Plan'),
  '/study': () => import('../pages/Study'),
  '/history': () => import('../pages/History'),
  '/stats': () => import('../pages/Stats'),
  '/settings': () => import('../pages/Settings'),
  '/topics': () => import('../pages/Topics'),
  '/monthly-plan': () => import('../pages/MonthlyPlan'),
  '/admin': () => import('../pages/Admin'),
  '/results': () => import('../pages/Results'),
  '/videos': () => import('../pages/VideoPlan'),
  '/questions': () => import('../pages/QuestionPlan'),
}
export const Dashboard = page(loaders['/'])
export const Login = page(loaders['/login'])
export const Plan = page(loaders['/plan'])
export const Study = page(loaders['/study'])
export const History = page(loaders['/history'])
export const Stats = page(loaders['/stats'])
export const Settings = page(loaders['/settings'])
export const Topics = page(loaders['/topics'])
export const MonthlyPlan = page(loaders['/monthly-plan'])
export const Admin = page(loaders['/admin'])
export const Results = page(loaders['/results'])
export const VideoPlan = page(loaders['/videos'])
export const QuestionPlan = page(loaders['/questions'])

// Load code on navigation intent, without fetching any account data or mounting a page.
export function preloadRoute(path: string) {
  const route = path === '/timed-mock-exam' ? '/study' : path
  const load = loaders[route as keyof typeof loaders]
  if (load) void load().catch(() => { /* The route boundary provides an explicit retry. */ })
}
