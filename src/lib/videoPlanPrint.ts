export interface PrintVideoItem {
  subject: string
  resource: string
  videos: number
  watched: number
  minutes: number
}
export interface PrintVideoDay { date: string; items: PrintVideoItem[] }

function escapeHTML(text: string) {
  return text.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!)
}
function duration(minutes: number) {
  const rounded = Math.round(minutes)
  return `${Math.floor(rounded / 60) ? `${Math.floor(rounded / 60)} sa ` : ''}${rounded % 60} dk`
}

export function videoPlanPrintHTML(days: PrintVideoDay[]) {
  const dateLabel = (date: string, weekday = false) => new Date(`${date}T12:00:00`).toLocaleDateString('tr-TR', {
    ...(weekday ? { weekday: 'long' as const } : {}), day: 'numeric', month: 'long', year: 'numeric',
  })
  const range = `${dateLabel(days[0].date)} – ${dateLabel(days[days.length - 1].date)}`
  const rows = Math.max(1, ...days.map(day => day.items.length))
  const body = Array.from({ length: rows }, (_, index) => `<tr>${days.map(day => {
    const item = day.items[index]
    if (!item) return `<td>${index === 0 && !day.items.length ? '<span class="empty">Plan yok</span>' : ''}</td>`
    return `<td><article><span class="subject">${escapeHTML(item.subject || 'Ders')}</span><strong>${escapeHTML(item.resource || 'Kaynak')}</strong><p>${item.videos} video · ${duration(item.minutes)}</p><span class="progress">${item.watched >= item.videos ? 'Tamamlandı' : `${item.watched} / ${item.videos} video izlendi`}</span></article></td>`
  }).join('')}</tr>`).join('')
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Video Planı · ${escapeHTML(range)}</title><style>
    *{box-sizing:border-box}body{margin:0;background:#edf1f6;color:#24354a;font-family:Arial,Helvetica,sans-serif;font-size:14px}.toolbar{max-width:1180px;margin:24px auto 16px;padding:0 20px;display:flex;align-items:center;justify-content:space-between;gap:16px}.toolbar p{margin:0;line-height:1.6;color:#53677f}.toolbar button{padding:12px 20px;border:0;border-radius:9px;background:#4269a8;color:white;font:600 14px Arial;cursor:pointer;white-space:nowrap}.toolbar button:focus-visible{outline:3px solid #abc1e3;outline-offset:3px}.sheet{padding:26px;background:white;max-width:1180px;margin:0 auto 30px;overflow-x:auto;box-shadow:0 5px 25px #24354a0c}table{border-collapse:collapse;width:100%;table-layout:fixed;min-width:980px}caption{text-align:left;padding:0 0 20px;font-size:22px;font-weight:700}caption span{display:block;font-size:14px;font-weight:400;margin-top:7px;color:#53677f}th,td{border:1px solid #d5dde7;vertical-align:top;padding:12px 10px;text-align:left}th{background:#f3f6fa;font-size:13px;line-height:1.6}th span{display:block;font-weight:400;font-size:12px;color:#53677f}article{overflow-wrap:anywhere;line-height:1.5}.subject{display:block;font-size:11px;color:#53677f;margin-bottom:5px}article strong{display:block;font-size:13px;font-weight:700}article p{font-size:12px;margin:7px 0 4px}.progress{font-size:11px;color:#53677f}.empty{font-size:12px;color:#718096}.totals td{font-size:12px;font-weight:700;background:#f8fafc}.totals span{font-weight:400;display:block;margin-top:5px;color:#53677f}thead{display:table-header-group}tr,article{break-inside:avoid;page-break-inside:avoid}
    @page{size:A4 landscape;margin:10mm}@media print{body{background:white;font-size:10pt}.toolbar{display:none!important}.sheet{padding:0;margin:0;max-width:none;overflow:visible;box-shadow:none}table{min-width:0;width:100%}caption{font-size:16pt;padding-bottom:5mm}caption span{font-size:10pt}th,td{padding:3mm 2.5mm}th{font-size:9pt}th span,article p,.totals td{font-size:9pt}article strong{font-size:10pt}.subject,.progress{font-size:8pt}th,.totals td{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
    @media(max-width:600px){.toolbar{align-items:stretch;flex-direction:column;margin-top:16px}.sheet{padding:16px}.toolbar p{font-size:13px}}
  </style></head><body><div class="toolbar"><p>Bu sayfa yalnızca haftalık video planını içerir.<br>Yazdır penceresinde hedef olarak <b>PDF olarak kaydet</b> seçebilirsin.</p><button id="print-plan" type="button">Yazdır / PDF olarak kaydet</button></div><main class="sheet"><table><caption>Haftalık video planı<span>${escapeHTML(range)}</span></caption><thead><tr>${days.map(day => `<th scope="col">${escapeHTML(dateLabel(day.date, true))}<span>${day.items.reduce((sum, item) => sum + item.videos, 0)} video · ${duration(day.items.reduce((sum, item) => sum + item.minutes, 0))}</span></th>`).join('')}</tr></thead><tbody>${body}<tr class="totals">${days.map(day => `<td>${duration(day.items.reduce((sum, item) => sum + item.minutes, 0))}<span>${day.items.reduce((sum, item) => sum + item.watched, 0)} / ${day.items.reduce((sum, item) => sum + item.videos, 0)} video izlendi</span></td>`).join('')}</tr></tbody></table></main></body></html>`
}
