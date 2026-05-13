import { Client } from '@notionhq/client'
import type { Trade } from './googleSheets'

function getNotion() {
  return new Client({ auth: process.env.NOTION_API_KEY })
}

// Returns the set of child_page titles directly under a parent block/page.
async function getChildPageTitles(notion: Client, parentId: string): Promise<Set<string>> {
  const titles = new Set<string>()
  let cursor: string | undefined

  do {
    const res = await notion.blocks.children.list({
      block_id: parentId,
      page_size: 100,
      ...(cursor ? { start_cursor: cursor } : {}),
    })
    for (const block of res.results) {
      const b = block as { type: string; child_page?: { title: string } }
      if (b.type === 'child_page' && b.child_page?.title) {
        titles.add(b.child_page.title)
      }
    }
    cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined
  } while (cursor)

  return titles
}

function richText(content: string) {
  return [{ type: 'text' as const, text: { content } }]
}

function heading2(text: string) {
  return { type: 'heading_2' as const, heading_2: { rich_text: richText(text) } }
}

function emptyParagraph() {
  return { type: 'paragraph' as const, paragraph: { rich_text: [] } }
}

function tableCell(content: string) {
  return [{ type: 'text' as const, text: { content } }]
}

function buildTradeTable(trades: Trade[]) {
  const cols = ['Ticket', 'Type', 'Symbol', 'Open Time', 'Close Time', 'Pips', 'Profit', 'Commission']

  const headerRow = {
    type: 'table_row' as const,
    table_row: { cells: cols.map(tableCell) },
  }

  const dataRows = trades.map(t => ({
    type: 'table_row' as const,
    table_row: {
      cells: [
        tableCell(t.ticket),
        tableCell(t.type),
        tableCell(t.symbol),
        tableCell(t.openTime),
        tableCell(t.closeTime),
        tableCell(String(t.pips)),
        tableCell(t.profit.toFixed(2)),
        tableCell(t.commission.toFixed(2)),
      ],
    },
  }))

  return {
    type: 'table' as const,
    table: {
      table_width: cols.length,
      has_column_header: true,
      has_row_header: false,
      children: [headerRow, ...dataRows],
    },
  }
}

function buildPageBlocks(trades: Trade[]) {
  const sections = [
    '🎯 Setup & Reasoning',
    '📈 What Went Well',
    '❌ Mistakes Made',
    '📚 Lessons Learned',
    '🔄 Rule Adjustments',
  ]

  return [
    heading2('📊 Trade Summary'),
    buildTradeTable(trades),
    emptyParagraph(),
    ...sections.flatMap(s => [heading2(s), emptyParagraph()]),
  ]
}

export async function createDailyPages(trades: Trade[]): Promise<number> {
  try {
    const notion = getNotion()
    const parentId = process.env.NOTION_JOURNAL_PARENT_ID!

    console.log('Using parent ID:', parentId)
    console.log('API key prefix:', process.env.NOTION_API_KEY?.slice(0, 10))

    // Group by date (YYYY-MM-DD extracted from open time "2024.01.15 10:30:00")
    const byDate = new Map<string, Trade[]>()
    for (const t of trades) {
      const date = (t.openTime.split(' ')[0] ?? '').replace(/\./g, '-')
      if (!date) continue
      if (!byDate.has(date)) byDate.set(date, [])
      byDate.get(date)!.push(t)
    }

    const existingTitles = await getChildPageTitles(notion, parentId)
    let created = 0

    for (const [date, dayTrades] of byDate) {
      const title = `Journal - ${date}`
      if (existingTitles.has(title)) continue

      const pagePayload = {
        parent: { page_id: parentId },
        properties: {
          title: { title: richText(title) },
        },
        children: buildPageBlocks(dayTrades),
      }

      console.log('Creating page with payload:', JSON.stringify(pagePayload, null, 2))

      try {
        await notion.pages.create(pagePayload)
        created++
      } catch (err: any) {
        console.error('Notion pages.create error:', err?.body || err?.message || JSON.stringify(err))
        console.error('Notion error full:', JSON.stringify(err, null, 2))
        console.log('Using parent ID:', process.env.NOTION_JOURNAL_PARENT_ID)
        console.log('API key prefix:', process.env.NOTION_API_KEY?.slice(0, 10))
        throw err
      }
    }

    return created
  } catch (err) {
    if (err instanceof Error) throw err
    throw new Error(`createDailyPages failed: ${JSON.stringify(err)}`)
  }
}
