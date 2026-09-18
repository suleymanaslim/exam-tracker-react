import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

interface AdminState {
  isAdmin: boolean;
  impersonatedUserId: string | null;
  setIsAdmin: (isAdmin: boolean) => void;
  setImpersonatedUserId: (id: string | null) => void;
}

export const useAdminStore = create<AdminState>()(
  persist(
    (set) => ({
      isAdmin: false,
      impersonatedUserId: null,
      setIsAdmin: (isAdmin) => set({ isAdmin }),
      setImpersonatedUserId: (id) => set({ impersonatedUserId: id }),
    }),
    {
      name: 'admin-store',
      storage: createJSONStorage(() => sessionStorage),
    }
  )
)
