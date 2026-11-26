import { createHmac, timingSafeEqual } from 'node:crypto'

import * as Clock from 'effect/Clock'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as HashMap from 'effect/HashMap'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Ref from 'effect/Ref'

import type { AuthStatus } from '../model'
import { AuthDeniedError } from './auth.errors'
import { ServerConfig } from './config'

export const CALLER_COOKIE_NAME = 'bingo_caller'
export const VIEWER_COOKIE_NAME = 'bingo_viewer'
const MAX_ATTEMPTS = 10
const WINDOW_MS = 5 * 60 * 1000
const COOKIE_MAX_AGE_SECONDS = 24 * 60 * 60

export { AuthDeniedError } from './auth.errors'

export interface AuthRequestMeta {
  readonly cookies: Readonly<Record<string, string | undefined>>
  readonly clientIp: string
  readonly secure: boolean
}

export interface AuthSuccess {
  readonly cookieHeader: Option.Option<string>
  readonly status: AuthStatus
}

interface RateLimitEntry {
  readonly count: number
  readonly windowStart: number
}

const safeEqual = (left: string, right: string): boolean => {
  const leftBuf = Buffer.from(left, 'utf-8')
  const rightBuf = Buffer.from(right, 'utf-8')
  if (leftBuf.length !== rightBuf.length) {
    return false
  }
  return timingSafeEqual(leftBuf, rightBuf)
}

const formatCookie = (name: string, value: string, maxAgeSeconds: number, secure: boolean): string => {
  const base = `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}`
  return secure ? `${base}; Secure` : base
}

export interface AuthServiceShape {
  readonly isCaller: (meta: AuthRequestMeta) => Effect.Effect<boolean>
  readonly isViewer: (meta: AuthRequestMeta) => Effect.Effect<boolean>
  readonly statusFor: (meta: AuthRequestMeta) => Effect.Effect<AuthStatus>
  readonly verifyCallerPin: (meta: AuthRequestMeta, candidate: string) => Effect.Effect<AuthSuccess, AuthDeniedError>
  readonly verifyInviteCode: (meta: AuthRequestMeta, candidate: string) => Effect.Effect<AuthSuccess, AuthDeniedError>
  readonly clearCallerCookie: (meta: AuthRequestMeta) => Effect.Effect<string>
}

