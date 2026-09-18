import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

interface SettingsState {
  offDay: number;
  setOffDay: (day: number) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      offDay: 7, // Default is Sunday (7)
      setOffDay: (day) => set({ offDay: day }),
    }),
    {
      name: 'user-settings',
      storage: createJSONStorage(() => localStorage),
    }
  )
)
