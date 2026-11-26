import { DatabaseSync } from 'node:sqlite'

const DEFAULT_CUSTOM_MASK = Array.from({ length: 25 }, (_, index) => index === 12)

const DEFAULT_GAME = {
  calledNumbers: [],
  patternId: 'free-play',
  customPatternMask: DEFAULT_CUSTOM_MASK,
}

const VALID_PATTERN_IDS = new Set([
  'free-play',
  'any-line',
  'four-corners',
  'x-pattern',
  'letter-t',
  'postage-stamp',
  'outer-frame',
  'blackout',
  'custom',
])

const sanitizeGameState = (raw) => {
  if (typeof raw !== 'object' || raw === null) {
    return DEFAULT_GAME
  }

  const calledNumbers = Array.isArray(raw.calledNumbers)
    ? [...new Set(raw.calledNumbers.filter((n) => typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 75))]
    : []

  const patternId =
    typeof raw.patternId === 'string' && VALID_PATTERN_IDS.has(raw.patternId) ? raw.patternId : 'free-play'

  const customPatternMask =
    Array.isArray(raw.customPatternMask) &&
    raw.customPatternMask.length === 25 &&
    raw.customPatternMask.every((cell) => typeof cell === 'boolean')
      ? raw.customPatternMask
      : DEFAULT_CUSTOM_MASK

  return { calledNumbers, patternId, customPatternMask }
}

export const createGameStore = (dbPath = 'bingo.db') => {
  const db = new DatabaseSync(dbPath)
  db.exec(`
    CREATE TABLE IF NOT EXISTS game_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      called_numbers TEXT NOT NULL,
      pattern_id TEXT NOT NULL,
      custom_pattern_mask TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `)

  const selectStmt = db.prepare(
    'SELECT called_numbers, pattern_id, custom_pattern_mask FROM game_state WHERE id = 1',
  )
  const upsertStmt = db.prepare(`
    INSERT INTO game_state (id, called_numbers, pattern_id, custom_pattern_mask, updated_at)
    VALUES (1, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      called_numbers = excluded.called_numbers,
      pattern_id = excluded.pattern_id,
      custom_pattern_mask = excluded.custom_pattern_mask,
      updated_at = excluded.updated_at
  `)

  const MAX_LISTENERS = 50
  const listeners = new Set()

  const read = () => {
    const row = selectStmt.get()
    if (!row) {
      return DEFAULT_GAME
    }
    try {
      return sanitizeGameState({
        calledNumbers: JSON.parse(String(row.called_numbers)),
        patternId: String(row.pattern_id),
        customPatternMask: JSON.parse(String(row.custom_pattern_mask)),
      })
    } catch {
      return DEFAULT_GAME
    }
  }

  const write = (incoming) => {
    const clean = sanitizeGameState(incoming)
    upsertStmt.run(
      JSON.stringify(clean.calledNumbers),
      clean.patternId,
      JSON.stringify(clean.customPatternMask),
      new Date().toISOString(),
    )
    const payload = `data: ${JSON.stringify(clean)}\n\n`
    for (const res of listeners) {
      res.write(payload)
    }
    return clean
  }

  const subscribe = (res) => {
    if (listeners.size >= MAX_LISTENERS) {
      res.statusCode = 503
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: 'Too many live listeners' }))
      return
    }
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    })
    res.write(`data: ${JSON.stringify(read())}\n\n`)
    listeners.add(res)
    const heartbeat = setInterval(() => {
      res.write(': keepalive\n\n')
    }, 20_000)
    res.on('close', () => {
      clearInterval(heartbeat)
      listeners.delete(res)
    })
  }

  const close = () => {
    db.close()
  }

  return { read, write, subscribe, close }
}
