import { BrowserKeyValueStore } from '@effect/platform-browser'
import * as Array from 'effect/Array'
import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'
import * as KeyValueStore from 'effect/persistence/KeyValueStore'
import * as Random from 'effect/Random'
import * as Schema from 'effect/Schema'
import { Command } from 'foldkit'

import { spokenBall } from './domain/bingo'
import { Message } from './message'
import type { Model } from './model'
import {
  AuthStatusJsonString,
  LocalPrefs,
  LocalPrefsJsonString,
  SharedGameState,
  SharedGameStateJsonString,
  ThemeId,
  toLocalPrefs,
  toSharedGameState,
} from './model'

export const PREFS_STORAGE_KEY = 'thanksgiving-bingo-prefs-v2'
export const GAME_API_URL = '/api/game'
export const AUTH_STATUS_URL = '/api/auth/status'

const AuthErrorBody = Schema.fromJsonString(Schema.Struct({ error: Schema.String }))
const PinPayload = Schema.fromJsonString(Schema.Struct({ pin: Schema.String }))
const InvitePayload = Schema.fromJsonString(Schema.Struct({ code: Schema.String }))

const readAuthError = (bodyText: string, fallback: string): string =>
  Option.match(Schema.decodeUnknownOption(AuthErrorBody)(bodyText), {
    onNone: () => fallback,
    onSome: (parsed) => parsed.error,
  })

export const PersistSharedGame = Command.define('PersistSharedGame', {
  args: { game: SharedGameState },
  messages: [Message.CompletedSideEffect, Message.RejectedCallerWrite],
  execute: ({ game }) =>
    Effect.gen(function* persistGame() {
      const body = yield* Schema.encodeEffect(SharedGameStateJsonString)(game)
      const response = yield* Effect.tryPromise({
        try: () =>
          fetch(GAME_API_URL, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body,
          }),
        catch: () => 'network-error',
      })
      if (response.status === 401) {
        return Message.RejectedCallerWrite()
      }
      return Message.CompletedSideEffect()
    }).pipe(Effect.catch(() => Effect.succeed(Message.CompletedSideEffect()))),
})

export const persistSharedGameCommand = (model: Model): Command.Command<Message> =>
  PersistSharedGame({ game: toSharedGameState(model) })

export const SubmitCallerPin = Command.define('SubmitCallerPin', {
  args: { pin: Schema.String },
  messages: [Message.SucceededAuth, Message.FailedAuth],
  execute: ({ pin }) =>
    Effect.gen(function* submitPin() {
      const body = yield* Schema.encodeEffect(PinPayload)({ pin })
      const response = yield* Effect.tryPromise({
        try: () =>
          fetch('/api/auth/caller', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
          }),
        catch: () => 'Could not reach server.',
      })
      const text = yield* Effect.tryPromise({
        try: () => response.text(),
        catch: () => 'Could not read response.',
      })
      if (!response.ok) {
        return Message.FailedAuth({ error: readAuthError(text, 'Incorrect caller PIN.') })
      }
      const status = yield* Schema.decodeEffect(AuthStatusJsonString)(text)
      return Message.SucceededAuth({ status })
    }).pipe(Effect.catch(() => Effect.succeed(Message.FailedAuth({ error: 'Could not verify PIN.' })))),
})

export const SubmitInviteCode = Command.define('SubmitInviteCode', {
  args: { code: Schema.String },
  messages: [Message.SucceededAuth, Message.FailedAuth],
  execute: ({ code }) =>
    Effect.gen(function* submitInvite() {
      const body = yield* Schema.encodeEffect(InvitePayload)({ code })
      const response = yield* Effect.tryPromise({
        try: () =>
          fetch('/api/auth/join', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
          }),
        catch: () => 'Could not reach server.',
      })
      const text = yield* Effect.tryPromise({
        try: () => response.text(),
        catch: () => 'Could not read response.',
      })
      if (!response.ok) {
        return Message.FailedAuth({ error: readAuthError(text, 'Incorrect room code.') })
      }
      const status = yield* Schema.decodeEffect(AuthStatusJsonString)(text)
      return Message.SucceededAuth({ status })
    }).pipe(Effect.catch(() => Effect.succeed(Message.FailedAuth({ error: 'Could not verify room code.' })))),
})