export class AuthService extends Context.Service<AuthService, AuthServiceShape>()('bingo/AuthService') {
  public static readonly make = Effect.gen(function* makeAuthService() {
    const config = yield* ServerConfig
    const attemptsRef = yield* Ref.make(HashMap.empty<string, RateLimitEntry>())
    const inviteRequired = Option.isSome(config.inviteCode)

    const signToken = (role: 'caller' | 'viewer'): string => {
      const sig = createHmac('sha256', config.sessionSecret).update(`bingo:${role}:v1`).digest('hex')
      return `${role}.${sig}`
    }

    const callerToken = signToken('caller')
    const viewerToken = signToken('viewer')

    const checkCallerSync = (meta: AuthRequestMeta): boolean => {
      const token = meta.cookies[CALLER_COOKIE_NAME]
      return token !== undefined && token.length > 0 && safeEqual(token, callerToken)
    }

    const checkViewerSync = (meta: AuthRequestMeta): boolean => {
      if (!inviteRequired || checkCallerSync(meta)) {
        return true
      }
      const token = meta.cookies[VIEWER_COOKIE_NAME]
      return token !== undefined && token.length > 0 && safeEqual(token, viewerToken)
    }

    const assertUnderRateLimit = (clientIp: string): Effect.Effect<void, AuthDeniedError> =>
      Effect.gen(function* checkLimit() {
        const now = yield* Clock.currentTimeMillis
        const map = yield* Ref.get(attemptsRef)
        const entry = HashMap.get(map, clientIp)
        if (Option.isSome(entry) && now - entry.value.windowStart <= WINDOW_MS && entry.value.count >= MAX_ATTEMPTS) {
          return yield* Effect.fail(
            new AuthDeniedError({
              status: 429,
              message: 'Too many attempts. Try again in a few minutes.',
            })
          )
        }
      })

    const recordFailure = (clientIp: string): Effect.Effect<void> =>
      Effect.gen(function* record() {
        const now = yield* Clock.currentTimeMillis
        yield* Ref.update(attemptsRef, (map) => {
          const existing = HashMap.get(map, clientIp)
          if (Option.isNone(existing) || now - existing.value.windowStart > WINDOW_MS) {
            return HashMap.set(map, clientIp, { count: 1, windowStart: now })
          }
          return HashMap.set(map, clientIp, {
            count: existing.value.count + 1,
            windowStart: existing.value.windowStart,
          })
        })
      })

    const clearFailures = (clientIp: string): Effect.Effect<void> =>
      Ref.update(attemptsRef, (map) => HashMap.remove(map, clientIp))

    const isCaller = Effect.fn('bingo.auth.isCaller')(function* checkCaller(meta: AuthRequestMeta) {
      return yield* Effect.succeed(checkCallerSync(meta))
    })

    const isViewer = Effect.fn('bingo.auth.isViewer')(function* checkViewer(meta: AuthRequestMeta) {
      return yield* Effect.succeed(checkViewerSync(meta))
    })

    const statusFor = Effect.fn('bingo.auth.statusFor')(function* getStatus(meta: AuthRequestMeta) {
      return yield* Effect.succeed({
        callerAuthenticated: checkCallerSync(meta),
        viewerAuthenticated: checkViewerSync(meta),
        inviteRequired,
      })
    })

    const verifyCallerPin = Effect.fn('bingo.auth.verifyCallerPin')(function* verifyPin(
      meta: AuthRequestMeta,
      candidate: string
    ) {
      yield* assertUnderRateLimit(meta.clientIp)
      if (!safeEqual(candidate.trim(), config.callerPin)) {
        yield* recordFailure(meta.clientIp)
        return yield* Effect.fail(new AuthDeniedError({ status: 401, message: 'Incorrect caller PIN.' }))
      }
      yield* clearFailures(meta.clientIp)
      return {
        cookieHeader: Option.some(formatCookie(CALLER_COOKIE_NAME, callerToken, COOKIE_MAX_AGE_SECONDS, meta.secure)),
        status: {
          callerAuthenticated: true,
          viewerAuthenticated: true,
          inviteRequired,
        },
      }
    })

    const verifyInviteCode = Effect.fn('bingo.auth.verifyInviteCode')(function* verifyInvite(
      meta: AuthRequestMeta,
      candidate: string
    ) {
      if (Option.isNone(config.inviteCode)) {
        return {
          cookieHeader: Option.none(),
          status: {
            callerAuthenticated: checkCallerSync(meta),
            viewerAuthenticated: true,
            inviteRequired: false,
          },
        }
      }
      yield* assertUnderRateLimit(meta.clientIp)
      if (!safeEqual(candidate.trim(), config.inviteCode.value)) {
        yield* recordFailure(meta.clientIp)
        return yield* Effect.fail(new AuthDeniedError({ status: 401, message: 'Incorrect room code.' }))
      }
      yield* clearFailures(meta.clientIp)
      return {
        cookieHeader: Option.some(formatCookie(VIEWER_COOKIE_NAME, viewerToken, COOKIE_MAX_AGE_SECONDS, meta.secure)),
        status: {
          callerAuthenticated: checkCallerSync(meta),
          viewerAuthenticated: true,
          inviteRequired: true,
        },
      }
    })

    const clearCallerCookie = Effect.fn('bingo.auth.clearCallerCookie')(function* clearCookie(meta: AuthRequestMeta) {
      return yield* Effect.succeed(formatCookie(CALLER_COOKIE_NAME, '', 0, meta.secure))
    })

    return {
      isCaller,
      isViewer,
      statusFor,
      verifyCallerPin,
      verifyInviteCode,
      clearCallerCookie,
    }
  })

  public static readonly layer: Layer.Layer<AuthService, never, ServerConfig> = Layer.effect(this, this.make)
}
