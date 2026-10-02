export function getAvailableDays(text: string): number[] {
  if (!text) return []
  const days: number[] = []
  const lines = text.split('\n')
  const regex = /^\s*Day\s+(\d+)\b/i
  for (const line of lines) {
    const match = line.match(regex)
    if (match) {
      const num = parseInt(match[1], 10)
      if (!days.includes(num)) {
        days.push(num)
      }
    }
  }
  return days.sort((a, b) => a - b)
}

export function extractDayContent(text: string, dayNumber: number): string {
  if (!text) return ''
  const lines = text.split('\n')
  const dayRegex = new RegExp(`^\\s*Day\\s+${dayNumber}\\b`, 'i')
  const nextDayRegex = new RegExp(`^\\s*Day\\s+${dayNumber + 1}\\b`, 'i')

  let startIndex = -1
  let endIndex = -1

  for (let i = 0; i < lines.length; i++) {
    if (dayRegex.test(lines[i])) {
      startIndex = i
    } else if (startIndex !== -1 && nextDayRegex.test(lines[i])) {
      endIndex = i
      break
    }
  }

  if (startIndex === -1) {
    return ''
  }

  const sectionLines = endIndex === -1 ? lines.slice(startIndex) : lines.slice(startIndex, endIndex)
  return sectionLines.join('\n').trim()
}
