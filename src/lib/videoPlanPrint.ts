/** Shrink without cropping, with a small allowance for printer rounding. */
export function fitPrintScale(width: number, height: number, availableWidth: number, availableHeight: number) {
  if (![width, height, availableWidth, availableHeight].every(n => Number.isFinite(n) && n > 0)) return 1
  return Math.min(1, availableWidth / width, availableHeight / height) * .98
}

// Runs in the standalone print document; all dependencies are passed explicitly.
function initializeVideoPrint(width: number, scale: typeof fitPrintScale) {
  const content = document.getElementById('print-content')!
  const paper = document.getElementById('print-paper')!
  const button = document.getElementById('print-button') as HTMLButtonElement
  const fit = () => {
    const value = scale(width, content.scrollHeight, paper.clientWidth, paper.clientHeight)
    content.style.transform = `scale(${value})`
    content.style.left = `${Math.max(0, (paper.clientWidth - width * value) / 2)}px`
  }
  window.addEventListener('load', () => {
    void Promise.race([document.fonts.ready, new Promise<void>(resolve => window.setTimeout(resolve, 4000))]).then(() => {
      fit()
      button.disabled = false
      button.textContent = 'Yazdır / PDF olarak kaydet'
      button.addEventListener('click', () => { fit(); window.focus(); window.print() })
      window.addEventListener('beforeprint', fit)
      window.addEventListener('resize', fit)
      window.opener = null
      URL.revokeObjectURL(window.location.href)
    })
  }, { once: true })
}

/** Print a standalone document so stylesheet/font loading has a normal lifecycle. */
export function openVideoPlanPrint(calendar: HTMLElement): boolean {
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
  const styles = Array.from(document.querySelectorAll<HTMLLinkElement | HTMLStyleElement>('link[rel="stylesheet"],style')).map(source => {
    try {
      if (source.sheet) {
        const base = source.sheet.href || document.baseURI
        const style = document.createElement('style')
        style.textContent = Array.from(source.sheet.cssRules).map(rule => rule.cssText).join('\n').replace(/url\((?:"([^"]*)"|'([^']*)'|([^)]*))\)/gi, (match, quoted, single, plain) => {
          const value = String(quoted ?? single ?? plain).trim()
          if (!value || value.startsWith('#') || value.startsWith('data:')) return match
          try { return `url("${new URL(value, base).href}")` } catch { return match }
        })
        return style.outerHTML
      }
    } catch { /* Cross-origin stylesheets retain their absolute link instead. */ }
    if (source.tagName === 'STYLE') return source.outerHTML
    const link = document.createElement('link')
    link.rel = 'stylesheet'; link.href = (source as HTMLLinkElement).href
    return link.outerHTML
  }).join('\n')
  const html = `<!doctype html><html lang="tr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Haftalık video planı</title><base href="${window.location.origin}/">${styles}<style>
    @page{size:A4 landscape;margin:10mm}
    html,body{margin:0!important;padding:0!important;height:auto!important;background:#edf1f6!important;color:#24354a}
    #print-toolbar{display:flex;justify-content:space-between;align-items:center;gap:16px;width:277mm;margin:20px auto;font:15px 'Source Sans 3',sans-serif}
    #print-toolbar button{padding:10px 16px;border-radius:9px;border:0;background:#4269a8;color:white;cursor:pointer;font:600 15px 'Source Sans 3',sans-serif}
    #print-paper{position:relative;width:277mm;height:185mm;overflow:hidden;margin:0 auto 20px;background:white;box-shadow:0 4px 24px #24354a15}
    #print-content{position:absolute;top:0;left:0;width:${width}px;transform-origin:top left}
    #print-content.suite-page{padding:0!important;margin:0!important;max-width:none!important;height:auto!important;gap:0!important;overflow:visible!important}
    #printed-calendar,#printed-calendar>div:first-child{height:auto!important;max-height:none!important;min-height:0!important;overflow:visible!important;flex:none!important}
    #printed-calendar .sticky{position:static!important}
    #printed-calendar .video-week-scroll{overflow:visible!important}
    #printed-calendar .video-week-board{display:grid!important;grid-template-columns:repeat(7,minmax(0,1fr))!important;min-width:0!important}
    #printed-calendar .video-day-column{display:block!important}
    #printed-calendar *{print-color-adjust:exact!important;-webkit-print-color-adjust:exact!important;animation:none!important;transition:none!important}
    @media print{html,body{width:277mm!important;height:185mm!important;overflow:hidden!important;background:white!important}#print-toolbar{display:none!important}#print-paper{margin:0!important;box-shadow:none!important;break-inside:avoid;page-break-inside:avoid}#print-content{break-inside:avoid}}
  </style></head><body><div id="print-toolbar"><span>Haftalık video planı · Tek sayfa</span><button id="print-button" disabled>Hazırlanıyor…</button></div><main id="print-paper"><div id="print-content" class="suite-page suite-videoplan">${copy.outerHTML}</div></main><script>(${initializeVideoPrint.toString()})(${width},${fitPrintScale.toString()});</script></body></html>`
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }))
  const popup = window.open(url, '_blank', 'width=1280,height=900')
  if (!popup) { URL.revokeObjectURL(url); return false }
  // Also release the URL if the popup is closed before finishing its load.
  window.setTimeout(() => URL.revokeObjectURL(url), 60000)
  return true
}
