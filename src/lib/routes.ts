import { lazy } from 'react'

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
export const Dashboard = lazy(loaders['/'])
export const Login = lazy(loaders['/login'])
export const Plan = lazy(loaders['/plan'])
export const Study = lazy(loaders['/study'])
export const History = lazy(loaders['/history'])
export const Stats = lazy(loaders['/stats'])
export const Settings = lazy(loaders['/settings'])
export const Topics = lazy(loaders['/topics'])
export const MonthlyPlan = lazy(loaders['/monthly-plan'])
export const Admin = lazy(loaders['/admin'])
export const Results = lazy(loaders['/results'])
export const VideoPlan = lazy(loaders['/videos'])
export const QuestionPlan = lazy(loaders['/questions'])

// Load code on navigation intent, without fetching any account data or mounting a page.
export function preloadRoute(path: string) {
  const route = path === '/timed-mock-exam' ? '/study' : path
  const load = loaders[route as keyof typeof loaders]
  if (load) void load().catch(() => { /* The route boundary provides an explicit retry. */ })
}
