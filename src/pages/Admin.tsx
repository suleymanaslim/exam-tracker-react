import { useEffect, useRef, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useAdminStore } from '../lib/adminStore'
import { createClient, FunctionsHttpError } from '@supabase/supabase-js'
import Swal from 'sweetalert2'
import { Users, UserPlus, LogIn, XCircle, ShieldCheck, KeyRound, Eye, X, CalendarDays } from 'lucide-react'
import './Admin.css'
import { profileNameLabel } from '../lib/profileName'
import { useNavigate } from 'react-router-dom'
import { communityPreferences, communitySettingsError } from '../lib/communityVisibility'
import type { CommunityPreferences } from '../lib/communityVisibility'

// Yeni kullanıcı oluşturmak için session bozmayan secondary client
// Bu client sadece create işlemi için kullanılır.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

const supabaseSecondary = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { storageKey: 'temp_admin_create', persistSession: false, autoRefreshToken: false }
})

interface Profile { id: string; display_name: string | null; email: string | null; role: string }

export default function Admin() {
  const { isAdmin, impersonatedUserId, setImpersonatedUserId } = useAdminStore()
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()
  const passwordDialog = useRef<HTMLDialogElement>(null)
  const passwordBusy = useRef(false)
  const passwordTrigger = useRef<HTMLButtonElement | null>(null)
  const [passwordUser, setPasswordUser] = useState<Profile | null>(null)
  const [changedPassword, setChangedPassword] = useState('')
  const [confirmedPassword, setConfirmedPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)
  const [visibilityPreferences, setVisibilityPreferences] = useState<Record<string, CommunityPreferences>>({})
  const [visibilityReady, setVisibilityReady] = useState(false)
  const [visibilityLoadError, setVisibilityLoadError] = useState('')
  const visibilityDialog = useRef<HTMLDialogElement>(null)
  const visibilityTrigger = useRef<HTMLButtonElement | null>(null)
  const visibilityBusy = useRef(false)
  const [visibilityUser, setVisibilityUser] = useState<Profile | null>(null)
  const [showCommunity, setShowCommunity] = useState(true)
  const [shareStatistics, setShareStatistics] = useState(true)
  const [visibilityError, setVisibilityError] = useState('')
  const [savingVisibility, setSavingVisibility] = useState(false)

  // New user form
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    if (!isAdmin) {
      navigate('/')
      return
    }
    loadProfiles()
  }, [isAdmin, navigate])

  async function loadProfiles() {
    setLoading(true)
    setVisibilityReady(false); setVisibilityLoadError('')
    try {
      const [profileResult, preferences] = await Promise.all([
        supabase.from('profiles').select('*').order('role', { ascending: false }).order('display_name'),
        supabase.from('dashboard_community_preferences').select('user_id,show_widget,share_statistics'),
      ])
      if (profileResult.error) throw profileResult.error
      if (profileResult.data) setProfiles(profileResult.data)
      if (preferences.error) throw preferences.error
      const rows = (preferences.data || []).map(communityPreferences)
      setVisibilityPreferences(Object.fromEntries(rows.map(row => [row.user_id, row])))
      setVisibilityReady(true)
    } catch (error) { setVisibilityLoadError(communitySettingsError(error)) }
    finally { setLoading(false) }
  }

  const openVisibilityDialog = (profile: Profile, trigger: HTMLButtonElement) => {
    if (!visibilityReady) return
    const settings = visibilityPreferences[profile.id]
    visibilityTrigger.current = trigger
    setVisibilityUser(profile); setShowCommunity(settings?.show_widget ?? true)
    setShareStatistics(settings?.share_statistics ?? true); setVisibilityError('')
    visibilityDialog.current?.showModal()
  }
  const closeVisibilityDialog = () => {
    if (visibilityBusy.current) return
    visibilityDialog.current?.close()
    setVisibilityUser(null); setVisibilityError('')
    visibilityTrigger.current?.focus()
  }
  const saveVisibility = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!visibilityUser || visibilityBusy.current) return
    const userId = visibilityUser.id
    visibilityBusy.current = true; setSavingVisibility(true); setVisibilityError('')
    let success = false
    try {
      const { data, error } = await supabase.rpc('set_dashboard_community_preferences', {
        p_user_id: userId, p_show_widget: showCommunity, p_share_statistics: shareStatistics,
      })
      if (error) throw error
      const settings = communityPreferences(data)
      if (settings.user_id !== userId || settings.show_widget !== showCommunity || settings.share_statistics !== shareStatistics) throw new Error('Save not confirmed')
      setVisibilityPreferences(previous => ({ ...previous, [userId]: settings }))
      window.dispatchEvent(new Event('community-visibility-updated'))
      try { localStorage.setItem('examtracker-community-updated', String(Date.now())) } catch { /* Other tabs refresh on focus. */ }
      success = true
    } catch (error) { setVisibilityError(communitySettingsError(error)) }
    finally { visibilityBusy.current = false; setSavingVisibility(false) }
    if (success) {
      closeVisibilityDialog()
      void Swal.fire({ icon: 'success', title: 'Görünürlük güncellendi', toast: true, position: 'top-end', showConfirmButton: false, timer: 2000 })
    }
  }

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newEmail || !newPassword) return

    setCreating(true)
    // Supabase auth sign up on secondary client doesn't log the admin out!
    const { data, error } = await supabaseSecondary.auth.signUp({
      email: newEmail,
      password: newPassword,
      options: {
        data: { display_name: newName || 'Kullanıcı' }
      }
    })

    if (error) {
      Swal.fire({ icon: 'error', title: 'Hata', text: error.message })
      setCreating(false)
      return
    }

    if (data.user) {
      // Profil tablosuna manuel ekle ki hemen listede görünsün
      await supabase.from('profiles').upsert({
        id: data.user.id,
        email: data.user.email,
        display_name: newName || 'Kullanıcı',
        role: 'user'
      })
      Swal.fire({ icon: 'success', title: 'Başarılı', text: 'Kullanıcı oluşturuldu!' })
      setNewEmail('')
      setNewPassword('')
      setNewName('')
      loadProfiles()
    }
    setCreating(false)
  }

  const openPasswordDialog = (profile: Profile, trigger: HTMLButtonElement) => {
    passwordTrigger.current = trigger
    setPasswordUser(profile); setChangedPassword(''); setConfirmedPassword(''); setPasswordError('')
    passwordDialog.current?.showModal()
  }
  const closePasswordDialog = () => {
    if (passwordBusy.current) return
    passwordDialog.current?.close()
    setPasswordUser(null); setChangedPassword(''); setConfirmedPassword(''); setPasswordError('')
    passwordTrigger.current?.focus()
  }
  const changeUserPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!passwordUser || passwordBusy.current) return
    if (changedPassword.length < 8 || changedPassword.length > 128 || !changedPassword.trim()) { setPasswordError('Şifre 8–128 karakter olmalı.'); return }
    if (changedPassword !== confirmedPassword) { setPasswordError('Şifreler eşleşmiyor.'); return }
    passwordBusy.current = true; setChangingPassword(true); setPasswordError('')
    let success = false
    try {
      const { data, error } = await supabase.functions.invoke('admin-change-password', { body: { userId: passwordUser.id, password: changedPassword } })
      if (error) {
        let message = 'Şifre değiştirilemedi. Supabase admin-change-password fonksiyonunun dağıtıldığını kontrol edin.'
        if (error instanceof FunctionsHttpError) {
          if (error.context.status === 401) message = 'Oturum geçersiz. Yeniden giriş yapın.'
          else if (error.context.status !== 404) {
            const response = await error.context.json().catch(() => null)
            if (typeof response?.error === 'string') message = response.error
          }
        }
        throw new Error(message)
      }
      if (data?.success !== true) throw new Error('Şifre değişikliği doğrulanamadı.')
      success = true
    } catch (error) {
      setPasswordError(error instanceof Error ? error.message : 'Şifre değiştirilemedi.')
    } finally { passwordBusy.current = false; setChangingPassword(false) }
    if (success) {
      closePasswordDialog()
      void Swal.fire({ icon: 'success', title: 'Şifre değiştirildi', toast: true, position: 'top-end', showConfirmButton: false, timer: 2200 })
    }
  }

  const handleImpersonate = (userId: string) => {
    window.open(`/?impersonate=${userId}`, '_blank')
    Swal.fire({
      icon: 'success',
      title: 'Yeni Sekmede Açıldı',
      text: 'Kullanıcının hesabı yeni bir sekmede açıldı.',
      timer: 2000,
      showConfirmButton: false
    })
  }

  const stopImpersonating = () => {
    setImpersonatedUserId(null)
    Swal.fire({
      icon: 'info',
      title: 'Geri Dönüldü',
      text: 'Kendi admin hesabınıza geri döndünüz.',
      timer: 2000,
      showConfirmButton: false
    }).then(() => {
      navigate('/')
    })
  }

  if (!isAdmin) return null

  return (
    <div className="admin-page flex flex-col h-full gap-6 overflow-y-auto max-w-5xl mx-auto w-full pb-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-[#0f172a] flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-indigo-500" /> Admin Yönetim Paneli
          </h1>
          <p className="text-[13px] text-[#64748b] mt-1">Kullanıcıları yönet, hesaplarına geçiş yap (impersonate).</p>
        </div>
        <button type="button" onClick={() => navigate('/monthly-plan')} className="inline-flex items-center gap-2 rounded-xl border border-[#dce5ef] bg-white px-4 py-2 text-sm font-semibold text-[#4269a8]"><CalendarDays size={17} /> Aylık Plan</button>
        {impersonatedUserId && (
          <button onClick={stopImpersonating} className="flex items-center gap-2 bg-red-100 text-red-600 px-4 py-2 rounded-xl font-bold text-sm hover:bg-red-200 transition-all self-start md:self-auto">
            <XCircle className="h-4 w-4" /> Kendi Hesabıma Dön
          </button>
        )}
      </div>

      {visibilityLoadError && <div className="admin-visibility-notice" role="alert"><span>{visibilityLoadError}</span><button type="button" onClick={() => void loadProfiles()} disabled={loading}>Yeniden dene</button></div>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sol Panel: Kullanıcı Ekleme */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-white rounded-xl border border-[#e2e8f0] p-5">
            <h3 className="text-sm font-bold text-[#0f172a] flex items-center gap-2 mb-4">
              <UserPlus className="h-4 w-4 text-indigo-500" /> Yeni Kullanıcı Ekle
            </h3>
            <form onSubmit={handleCreateUser} className="space-y-3">
              <div>
                <label className="text-[11px] font-semibold text-[#64748b] uppercase">Adı (Opsiyonel)</label>
                <input type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Ahmet Yılmaz"
                  className="mt-1 w-full h-9 rounded-lg border border-[#e2e8f0] px-3 text-[12px] focus:outline-none focus:ring-2 focus:ring-indigo-500/30" />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-[#64748b] uppercase">E-posta</label>
                <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} required placeholder="kullanici@ornek.com"
                  className="mt-1 w-full h-9 rounded-lg border border-[#e2e8f0] px-3 text-[12px] focus:outline-none focus:ring-2 focus:ring-indigo-500/30" />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-[#64748b] uppercase">Şifre</label>
                <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required placeholder="En az 6 karakter"
                  className="mt-1 w-full h-9 rounded-lg border border-[#e2e8f0] px-3 text-[12px] focus:outline-none focus:ring-2 focus:ring-indigo-500/30" />
              </div>
              <button type="submit" disabled={creating} className="w-full h-9 mt-2 rounded-lg bg-indigo-500 text-white text-[12px] font-bold hover:bg-indigo-600 transition-all disabled:opacity-50">
                {creating ? 'Oluşturuluyor...' : 'Kullanıcıyı Oluştur'}
              </button>
            </form>
          </div>
        </div>

        {/* Sağ Panel: Kullanıcı Listesi */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl border border-[#e2e8f0] flex flex-col overflow-hidden h-[600px]">
            <div className="px-5 py-4 border-b border-[#e2e8f0] flex items-center justify-between shrink-0">
              <h3 className="text-sm font-bold text-[#0f172a] flex items-center gap-2">
                <Users className="h-4 w-4 text-[#2563eb]" /> Tüm Kullanıcılar
              </h3>
              <span className="text-[12px] font-medium text-[#64748b] bg-[#f1f5f9] px-2 py-1 rounded-md">{profiles.length} kayıtlı</span>
            </div>
            
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {loading ? (
                <div className="flex h-full items-center justify-center text-[13px] text-[#64748b]">Yükleniyor...</div>
              ) : profiles.map(p => {
                const isImpersonating = impersonatedUserId === p.id
                return (
                  <div key={p.id} className={`admin-user-row flex items-center justify-between p-3 rounded-lg border transition-all ${isImpersonating ? 'border-indigo-400 bg-indigo-50/50' : 'border-[#e2e8f0] hover:border-[#cbd5e1]'}`}>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-[13px] font-bold text-[#0f172a]">{profileNameLabel(p.display_name, p.email)}</p>
                        {p.role === 'admin' && <span className="bg-indigo-100 text-indigo-700 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase">Admin</span>}
                        {isImpersonating && <span className="bg-red-100 text-red-600 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase">Şu anki</span>}
                      </div>
                      <p className="text-[11px] text-[#64748b]">{p.email}</p>
                      {visibilityReady && <p className="admin-visibility-summary">{visibilityPreferences[p.id]?.show_widget === false ? 'Bölüm gizli' : 'Bölüm açık'} · {visibilityPreferences[p.id]?.share_statistics === false ? 'Sıralamada gizli' : 'Sıralamada görünüyor'}</p>}
                    </div>
                    <div className="admin-user-actions">
                    <button type="button" disabled={!visibilityReady} onClick={event => openVisibilityDialog(p, event.currentTarget)} className="admin-password-button" aria-label={`${profileNameLabel(p.display_name, p.email)} için görünürlük ayarları`}><Eye size={15} /> Görünürlük</button>
                    {p.role === 'user' && <button onClick={event => openPasswordDialog(p, event.currentTarget)} className="admin-password-button" aria-label={`${p.display_name || p.email || 'Kullanıcı'} için şifre değiştir`}><KeyRound size={15} /> Şifre değiştir</button>}
                    {p.role !== 'admin' && !isImpersonating && (
                      <button onClick={() => handleImpersonate(p.id)} className="h-8 px-3 rounded-lg bg-[#f1f5f9] text-[#0f172a] text-[11px] font-bold hover:bg-[#e2e8f0] flex items-center gap-1.5 transition-all">
                        <LogIn className="h-3 w-3" /> Hesaba Gir
                      </button>
                    )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
      <dialog ref={visibilityDialog} className="admin-password-dialog admin-visibility-dialog" aria-labelledby="admin-visibility-title" onCancel={event => { event.preventDefault(); closeVisibilityDialog() }} onClick={event => { if (event.target === event.currentTarget) closeVisibilityDialog() }}>
        <div className="admin-password-heading"><div><h2 id="admin-visibility-title">Birlikte ilerliyoruz</h2><p>{profileNameLabel(visibilityUser?.display_name, visibilityUser?.email)}</p></div><button type="button" onClick={closeVisibilityDialog} disabled={savingVisibility} aria-label="Kapat"><X size={19} /></button></div>
        <form onSubmit={saveVisibility} aria-busy={savingVisibility}>
          <label className="admin-visibility-option"><input autoFocus type="checkbox" checked={showCommunity} onChange={event => setShowCommunity(event.target.checked)} disabled={savingVisibility} /><span><strong>Bu kullanıcıya bölümü göster</strong><small>Kapalıysa kendi dashboard’unda bu bölümü görmez.</small></span></label>
          <label className="admin-visibility-option"><input type="checkbox" checked={shareStatistics} onChange={event => setShareStatistics(event.target.checked)} disabled={savingVisibility} /><span><strong>Bu kullanıcıyı sıralamada göster</strong><small>Kapalıysa adı, mesajı ve çalışma istatistikleri herkesin listesinden gizlenir.</small></span></label>
          {visibilityError && <p className="admin-password-error" role="alert">{visibilityError}</p>}
          <div className="admin-password-actions"><button type="button" onClick={closeVisibilityDialog} disabled={savingVisibility}>İptal</button><button type="submit" disabled={savingVisibility}>{savingVisibility ? 'Kaydediliyor…' : 'Kaydet'}</button></div>
        </form>
      </dialog>
      <dialog ref={passwordDialog} className="admin-password-dialog" aria-labelledby="admin-password-title" onCancel={event => { event.preventDefault(); closePasswordDialog() }} onClick={event => { if (event.target === event.currentTarget) closePasswordDialog() }}>
        <div className="admin-password-heading"><div><h2 id="admin-password-title">Şifre değiştir</h2><p>{profileNameLabel(passwordUser?.display_name, passwordUser?.email)} · {passwordUser?.email}</p></div><button type="button" onClick={closePasswordDialog} disabled={changingPassword} aria-label="Kapat"><X size={19} /></button></div>
        <form onSubmit={changeUserPassword} aria-busy={changingPassword}>
          <label>Yeni şifre<input autoFocus type="password" autoComplete="new-password" required minLength={8} maxLength={128} disabled={changingPassword} value={changedPassword} onChange={event => setChangedPassword(event.target.value)} placeholder="En az 8 karakter" /></label>
          <label>Yeni şifreyi tekrar yaz<input type="password" autoComplete="new-password" required minLength={8} maxLength={128} disabled={changingPassword} value={confirmedPassword} onChange={event => setConfirmedPassword(event.target.value)} /></label>
          {passwordError && <p className="admin-password-error" role="alert">{passwordError}</p>}
          <div className="admin-password-actions"><button type="button" onClick={closePasswordDialog} disabled={changingPassword}>İptal</button><button type="submit" disabled={changingPassword}>{changingPassword ? 'Değiştiriliyor…' : 'Şifreyi değiştir'}</button></div>
        </form>
      </dialog>
    </div>
  )
}
