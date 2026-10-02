/** Shrink without cropping, with a small allowance for printer rounding. */
export function fitPrintScale(width: number, height: number, availableWidth: number, availableHeight: number) {
  if (![width, height, availableWidth, availableHeight].every(n => Number.isFinite(n) && n > 0)) return 1
  return Math.min(1, availableWidth / width, availableHeight / height) * .98
}

/** Print the actual calendar DOM, using the application's styles and fonts. */
export function openVideoPlanPrint(calendar: HTMLElement): boolean {
  const popup = window.open('', '_blank', 'width=1280,height=900')
  if (!popup) return false
  const copy = calendar.cloneNode(true) as HTMLElement
  copy.querySelectorAll('[data-print-remove]').forEach(node => node.remove())
  copy.querySelectorAll('[draggable]').forEach(node => node.removeAttribute('draggable'))
  copy.querySelectorAll('button').forEach(button => {
    if (!button.hasAttribute('data-print-keep')) { button.remove(); return }
    const indicator = document.createElement('span')
    indicator.className = button.className
    indicator.innerHTML = button.innerHTML
    button.replaceWith(indicator)
  })
  copy.setAttribute('id', 'printed-calendar')
  const width = Math.max(1120, calendar.scrollWidth)
  const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"],style')).map(node => node.outerHTML).join('\n')
  popup.document.open()
  popup.document.write(`<!doctype html><html lang="tr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Haftalık video planı</title><base href="${window.location.origin}/">${styles}<style>
    @page{size:A4 landscape;margin:10mm}
    html,body{margin:0!important;padding:0!important;height:auto!important;background:#edf1f6!important;color:#24354a}
    #print-toolbar{display:flex;justify-content:space-between;align-items:center;gap:16px;width:277mm;margin:20px auto;font:15px 'Source Sans 3',sans-serif}
    #print-toolbar button{padding:10px 16px;border-radius:9px;border:0;background:#4269a8;color:white;cursor:pointer;font:600 15px 'Source Sans 3',sans-serif}
    #print-paper{position:relative;width:277mm;height:185mm;overflow:hidden;margin:0 auto 20px;background:white;box-shadow:0 4px 24px #24354a15}
    #print-content{position:absolute;top:0;left:0;width:${width}px;transform-origin:top left}
    #print-content.suite-page{padding:0!important;margin:0!important;max-width:none!important;height:auto!important;gap:0!important;overflow:visible!important}
    #printed-calendar,#printed-calendar>div:first-child{height:auto!important;max-height:none!important;min-height:0!important;overflow:visible!important;flex:none!important}
    #printed-calendar .sticky{position:static!important}
    #printed-calendar [class*="grid-cols-7"]{flex:none!important}
    #printed-calendar *{print-color-adjust:exact!important;-webkit-print-color-adjust:exact!important;animation:none!important;transition:none!important}
    @media print{html,body{width:277mm!important;height:185mm!important;overflow:hidden!important;background:white!important}#print-toolbar{display:none!important}#print-paper{margin:0!important;box-shadow:none!important;break-inside:avoid;page-break-inside:avoid}#print-content{break-inside:avoid}}
  </style></head><body><div id="print-toolbar"><span>Haftalık video planı · Tek sayfa</span><button id="print-button" disabled>Hazırlanıyor…</button></div><main id="print-paper"><div id="print-content" class="suite-page suite-videoplan"></div></main></body></html>`)
  popup.document.close()
  popup.document.getElementById('print-content')!.appendChild(popup.document.importNode(copy, true))
  const fit = () => {
    const content = popup.document.getElementById('print-content')!
    const paper = popup.document.getElementById('print-paper')!
    const scale = fitPrintScale(width, content.scrollHeight, paper.clientWidth, paper.clientHeight)
    content.style.transform = `scale(${scale})`
    content.style.left = `${Math.max(0, (paper.clientWidth - width * scale) / 2)}px`
  }
  const links = Array.from(popup.document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'))
  const button = popup.document.getElementById('print-button') as HTMLButtonElement
  void Promise.all(links.map(link => link.sheet ? Promise.resolve() : new Promise<void>(resolve => { link.onload = () => resolve(); link.onerror = () => resolve() }))).then(async () => {
    await popup.document.fonts.ready
    if (popup.closed) return
    fit()
    button.disabled = false
    button.textContent = 'Yazdır / PDF olarak kaydet'
    button.addEventListener('click', () => { fit(); popup.focus(); popup.print() })
    popup.addEventListener('beforeprint', fit)
    popup.addEventListener('resize', fit)
  })
  popup.opener = null
  return true
}
