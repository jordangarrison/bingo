import { BrowserKeyValueStore } from '@effect/platform-browser'
import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'
import * as KeyValueStore from 'effect/persistence/KeyValueStore'
import * as Random from 'effect/Random'
import * as Schema from 'effect/Schema'
import type { Runtime } from 'foldkit'

import { ApplyTheme, AUTH_STATUS_URL, GAME_API_URL, PREFS_STORAGE_KEY } from './command'
import { initialCardMarks, TOTAL_CELLS } from './domain/bingo'
import { Message } from './message'
import {
  AuthStatus,
  AuthStatusJsonString,
  LocalPrefs,
  LocalPrefsJsonString,
  Model,
  SharedGameState,
  SharedGameStateJsonString,
} from './model'
import { subscriptions } from './subscription'
import { update } from './update'
import { view } from './view'

export const Flags = Schema.Struct({
  maybeGame: Schema.Option(SharedGameState),
  maybePrefs: Schema.Option(LocalPrefs),
  authStatus: AuthStatus,
  initialPrintBaseSeed: Schema.Number,
})
export type Flags = typeof Flags.Type

const DEFAULT_AUTH_STATUS: AuthStatus = {
  callerAuthenticated: false,
  viewerAuthenticated: true,
  inviteRequired: false,
}

const loadAuthStatus: Effect.Effect<AuthStatus> = Effect.tryPromise({
  try: () => fetch(AUTH_STATUS_URL).then((res) => (res.ok ? res.text() : '')),
  catch: () => 'network-error',
}).pipe(
  Effect.flatMap((text) =>
    text.length === 0
      ? Effect.succeed(DEFAULT_AUTH_STATUS)
      : Schema.decodeEffect(AuthStatusJsonString)(text).pipe(Effect.catch(() => Effect.succeed(DEFAULT_AUTH_STATUS)))
  ),
  Effect.catch(() => Effect.succeed(DEFAULT_AUTH_STATUS))
)

const loadSharedGame: Effect.Effect<Option.Option<SharedGameState>> = Effect.tryPromise({
  try: () => fetch(GAME_API_URL).then((res) => (res.ok ? res.text() : '')),
  catch: () => 'network-error',
}).pipe(
  Effect.flatMap((text) =>
    text.length === 0
      ? Effect.succeed(Option.none<SharedGameState>())
      : Schema.decodeEffect(SharedGameStateJsonString)(text).pipe(
          Effect.map((decoded) => Option.some(decoded)),
          Effect.catch(() => Effect.succeed(Option.none<SharedGameState>()))
        )
  ),
  Effect.catch(() => Effect.succeed(Option.none<SharedGameState>()))
)

export const flags: Effect.Effect<Flags> = Effect.gen(function* loadFlags() {
  const initialPrintBaseSeed = yield* Random.nextIntBetween(1000, 999_999)
  const store = yield* KeyValueStore.KeyValueStore
  const maybeRawPrefs = Option.fromNullishOr(yield* store.get(PREFS_STORAGE_KEY))
  const maybePrefs = yield* Option.match(maybeRawPrefs, {
    onNone: () => Effect.succeed(Option.none<LocalPrefs>()),
    onSome: (raw) =>
      Schema.decodeEffect(LocalPrefsJsonString)(raw).pipe(
        Effect.map((decoded) => Option.some(decoded)),
        Effect.catch(() => Effect.succeed(Option.none<LocalPrefs>()))
      ),
  })
  const authStatus = yield* loadAuthStatus
  const maybeGame = authStatus.viewerAuthenticated ? yield* loadSharedGame : Option.none<SharedGameState>()
  return {
    maybeGame,
    maybePrefs,
    authStatus,
    initialPrintBaseSeed,
  }
}).pipe(
  Effect.catch(() =>
    Effect.succeed({
      maybeGame: Option.none<SharedGameState>(),
      maybePrefs: Option.none<LocalPrefs>(),
      authStatus: DEFAULT_AUTH_STATUS,
      initialPrintBaseSeed: 202_611,
    })
  ),
  Effect.provide(BrowserKeyValueStore.layerLocalStorage)
)

export const init: Runtime.ApplicationInit<Model, Message, Flags> = (loadedFlags) => {
  const fallbackMask = initialCardMarks()

  const theme = Option.match(loadedFlags.maybePrefs, {
    onNone: () => 'felt' as const,
    onSome: (prefs) => prefs.theme,
  })

  const model: Model = {
    activeTab: 'live',
    theme,
    calledNumbers: Option.match(loadedFlags.maybeGame, {
      onNone: () => [],
      onSome: (game) => game.calledNumbers,
    }),
    patternId: Option.match(loadedFlags.maybeGame, {
      onNone: () => 'free-play' as const,
      onSome: (game) => game.patternId,
    }),
    customPatternMask: Option.match(loadedFlags.maybeGame, {
      onNone: () => fallbackMask,
      onSome: (game) => (game.customPatternMask.length === TOTAL_CELLS ? game.customPatternMask : fallbackMask),
    }),
    voiceEnabled: Option.match(loadedFlags.maybePrefs, {
      onNone: () => false,
      onSome: (prefs) => prefs.voiceEnabled,
    }),
    showCalledOnly: Option.match(loadedFlags.maybePrefs, {
      onNone: () => false,
      onSome: (prefs) => prefs.showCalledOnly,
    }),
    confirmingNewGame: false,
    printBaseSeed: Option.match(loadedFlags.maybePrefs, {
      onNone: () => loadedFlags.initialPrintBaseSeed,
      onSome: (prefs) => prefs.printBaseSeed,
    }),
    printCount: Option.match(loadedFlags.maybePrefs, {
      onNone: () => 4 as const,
      onSome: (prefs) => prefs.printCount,
    }),
    syncConnected: Option.isSome(loadedFlags.maybeGame),
    callerAuthenticated: loadedFlags.authStatus.callerAuthenticated,
    viewerAuthenticated: loadedFlags.authStatus.viewerAuthenticated,
    inviteRequired: loadedFlags.authStatus.inviteRequired,
    pinInput: '',
    inviteInput: '',
    authError: Option.none(),
    authSubmitting: false,
  }

  return {
    model,
    commands: [ApplyTheme({ theme })],
  }
}

export { Message, Model, subscriptions, update, view }
