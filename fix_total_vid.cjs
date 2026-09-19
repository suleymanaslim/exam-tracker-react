const fs = require('fs')
let content = fs.readFileSync('src/pages/VideoPlan.tsx', 'utf8')
content = content.replace(
  /let totalMin = 0\s*dItems.forEach\(p => \{/,
  `let totalMin = 0\n                    let totalVid = 0\n                    dItems.forEach(p => {\n                      totalVid += p.video_count`
)
fs.writeFileSync('src/pages/VideoPlan.tsx', content)
