import * as Option from 'effect/Option'
import { describe, expect, it } from 'vitest'

import { init, Message, update } from '../src/main'

const makeInitialModel = (callerAuthenticated = true) =>
  init({
    maybeGame: Option.none(),
    maybePrefs: Option.none(),
    authStatus: {
      callerAuthenticated,
      viewerAuthenticated: true,
      inviteRequired: false,
    },
    initialPrintBaseSeed: 54_321,
  }).model

describe('bingo update state machine', () => {
  it('blocks caller mutations until caller PIN is unlocked', () => {
    const locked = makeInitialModel(false)
    expect(update(locked, Message.DrewBall({ number: 14 })).model.calledNumbers).toEqual([])
    expect(update(locked, Message.ToggledBoardNumber({ number: 52 })).model.calledNumbers).toEqual([])

    const unlocked = update(
      locked,
      Message.SucceededAuth({
        status: { callerAuthenticated: true, viewerAuthenticated: true, inviteRequired: false },
      })
    ).model
    expect(unlocked.callerAuthenticated).toBe(true)
    expect(update(unlocked, Message.DrewBall({ number: 14 })).model.calledNumbers).toEqual([14])
  })

  it('locks caller controls when server rejects a write with 401', () => {
    const unlocked = makeInitialModel(true)
    const rejected = update(unlocked, Message.RejectedCallerWrite()).model
    expect(rejected.callerAuthenticated).toBe(false)
    expect(Option.isSome(rejected.authError)).toBe(true)
  })

  it('draws, manually toggles, and undoes called balls when unlocked', () => {
    const initial = makeInitialModel(true)
    expect(initial.activeTab).toBe('live')

    const afterDraw = update(initial, Message.DrewBall({ number: 14 }))
    expect(afterDraw.model.calledNumbers).toEqual([14])
    expect(afterDraw.commands).toHaveLength(1)

    const afterManual = update(afterDraw.model, Message.ToggledBoardNumber({ number: 52 }))
    expect(afterManual.model.calledNumbers).toEqual([14, 52])

    const afterUnmark = update(afterManual.model, Message.ToggledBoardNumber({ number: 14 }))
    expect(afterUnmark.model.calledNumbers).toEqual([52])

    const afterUndo = update(afterUnmark.model, Message.ClickedUndoLastCall())
    expect(afterUndo.model.calledNumbers).toEqual([])
  })

  it('requires confirmation before clearing an active game', () => {
    const started = update(makeInitialModel(true), Message.DrewBall({ number: 7 })).model

    const asked = update(started, Message.ClickedNewGame()).model
    expect(asked.confirmingNewGame).toBe(true)
    expect(asked.calledNumbers).toEqual([7])

    const cancelled = update(asked, Message.CancelledNewGame()).model
    expect(cancelled.confirmingNewGame).toBe(false)
    expect(cancelled.calledNumbers).toEqual([7])

    const confirmed = update(asked, Message.ConfirmedNewGame()).model
    expect(confirmed.confirmingNewGame).toBe(false)
    expect(confirmed.calledNumbers).toEqual([])
  })

  it('switches to custom pattern when toggling a cell on the pattern grid', () => {
    const initial = makeInitialModel(true)
    const preset = update(initial, Message.SelectedPattern({ patternId: 'four-corners' })).model
    expect(preset.patternId).toBe('four-corners')

    const custom = update(preset, Message.ToggledCustomPatternCell({ index: 2 })).model
    expect(custom.patternId).toBe('custom')
    expect(custom.customPatternMask[2]).toBe(true)
  })

  it('switches color schemes and toggles called-only filter', () => {
    const initial = makeInitialModel(false)
    expect(initial.theme).toBe('felt')

    const switched = update(initial, Message.SelectedTheme({ theme: 'high-contrast' }))
    expect(switched.model.theme).toBe('high-contrast')
    expect(switched.commands).toHaveLength(2)

    const filtered = update(switched.model, Message.ToggledShowCalledOnly())
    expect(filtered.model.showCalledOnly).toBe(true)
    expect(filtered.commands).toHaveLength(1)
  })

  it('applies synced SQLite updates from SSE', () => {
    const initial = makeInitialModel(false)
    const synced = update(
      initial,
      Message.ReceivedSyncedGame({
        game: {
          calledNumbers: [3, 19, 44],
          patternId: 'x-pattern',
          customPatternMask: initial.customPatternMask,
        },
      })
    ).model

    expect(synced.calledNumbers).toEqual([3, 19, 44])
    expect(synced.patternId).toBe('x-pattern')
    expect(synced.syncConnected).toBe(true)
  })

  it('announces drawn balls only when voice is enabled', () => {
    const silent = makeInitialModel(true)
    const silentDraw = update(silent, Message.DrewBall({ number: 33 }))
    expect(silentDraw.commands).toHaveLength(1)

    const voiced = update(silent, Message.ToggledVoice()).model
    const voicedDraw = update(voiced, Message.DrewBall({ number: 33 }))
    expect(voicedDraw.commands).toHaveLength(2)
  })
})