export const LogoutCaller = Command.define('LogoutCaller', {
  args: {},
  messages: [Message.SucceededAuth, Message.CompletedSideEffect],
  execute: () =>
    Effect.gen(function* logoutCaller() {
      const response = yield* Effect.tryPromise({
        try: () => fetch('/api/auth/logout', { method: 'POST' }),
        catch: () => 'network-error',
      })
      const text = yield* Effect.tryPromise({
        try: () => response.text(),
        catch: () => 'read-error',
      })
      const status = yield* Schema.decodeEffect(AuthStatusJsonString)(text)
      return Message.SucceededAuth({ status })
    }).pipe(Effect.catch(() => Effect.succeed(Message.CompletedSideEffect()))),
})

export const SaveLocalPrefs = Command.define('SaveLocalPrefs', {
  args: { prefs: LocalPrefs },
  messages: [Message.CompletedSideEffect],
  execute: ({ prefs }) =>
    Effect.gen(function* savePrefs() {
      const store = yield* KeyValueStore.KeyValueStore
      const encoded = yield* Schema.encodeEffect(LocalPrefsJsonString)(prefs)
      yield* store.set(PREFS_STORAGE_KEY, encoded)
      return Message.CompletedSideEffect()
    }).pipe(
      Effect.catch(() => Effect.succeed(Message.CompletedSideEffect())),
      Effect.provide(BrowserKeyValueStore.layerLocalStorage)
    ),
})

export const saveLocalPrefsCommand = (model: Model): Command.Command<Message> =>
  SaveLocalPrefs({ prefs: toLocalPrefs(model) })

export const ApplyTheme = Command.define('ApplyTheme', {
  args: { theme: ThemeId },
  messages: [Message.CompletedSideEffect],
  execute: ({ theme }) =>
    Effect.sync(() => {
      if (typeof document !== 'undefined') {
        document.documentElement.dataset.theme = theme
      }
      return Message.CompletedSideEffect()
    }),
})

export const DrawRandomBall = Command.define('DrawRandomBall', {
  args: { pool: Schema.Array(Schema.Number) },
  messages: [Message.DrewBall, Message.CompletedSideEffect],
  execute: ({ pool }) =>
    Effect.gen(function* drawRandomBall() {
      if (pool.length === 0) {
        return Message.CompletedSideEffect()
      }
      const index = yield* Random.nextIntBetween(0, pool.length)
      return Option.match(Array.get(pool, index), {
        onNone: () => Message.CompletedSideEffect(),
        onSome: (number) => Message.DrewBall({ number }),
      })
    }),
})

export const GeneratePrintSeed = Command.define('GeneratePrintSeed', {
  args: {},
  messages: [Message.GeneratedPrintBaseSeed],
  execute: () =>
    Random.nextIntBetween(1000, 999_999).pipe(Effect.map((seed) => Message.GeneratedPrintBaseSeed({ seed }))),
})

export const AnnounceBall = Command.define('AnnounceBall', {
  args: { number: Schema.Number },
  messages: [Message.CompletedSideEffect],
  execute: ({ number }) =>
    Effect.sync(() => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel()
        const utterance = new SpeechSynthesisUtterance(spokenBall(number))
        utterance.rate = 0.92
        window.speechSynthesis.speak(utterance)
      }
      return Message.CompletedSideEffect()
    }),
})

export const TriggerPrint = Command.define('TriggerPrint', {
  args: {},
  messages: [Message.CompletedSideEffect],
  execute: () =>
    Effect.sync(() => {
      if (typeof window !== 'undefined') {
        window.print()
      }
      return Message.CompletedSideEffect()
    }),
})
