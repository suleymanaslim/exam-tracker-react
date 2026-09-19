const fs = require('fs')
const acorn = require('acorn')
const jsx = require('acorn-jsx')
const parser = acorn.Parser.extend(jsx())

const content = fs.readFileSync('src/pages/VideoPlan.tsx', 'utf8')
try {
  parser.parse(content, { sourceType: 'module', ecmaVersion: 2020 })
  console.log("Parsed successfully")
} catch (e) {
  console.error("Syntax Error at line", e.loc.line, "col", e.loc.column)
  console.error(e.message)
  const lines = content.split('\n')
  console.error(lines[e.loc.line - 1])
  console.error(' '.repeat(e.loc.column) + '^')
}
