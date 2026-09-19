const fs = require('fs')
let content = fs.readFileSync('src/pages/VideoPlan.tsx', 'utf8')

// Fix Day cell header and Item checkmark
content = content.replace(/<\!\-\- Day header \-\->[\s\S]*?<\!\-\- Items \- NOT scrollable anymore, they just list down \-\->/, `
                        {/* Day header */}
                        <div className="flex flex-col mb-2 border-b border-slate-100 pb-1.5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1">
                              {dItems.length > 0 && (
                                <GripVertical className="h-3 w-3 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab" />
                              )}
                              <span className={\`text-[11px] font-bold leading-none \${isToday ? 'bg-blue-600 text-white rounded-md px-1.5 py-0.5' : 'text-slate-600'}\`}>
                                {d.getDate()}
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              {dItems.length > 0 && (
                                <button onClick={e => handleClearDay(e, ds)} title="Günü temizle"
                                  className="p-0.5 rounded text-slate-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all">
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              )}
                              <button onClick={e => handleShiftPlan(e, ds)} title="Sonrasını 1 gün ertele"
                                className="p-0.5 rounded text-slate-300 hover:text-blue-600 hover:bg-blue-50 opacity-0 group-hover:opacity-100 transition-all">
                                <SkipForward className="h-3 w-3" />
                              </button>
                            </div>
                          </div>
                          {totalVid > 0 && (
                            <div className="mt-1 flex items-center justify-between text-[9px] font-bold text-slate-400">
                              <span>Toplam: {totalVid} Video</span>
                              <span className="bg-slate-100 px-1.5 py-0.5 rounded-md text-slate-500">{fmtMinutes(totalMin)}</span>
                            </div>
                          )}
                        </div>

                        {/* Items - NOT scrollable anymore, they just list down */}
`)

// Fix item format
content = content.replace(/<p className="text-\[9px\] font-bold truncate leading-tight" style=\{\{ color: col\.text \}\}>[\s\S]*?<\/div>\s*\)\s*\}\)\}\s*<\/div>\s*<\/div>\s*\)\s*\}\)\}/, `
                                <div className="flex items-start justify-between gap-1">
                                  <div className="min-w-0">
                                    <p className="text-[9px] font-bold truncate leading-tight" style={{ color: col.text }}>
                                      {cleanName(r?.subject_name || '')}
                                    </p>
                                    <p className="text-[10px] font-extrabold truncate leading-tight mt-0.5" style={{ color: col.dot }}>
                                      {cleanName(r?.name || '?')} · {item.video_count} Vid
                                    </p>
                                  </div>
                                  <button
                                    onClick={e => { e.stopPropagation(); handleProgressClick(item, r) }}
                                    className={\`h-5 w-5 rounded flex items-center justify-center shrink-0 transition-all \${
                                      (item.watched_count || 0) >= item.video_count 
                                        ? 'bg-emerald-500 text-white' 
                                        : 'bg-white/60 text-slate-400 hover:bg-emerald-100 hover:text-emerald-600'
                                    }\`}
                                    title={\`İzlenen: \${item.watched_count || 0} / \${item.video_count}\`}
                                  >
                                    <Check className="h-3 w-3" />
                                  </button>
                                </div>
                                {(item.watched_count || 0) > 0 && (
                                  <div className="w-full bg-black/5 rounded-full h-1 mt-1.5 overflow-hidden">
                                    <div 
                                      className="h-full bg-emerald-500 transition-all" 
                                      style={{ width: \`\${Math.min(100, ((item.watched_count || 0) / item.video_count) * 100)}%\` }} 
                                    />
                                  </div>
                                )}
                                <button
                                  onClick={e => handleDeleteItem(e, item.id)}
                                  className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover/item:opacity-100 transition-all shadow-sm hover:bg-red-600 active:scale-90"
                                >
                                  <X className="h-2.5 w-2.5" />
                                </button>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}`)

fs.writeFileSync('src/pages/VideoPlan.tsx', content)
