import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const vietnameseNames = [
  'An','Bình','Châu','Dũng','Em','Phương','Giang','Hà','Hùng','Lan',
  'Mai','Nam','Oanh','Phúc','Quân','Rồng','Sơn','Tâm','Uyên','Vinh',
  'Xuân','Yến','Anh','Bảo','Cường','Đức','Hải','Khoa','Linh','Minh',
  'Ngọc','Quỳnh','Thanh','Thảo','Thịnh','Thu','Tiến','Trang','Trung','Tuấn',
  'Tùng','Vân','Việt','Vũ','Hương','Khánh','Lâm','Long','Nhân','Phong',
]

function randomName(): string {
  if (Math.random() < 0.5) {
    return `Player_${Math.floor(1000 + Math.random() * 9000)}`
  }
  const first = vietnameseNames[Math.floor(Math.random() * vietnameseNames.length)]
  const last  = vietnameseNames[Math.floor(Math.random() * vietnameseNames.length)]
  return `${first}${last}${Math.floor(10 + Math.random() * 90)}`
}

function randomScore(): number {
  const numPuzzles = 10 + Math.floor(Math.random() * 41) // 10-50
  let total = 0
  for (let i = 0; i < numPuzzles; i++) {
    total += 165 + Math.floor(Math.random() * 111) // 165-275
  }
  return total
}

async function seed() {
  const BATCH = 50
  const TOTAL = 1000
  let inserted = 0

  for (let i = 0; i < TOTAL; i += BATCH) {
    const batch = Array.from({ length: Math.min(BATCH, TOTAL - i) }, () => ({
      id: crypto.randomUUID(),
      username: randomName(),
      total_coins: 100 + Math.floor(Math.random() * 401), // 100-500
      total_score: randomScore(),
    }))

    const { error } = await supabase.from('players').insert(batch)
    if (error) { console.error('Insert error:', error.message); process.exit(1) }

    inserted += batch.length
    console.log(`Inserted ${inserted}/${TOTAL}`)
  }

  console.log('Done!')
}

seed()
