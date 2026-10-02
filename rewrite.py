import sys
import os

with open("src/pages/VideoPlan.tsx", "r") as f:
    original = f.read()

# We need to extract all the logic from the top down to `/* ─── Render ─── */`
render_idx = original.find('  /* ─── Render ─── */')
if render_idx == -1:
    print("Could not find Render block")
    sys.exit(1)

logic_part = original[:render_idx]

# In logic part, change days from 35 to 7
logic_part = logic_part.replace("length: 35", "length: 7")

render_part = """
  /* ─── Render ─── */
  const exportJSON = () => {
    const strs = days.map(localDateStr);
    const data = {
      hafta: { baslangic: strs[0], bitis: strs[6] },
      ozet: { toplam_video: 0, toplam_dk: 0, izlenen_video: 0 },
      gunler: strs.map(ds => {
        const dItems = planItems.filter(p => p.date === ds).sort((a,b) => (a.sort_order||0) - (b.sort_order||0));
        let gVid = 0, gMin = 0, gWatched = 0;
        const plans = dItems.map(p => {
          const r = allResources.find(x => x.id === p.resource_id);
          const min = p.video_count * (r?.avg_video_duration || 0);
          gVid += p.video_count; gMin += min; gWatched += (p.watched_count || 0);
          return { ders: cleanName(r?.subject_name || ''), kaynak: cleanName(r?.name || ''), video: p.video_count, izlenen: p.watched_count||0, tamamlandi: !!p.is_completed, sure_dk: min };
        });
        data.ozet.toplam_video += gVid; data.ozet.toplam_dk += gMin; data.ozet.izlenen_video += gWatched;
        return { tarih: ds, planlar: plans };
      }),
    };
    const b = new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
    const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = 'video_plani.json'; a.click(); URL.revokeObjectURL(u);
  }

  const exportPNG = async () => {
    if (!calendarRef.current) return
    try {
      const canvas = await html2canvas(calendarRef.current, { scale: 2, backgroundColor: '#ffffff' })
      const link = document.createElement('a')
      link.download = 'video_plani.png'
      link.href = canvas.toDataURL('image/png')
      link.click()
    } catch (e) { console.error(e); Swal.fire('Hata', 'Görsel oluşturulamadı.', 'error') }
  }

  const DOW = ['Pzt','Sal','Çar','Per','Cum','Cmt','Paz']

  let tMinAll = 0, tVidAll = 0, tWatchedAll = 0
  days.forEach(d => {
    const ds = localDateStr(d)
    planItems.filter(p => p.date === ds).forEach(p => {
      const r = allResources.find(x => x.id === p.resource_id)
      tVidAll += p.video_count; tWatchedAll += p.watched_count || 0;
      tMinAll += p.video_count * (r?.avg_video_duration || 0)
    })
  })

  if (loading) return (
    <div className="h-full flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm text-slate-400">Yükleniyor…</span>
      </div>
    </div>
  )

  return (
    <div className="h-full flex flex-col gap-3 p-3 max-w-[1500px] mx-auto bg-slate-100 text-slate-900 overflow-hidden">
      {/* HEADER */}
      <div className="flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Video planı</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            {selectedResId ? <span className="text-slate-700 font-medium">Ders seçili — takvimde bir güne tıklayıp video sayısını girin</span> : 'Soldan ders seçin, güne tıklayın. Gün kartını sürükleyerek takas edin.'}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setStartDate(getMonday(new Date()))} className="h-7 px-3 rounded-md border border-slate-200 bg-white text-xs font-medium text-slate-500 hover:text-slate-900 hover:border-slate-400 transition-colors">Bugün</button>
          <div className="flex items-center">
            <button onClick={() => { const d = new Date(startDate); d.setDate(d.getDate() - 7); setStartDate(d) }} className="h-7 w-7 rounded-l-md border border-slate-200 bg-white flex items-center justify-center text-slate-500 hover:text-slate-900 transition-colors">‹</button>
            <button onClick={() => { const d = new Date(startDate); d.setDate(d.getDate() + 7); setStartDate(d) }} className="h-7 w-7 rounded-r-md border border-l-0 border-slate-200 bg-white flex items-center justify-center text-slate-500 hover:text-slate-900 transition-colors">›</button>
          </div>
          <span className="text-xs font-semibold text-slate-700 tabular-nums">
            {days[0].toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })} – {days[6].toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })}
          </span>
          <div className="w-px h-5 bg-slate-200 mx-1"></div>
          <button onClick={exportPNG} className="h-7 px-2.5 rounded-md border border-slate-200 bg-white text-xs font-medium text-slate-500 hover:text-slate-900 transition-colors inline-flex items-center gap-1.5">
            <ImageIcon className="h-3.5 w-3.5" /> PNG
          </button>
          <button onClick={exportJSON} className="h-7 px-3 rounded-md bg-slate-900 text-white text-xs font-medium hover:bg-slate-700 transition-colors inline-flex items-center gap-1.5">
            <Download className="h-3.5 w-3.5" /> JSON
          </button>
        </div>
      </div>

      {/* MAIN */}
      <div className="flex flex-col lg:flex-row gap-3 flex-1 min-h-0">

        {/* LEFT: Dersler */}
        <div className="w-full lg:w-64 flex flex-col shrink-0 lg:min-h-0 max-h-[240px] lg:max-h-none overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="px-3 py-2.5 border-b border-slate-200 flex items-center justify-between shrink-0">
            <span className="text-[13px] font-semibold flex items-center gap-2">Dersler
              <span className="text-[10px] text-slate-400 bg-slate-100 rounded-full px-1.5 py-0.5 font-semibold tabular-nums">{resources.length}</span>
            </span>
            <button onClick={handleAddResourceToPlan} className="h-6 px-2 rounded-md bg-slate-900 text-white flex items-center gap-1 text-[11px] font-medium hover:bg-slate-700 transition-colors">
              <Plus className="h-3 w-3" /> Ekle
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {resources.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2 text-slate-400">
                <p className="text-xs">Henüz kaynak yok</p>
                <p className="text-[10px] text-slate-300">Üstteki Ekle ile kaynak ekleyin</p>
              </div>
            ) : (
              resources.map(res => {
                const c = hashColor(res.subject_id)
                const items = planItems.filter(p => p.resource_id === res.id)
                const watched = items.reduce((s, p) => s + (p.watched_count || 0), 0)
                const total = res.total_videos || 0
                const remaining = Math.max(0, total - watched)
                const done = total > 0 && remaining === 0
                const pct = total > 0 ? Math.min(100, Math.round((watched / total) * 100)) : 0
                const sel = selectedResId === res.id

                return (
                  <div key={res.id} onClick={() => setSelectedResId(sel ? null : res.id)} 
                    className={`group px-3 py-2.5 border-b border-slate-100 last:border-b-0 cursor-pointer transition-colors ${sel ? 'bg-slate-900/5 shadow-[inset_2px_0_0_0_#0f172a]' : 'hover:bg-slate-50'}`}>
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: c.dot }}></span>
                      <span className="text-[13px] font-medium truncate flex-1">{cleanName(res.name)}</span>
                      <span className="flex items-center gap-0.5 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                        <button onClick={e => { e.stopPropagation(); handleEditResource(res) }} title="Düzenle" className="p-1 rounded text-slate-300 hover:text-slate-700 hover:bg-slate-100 transition-colors">
                          <Settings className="h-3 w-3" />
                        </button>
                        <button onClick={e => { e.stopPropagation(); handleHideResource(res) }} title="Gizle" className="p-1 rounded text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors">
                          <EyeOff className="h-3 w-3" />
                        </button>
                      </span>
                    </div>
                    {editingRes?.id === res.id ? (
                      <div className="mt-2 p-2 bg-white rounded border border-slate-200 ml-4" onClick={e => e.stopPropagation()}>
                        <div className="flex gap-2 mb-2">
                          <input type="number" min="0" value={editTotal} onChange={e => setEditTotal(e.target.value)} placeholder="Top. vid" className="w-full h-7 px-2 text-xs border border-slate-200 rounded focus:outline-none focus:border-slate-900 tabular-nums" />
                          <input type="number" min="0" value={editAvg} onChange={e => setEditAvg(e.target.value)} placeholder="Dk/vid" className="w-full h-7 px-2 text-xs border border-slate-200 rounded focus:outline-none focus:border-slate-900 tabular-nums" />
                        </div>
                        <div className="flex gap-1">
                          <button onClick={() => setEditingRes(null)} className="flex-1 h-6 rounded border border-slate-200 text-[10px] font-medium text-slate-500 hover:bg-slate-50">İptal</button>
                          <button onClick={saveEditResource} className="flex-1 h-6 rounded bg-slate-900 text-white text-[10px] font-medium hover:bg-slate-700">Kaydet</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between text-[11px] text-slate-400 mt-1.5 ml-4">
                          <span><span className="text-slate-600 font-medium tabular-nums">{watched}</span>/{total} video</span>
                          {done ? <span className="text-emerald-600 font-medium">tamamlandı</span> : <span>kalan <span className="text-slate-600 font-medium tabular-nums">{remaining}</span> · {fmtMinutes(remaining * (res.avg_video_duration || 0))}</span>}
                        </div>
                        <div className="h-[3px] rounded-full bg-slate-100 overflow-hidden mt-1.5 ml-4">
                          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: done ? '#059669' : c.dot }}></div>
                        </div>
                      </>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* RIGHT: Week */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div ref={calendarRef} className="flex-1 flex flex-col min-h-0 overflow-auto bg-white">
            {/* Headers */}
            <div className="grid grid-cols-7 border-b border-slate-200 sticky top-0 bg-white z-10 shrink-0">
              {days.map(d => {
                const ds = localDateStr(d)
                const isT = ds === localDateStr(new Date())
                let tMin = 0, tVid = 0
                planItems.filter(p => p.date === ds).forEach(p => {
                  const r = allResources.find(x => x.id === p.resource_id)
                  tVid += p.video_count; tMin += p.video_count * (r?.avg_video_duration || 0)
                })
                return (
                  <div key={ds} className={`px-1.5 py-2 text-center border-r border-slate-100 last:border-r-0 ${isT ? 'bg-slate-50' : ''}`} style={isT ? { boxShadow: 'inset 0 -2px 0 0 #0f172a' } : {}}>
                    <div className={`text-[10px] font-semibold uppercase ${isT ? 'text-slate-900' : 'text-slate-400'}`}>{DOW[(d.getDay() + 6) % 7]}</div>
                    <div className={`text-sm font-semibold tabular-nums leading-tight ${isT ? 'text-slate-900' : 'text-slate-700'}`}>{d.getDate()}</div>
                    <div className="text-[9px] text-slate-400 tabular-nums mt-0.5">{tVid > 0 ? `${tVid}v · ${fmtMinutes(tMin)}` : '—'}</div>
                  </div>
                )
              })}
            </div>
            {/* Grid */}
            <div className="grid grid-cols-7 flex-1">
              {days.map(d => {
                const ds = localDateStr(d)
                const isT = ds === localDateStr(new Date())
                const items = planItems.filter(p => p.date === ds).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
                const hasUnwatched = items.some(i => (i.watched_count || 0) < i.video_count)

                return (
                  <div key={ds} 
                    className={`group/day relative p-1.5 border-r border-slate-100 last:border-r-0 cursor-pointer transition-colors min-h-[220px] ${isT ? 'bg-slate-50/60' : 'hover:bg-slate-50/80'} ${dragOverDate === ds ? 'shadow-[inset_0_0_0_2px_#0f172a] bg-slate-900/5' : ''} ${dragSourceDate === ds ? 'opacity-30' : ''}`}
                    onClick={() => handleDayClick(d)}
                    draggable={items.length > 0}
                    onDragStart={e => { e.dataTransfer.setData('text/plain', ds); e.dataTransfer.effectAllowed = 'move'; setDragSourceDate(ds) }}
                    onDragEnd={() => { setDragSourceDate(null); setDragOverDate(null) }}
                    onDragOver={e => { e.preventDefault(); if (dragSourceDate && dragSourceDate !== ds) setDragOverDate(ds) }}
                    onDragLeave={() => setDragOverDate(null)}
                    onDrop={e => { e.preventDefault(); setDragOverDate(null); const src = e.dataTransfer.getData('text/plain'); if (src) handleSwapDays(src, ds) }}
                  >
                    <div className="absolute top-1 right-1 flex gap-0.5 opacity-0 group-hover/day:opacity-100 transition-opacity z-10">
                      <button onClick={e => handleShiftPlan(e, ds)} title="Bundan sonrasını 1 gün kaydır" className="h-5 w-5 rounded flex items-center justify-center text-slate-300 hover:text-slate-900 hover:bg-white border border-transparent hover:border-slate-200 transition-colors bg-white/70">
                        <SkipForward className="h-2.5 w-2.5" />
                      </button>
                      {items.length > 0 && (
                        <button onClick={e => handleClearDay(e, ds)} title="Günü temizle" className="h-5 w-5 rounded flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 border border-transparent hover:border-red-100 transition-colors bg-white/70">
                          <Trash2 className="h-2.5 w-2.5" />
                        </button>
                      )}
                    </div>

                    <div className="flex flex-col gap-1 mt-3">
                      {items.map((it, idx) => {
                        const r = allResources.find(x => x.id === it.resource_id)
                        const c = r ? hashColor(r.subject_id) : PALETTE[7]
                        const w = it.watched_count || 0
                        const done = w >= it.video_count
                        const partial = w > 0 && !done
                        const itemMin = it.video_count * ((r && r.avg_video_duration) || 0)
                        
                        return (
                          <div key={it.id} onClick={e => e.stopPropagation()} className={`group/item relative rounded-lg border px-1.5 py-1 transition-colors ${done ? 'border-emerald-200 bg-emerald-50/60' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                            <div className="flex items-center gap-1">
                              <div className="flex opacity-50 group-hover/item:opacity-100 transition-opacity gap-[1px]">
                                {idx > 0 && <button onClick={e => handleReorderItem(e, it, -1)} className="hover:text-slate-900"><ChevronUp className="h-3 w-3" /></button>}
                                {idx < items.length - 1 && <button onClick={e => handleReorderItem(e, it, 1)} className="hover:text-slate-900"><ChevronDown className="h-3 w-3" /></button>}
                              </div>
                              <span className="text-[9px] font-semibold px-1.5 py-px rounded-full truncate" style={{ background: c.card, color: c.text }}>{cleanName(r?.subject_name || '')}</span>
                              <button onClick={e => { e.stopPropagation(); handleProgressClick(it, r) }} title={done ? 'Tamamlandı' : `${w}/${it.video_count} izlendi — güncellemek için tıkla`}
                                className={`ml-auto h-[18px] w-[18px] rounded-[5px] shrink-0 flex items-center justify-center transition-colors ${done ? 'bg-emerald-500 text-white' : 'border border-slate-200 text-slate-300 hover:border-emerald-400 hover:text-emerald-400'}`}>
                                <Check className="h-2.5 w-2.5" strokeWidth={3} />
                              </button>
                            </div>
                            <div className={`text-[11px] font-medium truncate mt-1 ${done ? 'line-through text-slate-400' : 'text-slate-800'}`}>{cleanName(r?.name || '?')} · {it.video_count}v</div>
                            <div className="text-[10px] text-slate-400 tabular-nums">{fmtMinutes(itemMin)}{done ? ' · izlendi' : partial ? ` · ${w}/${it.video_count}` : ''}</div>
                            {partial && (
                              <div className="h-[2px] rounded-full bg-slate-100 mt-1 overflow-hidden">
                                <div className="h-full bg-emerald-400 rounded-full" style={{ width: `${(w / it.video_count) * 100}%` }}></div>
                              </div>
                            )}
                            <button onClick={e => handleDeleteItem(e, it.id)} className="absolute -top-1.5 right-0 h-3.5 w-3.5 rounded-full bg-slate-900 text-white items-center justify-center hover:bg-red-500 transition-colors hidden group-hover/item:flex">
                              <X className="h-2 w-2" strokeWidth={3} />
                            </button>
                          </div>
                        )
                      })}
                    </div>
                    {items.length > 0 && hasUnwatched && (
                      <button onClick={e => handleMarkDayWatched(e, items)} className="mt-1 w-full py-1 rounded-md text-[10px] font-semibold text-emerald-600 hover:bg-emerald-50 opacity-0 group-hover/day:opacity-100 transition-all flex items-center justify-center gap-1">
                        <Check className="h-2.5 w-2.5" strokeWidth={3} /> Tümünü izlendi say
                      </button>
                    )}
                    {items.length === 0 && (
                      <div className="h-full min-h-[60px] flex items-center justify-center opacity-0 group-hover/day:opacity-100 transition-opacity">
                        <span className="h-5 w-5 rounded border border-dashed border-slate-300 flex items-center justify-center text-slate-300">
                          <Plus className="h-3 w-3" strokeWidth={2.5} />
                        </span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
          <div className="px-3 py-2 border-t border-slate-200 flex items-center justify-between gap-3 shrink-0 text-xs text-slate-500">
            <span>Haftalık toplam: <span className="font-semibold text-slate-900 tabular-nums">{tVidAll} video</span> · <span className="font-semibold text-slate-900 tabular-nums">{fmtMinutes(tMinAll)}</span> — izlenen <span className="font-semibold text-slate-900 tabular-nums">{tWatchedAll}</span></span>
            <span className="hidden sm:flex items-center gap-3 text-[11px] text-slate-400">
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> tamamlandı</span>
              <span className="flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-emerald-300"></span> kısmi</span>
              <span className="flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-slate-300"></span> planlandı</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
"""

with open("src/pages/VideoPlan.tsx", "w") as f:
    f.write(logic_part + render_part)
