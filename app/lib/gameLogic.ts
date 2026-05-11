export function isFixed(puzzle: number[][], r: number, c: number) {
  return puzzle[r][c] !== 0;
}

export function getBox(r: number, c: number) {
  return Math.floor(r/3)*3 + Math.floor(c/3);
}

export function hasConflict(grid: number[][], r: number, c: number, val: number): boolean {
  if (!val) return false;
  for (let i = 0; i < 9; i++) {
    if (i !== c && grid[r][i] === val) return true;
    if (i !== r && grid[i][c] === val) return true;
  }
  const br = Math.floor(r/3)*3, bc = Math.floor(c/3)*3;
  for (let dr = 0; dr < 3; dr++)
    for (let dc = 0; dc < 3; dc++) {
      const nr = br+dr, nc = bc+dc;
      if ((nr !== r || nc !== c) && grid[nr][nc] === val) return true;
    }
  return false;
}

export function isSolved(grid: number[][], sol: number[][]): boolean {
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 9; c++)
      if (grid[r][c] !== sol[r][c]) return false;
  return true;
}

export function calcScore(elapsedSec: number, mistakes: number): number {
  const mins = Math.floor(elapsedSec / 60);
  return Math.max(0, 180 - mins) + Math.max(0, 100 - mistakes * 10);
}

export function fmtTime(s: number): string {
  const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), ss = s%60;
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
  return `${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
}