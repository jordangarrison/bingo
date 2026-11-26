import { DatabaseSync } from 'node:sqlite'

import * as Array from 'effect/Array'
import * as Clock from 'effect/Clock'
import * as Context from 'effect/Context'
import * as Duration from 'effect/Duration'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as PubSub from 'effect/PubSub'
import * as Ref from 'effect/Ref'
import * as Schema from 'effect/Schema'
import * as Stream from 'effect/Stream'

import { initialCardMarks, MAX_BINGO_NUMBER, MIN_BINGO_NUMBER, TOTAL_CELLS } from '../domain/bingo'
import type { SharedGameState } from '../model'
import { SharedGameStateJsonString } from '../model'
import { ServerConfig } from './config'
import { TooManyListenersError } from './store.errors'

const MAX_SSE_LISTENERS = 50
const encoder = new TextEncoder()

export { TooManyListenersError } from './store.errors'

const defaultGameState = (): SharedGameState => ({
  calledNumbers: [],
  patternId: 'free-play',
  customPatternMask: initialCardMarks(),
})

const sanitizeGameState = (incoming: SharedGameState): SharedGameState => {
  const validNumbers = Array.dedupe(
    Array.filter(
      incoming.calledNumbers,
      (num) => Number.isInteger(num) && num >= MIN_BINGO_NUMBER && num <= MAX_BINGO_NUMBER
    )
  )
  const customPatternMask =
    incoming.customPatternMask.length === TOTAL_CELLS ? incoming.customPatternMask : initialCardMarks()

  return {
    calledNumbers: validNumbers,
    patternId: incoming.patternId,
    customPatternMask,
  }
}

const encodeGameJson = Schema.encodeUnknownSync(SharedGameStateJsonString)
const decodeGameJson = Schema.decodeUnknownOption(SharedGameStateJsonString)

const formatSseEvent = (state: SharedGameState): Uint8Array => encoder.encode(`data: ${encodeGameJson(state)}\n\n`)
const keepaliveChunk = encoder.encode(': keepalive\n\n')

export interface GameStoreShape {
  readonly read: Effect.Effect<SharedGameState>
  readonly write: (incoming: SharedGameState) => Effect.Effect<SharedGameState>
  readonly eventStream: Effect.Effect<Stream.Stream<Uint8Array>, TooManyListenersError>
}

interface SqliteGameRow {
  readonly called_numbers?: unknown
  readonly pattern_id?: unknown
  readonly custom_pattern_mask?: unknown
}

const decodeRow = (row: SqliteGameRow | undefined): SharedGameState => {
  if (row === undefined) {
    return defaultGameState()
  }
  if (
    typeof row.called_numbers !== 'string' ||
    typeof row.pattern_id !== 'string' ||
    typeof row.custom_pattern_mask !== 'string'
  ) {
    return defaultGameState()
  }
  const combined = `{"calledNumbers":${row.called_numbers},"patternId":${JSON.stringify(row.pattern_id)},"customPatternMask":${row.custom_pattern_mask}}`
  return Option.match(decodeGameJson(combined), {
    onNone: defaultGameState,
    onSome: sanitizeGameState,
  })
}

export class GameStore extends Context.Service<GameStore, GameStoreShape>()('bingo/GameStore') {
  public static readonly make = Effect.gen(function* makeGameStore() {
    const config = yield* ServerConfig
    const db = yield* Effect.acquireRelease(
      Effect.sync(() => {
        const database = new DatabaseSync(config.dbPath)
        database.exec(`
          CREATE TABLE IF NOT EXISTS game_state (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            called_numbers TEXT NOT NULL,
            pattern_id TEXT NOT NULL,
            custom_pattern_mask TEXT NOT NULL,
            updated_at TEXT NOT NULL
          )
        `)
        return database
      }),
      (database) =>
        Effect.sync(() => {
          database.close()
        })
    )

    const selectStmt = db.prepare('SELECT called_numbers, pattern_id, custom_pattern_mask FROM game_state WHERE id = 1')
    const upsertStmt = db.prepare(`
      INSERT INTO game_state (id, called_numbers, pattern_id, custom_pattern_mask, updated_at)
      VALUES (1, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        called_numbers = excluded.called_numbers,
        pattern_id = excluded.pattern_id,
        custom_pattern_mask = excluded.custom_pattern_mask,
        updated_at = excluded.updated_at
    `)

    const pubsub = yield* PubSub.unbounded<SharedGameState>()
    const activeListeners = yield* Ref.make(0)

    const read: Effect.Effect<SharedGameState> = Effect.sync(() => {
      const row: SqliteGameRow | undefined = selectStmt.get()
      return decodeRow(row)
    }).pipe(Effect.withSpan('bingo.store.read'))

    const write = Effect.fn('bingo.store.write')(function* writeGame(incoming: SharedGameState) {
      const clean = sanitizeGameState(incoming)
      const nowMillis = yield* Clock.currentTimeMillis
      const updatedAt = new Date(nowMillis).toISOString()
      yield* Effect.sync(() => {
        upsertStmt.run(
          JSON.stringify(clean.calledNumbers),
          clean.patternId,
          JSON.stringify(clean.customPatternMask),
          updatedAt
        )
      })
      yield* PubSub.publish(pubsub, clean)
      return clean
    })

    const eventStream: Effect.Effect<Stream.Stream<Uint8Array>, TooManyListenersError> = Effect.gen(
      function* makeEventStream() {
        const currentCount = yield* Ref.get(activeListeners)
        if (currentCount >= MAX_SSE_LISTENERS) {
          return yield* Effect.fail(new TooManyListenersError({ limit: MAX_SSE_LISTENERS }))
        }
        const initial = yield* read
        const liveUpdates = Stream.fromPubSub(pubsub).pipe(Stream.map(formatSseEvent))
        const keepalive = Stream.tick(Duration.seconds(20)).pipe(Stream.map(() => keepaliveChunk))
        const body = Stream.concat(Stream.succeed(formatSseEvent(initial)), Stream.merge(liveUpdates, keepalive))
        return Stream.ensuring(
          Stream.concat(Stream.fromEffect(Ref.update(activeListeners, (count) => count + 1)).pipe(Stream.drain), body),
          Ref.update(activeListeners, (count) => Math.max(0, count - 1))
        )
      }
    ).pipe(Effect.withSpan('bingo.store.eventStream'))

    return {
      read,
      write,
      eventStream,
    }
  })

  public static readonly layer: Layer.Layer<GameStore, never, ServerConfig> = Layer.effect(this, this.make)
}
