'use client'

import { isFixed, hasConflict, getBox } from '../lib/gameLogic'

interface Props {
  puzzle: number[][]
  grid: number[][]
  solution: number[][]
  selected: [number, number] | null
  onSelect: (r: number, c: number) => void
  autoAssist: boolean
  highlights: Set<string>
  pending: [number, number, number] | null
}

export default function SudokuGrid({
  puzzle, grid, solution, selected, onSelect, autoAssist, highlights, pending
}: Props) {
  const selBox = selected ? getBox(selected[0], selected[1]) : -1
  const selVal = selected ? grid[selected[0]][selected[1]] : 0

  function cellBg(r: number, c: number) {
    const sel = selected && selected[0] === r && selected[1] === c
    if (sel) return '#dbeafe'
    if (highlights.has(`${r},${c}`)) return '#fff0f0'
    if (autoAssist && selVal && grid[r][c] === selVal) return '#dcfce7'
    if (autoAssist && selected && (selected[0] === r || selected[1] === c)) return '#f0f4ff'
    if (autoAssist && getBox(r,c) === selBox && selected) return '#f8faff'
    return '#ffffff'
  }

  function cellColor(r: number, c: number) {
    const fixed = isFixed(puzzle, r, c)
    const sel = selected && selected[0] === r && selected[1] === c
    const val = grid[r][c]
    if (!val) return '#1e293b'
    const wrong = !fixed && val !== solution[r][c]
    const conflict = !fixed && hasConflict(grid, r, c, val)
    if (fixed) return '#1e293b'
    if (wrong || conflict) return '#dc2626'
    if (pending && pending[0] === r && pending[1] === c) return '#1a56db'
    return '#2563eb'
  }

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(9, 1fr)',
      width: 'min(360px, 90vw)',
      height: 'min(360px, 90vw)',
      border: '3px solid #1e293b',
      borderRadius: 6,
      overflow: 'hidden',
      boxShadow: '0 4px 20px rgba(0,0,0,.12)',
    }}>
      {grid.map((row, r) => row.map((val, c) => {
        const fixed = isFixed(puzzle, r, c)
        return (
          <div
            key={`${r}-${c}`}
            onClick={() => onSelect(r, c)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', userSelect: 'none',
              background: cellBg(r, c),
              borderRight: (c===2||c===5) ? '2px solid #334155' : '1px solid #cbd5e1',
              borderBottom: (r===2||r===5) ? '2px solid #334155' : '1px solid #cbd5e1',
              color: cellColor(r, c),
              fontWeight: fixed ? 700 : 600,
              fontSize: 'min(20px, 4.5vw)',
              transition: 'background .08s',
              boxShadow: highlights.has(`${r},${c}`) && !(selected && selected[0]===r && selected[1]===c)
                ? 'inset 0 0 0 1.5px #fca5a5' : 'none',
            }}
          >
            {val || ''}
          </div>
        )
      }))}
    </div>
  )
}