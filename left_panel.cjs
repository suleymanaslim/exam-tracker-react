const fs = require('fs')
let content = fs.readFileSync('src/pages/VideoPlan.tsx', 'utf8')

// Update "used" logic to "watched" logic
content = content.replace(
  /const used = planItems\.filter\(p => p\.resource_id === res\.id\)\.reduce\(\(s, p\) => s \+ p\.video_count, 0\)/g,
  `const watched = planItems.filter(p => p.resource_id === res.id).reduce((s, p) => s + (p.watched_count || 0), 0)`
)

content = content.replace(
  /const remaining = Math\.max\(0, total - used\)/g,
  `const remaining = Math.max(0, total - watched)\n                const remainingMin = remaining * (res.avg_video_duration || 0)`
)

content = content.replace(
  /const pct = total > 0 \? Math\.min\(100, Math\.round\(\(used \/ total\) \* 100\)\) : 0/g,
  `const pct = total > 0 ? Math.min(100, Math.round((watched / total) * 100)) : 0`
)

// Update left panel footer text
const leftFooter = `<div className="mt-2.5">
                          <div className="flex items-center justify-between text-[10px] mb-1.5">
                            <span className="text-slate-400 flex items-center gap-1">
                              <Clock className="h-3 w-3" /> {res.avg_video_duration || 0} dk/vid
                            </span>
                            <span className="font-bold" style={{ color: remaining === 0 ? '#059669' : col.text }}>
                              {remaining === 0 ? '✓ Tamamlandı' : \`\${remaining} kaldı\`}
                            </span>
                          </div>
                          {/* Progress bar */}
                          <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                            <div className="h-full rounded-full transition-all duration-500" style={{ width: \`\${pct}%\`, backgroundColor: pct >= 100 ? '#059669' : col.accent }} />
                          </div>
                        </div>`

const newLeftFooter = `<div className="mt-2.5">
                          <div className="flex items-center justify-between text-[10px] mb-1.5">
                            <span className="text-slate-400 flex items-center gap-1">
                              <Clock className="h-3 w-3" /> {res.avg_video_duration || 0} dk/vid
                            </span>
                            <span className="font-bold text-right leading-tight" style={{ color: remaining === 0 ? '#059669' : col.text }}>
                              {remaining === 0 ? '✓ Tamamlandı' : (
                                <>Kalan: {remaining} Vid<br/><span className="opacity-70 text-[9px]">({fmtMinutes(remainingMin)})</span></>
                              )}
                            </span>
                          </div>
                          {/* Progress bar */}
                          <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden" title={\`\${watched} / \${total} izlendi\`}>
                            <div className="h-full rounded-full transition-all duration-500" style={{ width: \`\${pct}%\`, backgroundColor: pct >= 100 ? '#059669' : col.accent }} />
                          </div>
                        </div>`

content = content.replace(leftFooter, newLeftFooter)

fs.writeFileSync('src/pages/VideoPlan.tsx', content)
