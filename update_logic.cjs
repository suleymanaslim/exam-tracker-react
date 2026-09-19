const fs = require('fs')

let content = fs.readFileSync('src/pages/VideoPlan.tsx', 'utf8')

const clickHandler = `
  const handleProgressClick = async (item: VideoPlanItem, res: Resource | undefined) => {
    if (!userId || !res) return
    const current = item.watched_count || 0
    
    const html = \`
      <div class="flex flex-col gap-2 text-left mt-2">
        <label class="text-xs font-bold text-slate-500 uppercase">İzlenen Video Sayısı</label>
        <div class="flex items-center gap-2">
          <input type="number" id="watch-input" class="swal2-input !m-0 !w-full" value="\${current}" min="0" max="\${item.video_count}">
          <span class="text-sm font-bold text-slate-400 whitespace-nowrap">/ \${item.video_count}</span>
        </div>
      </div>
    \`

    const c = await Swal.fire({
      title: 'İlerleme Kaydet',
      html,
      showCancelButton: true,
      showDenyButton: true,
      confirmButtonText: 'Kaydet',
      denyButtonText: 'Tümünü İzledim',
      cancelButtonText: 'İptal',
      confirmButtonColor: '#2563eb',
      denyButtonColor: '#10b981',
      preConfirm: () => {
        const val = parseInt((document.getElementById('watch-input') as HTMLInputElement).value)
        return isNaN(val) ? 0 : val
      }
    })

    let newVal = current
    if (c.isConfirmed) newVal = c.value as number
    else if (c.isDenied) newVal = item.video_count
    else return

    newVal = Math.min(item.video_count, Math.max(0, newVal))

    setLoading(true)
    const { error } = await supabase.from('video_plan_items').update({
      watched_count: newVal,
      is_completed: newVal >= item.video_count
    }).eq('id', item.id)

    if (error) {
      if (error.code === 'PGRST204' || error.message.includes('column')) {
        Swal.fire({
          title: 'Veritabanı Güncellemesi Gerekli',
          html: \`İzleme takibini kullanabilmek için veritabanına kolon eklenmeli.<br><br>
                 Supabase SQL Editor'e girip şunu çalıştırın:<br>
                 <pre style="text-align:left; background:#f1f5f9; padding:8px; border-radius:4px; font-size:11px; margin-top:10px; overflow-x:auto;">
ALTER TABLE video_plan_items 
ADD COLUMN watched_count INT DEFAULT 0,
ADD COLUMN is_completed BOOLEAN DEFAULT false;</pre>\`,
          icon: 'warning'
        })
      } else {
        Swal.fire('Hata', error.message, 'error')
      }
    } else {
      setPlanItems(prev => prev.map(p => p.id === item.id ? { ...p, watched_count: newVal, is_completed: newVal >= item.video_count } : p))
    }
    setLoading(false)
  }

`

content = content.replace('  /* resource actions */', clickHandler + '  /* resource actions */')
fs.writeFileSync('src/pages/VideoPlan.tsx', content)
