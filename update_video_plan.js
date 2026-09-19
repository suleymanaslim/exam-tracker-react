const fs = require('fs')

let content = fs.readFileSync('src/pages/VideoPlan.tsx', 'utf8')

// Remove progress modal state and localStorage
content = content.replace(/const \[showProgressModal.*\n/g, '')
content = content.replace(/const \[watchedProgress.*\n/g, '')
content = content.replace(/\/\/ Load local progress[\s\S]*?catch \(e\) \{\}\n/g, '')
content = content.replace(/const updateWatchedProgress[\s\S]*?\}\n/g, '')

// Replace the modal button
const buttonRegex = /<button onClick=\{\(\) => setShowProgressModal\(true\)\}[\s\S]*?<\/button>\n\s*<div className="w-px h-6 bg-slate-200 mx-1"><\/div>/g
content = content.replace(buttonRegex, '')

// Remove the Progress Modal at the bottom
const modalRegex = /\{\/\* ═══ PROGRESS MODAL ═══ \*\/\}[\s\S]*?<\/AnimatePresence>/g
content = content.replace(modalRegex, '')

fs.writeFileSync('src/pages/VideoPlan.tsx', content)
