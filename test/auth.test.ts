import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import { describe, expect, it } from 'vitest'

import type { AuthRequestMeta } from '../src/server/auth'
import { AuthService, CALLER_COOKIE_NAME, VIEWER_COOKIE_NAME } from '../src/server/auth'
import { ServerConfig } from '../src/server/config'

const makeTestLayer = (overrides: { readonly callerPin: string; readonly inviteCode?: string }) =>
  AuthService.layer.pipe(
    Layer.provide(
      Layer.succeed(ServerConfig, {
        host: '127.0.0.1',
        port: 4173,
        dbPath: ':memory:',
        distDir: 'dist',
        callerPin: overrides.callerPin,
        generatedPin: false,
        inviteCode: overrides.inviteCode === undefined ? Option.none() : Option.some(overrides.inviteCode),
        sessionSecret: 'test-session-secret',
      })
    )
  )

const makeMeta = (
  cookies: Readonly<Record<string, string | undefined>> = {},
  clientIp = '127.0.0.1'
): AuthRequestMeta => ({
  cookies,
  clientIp,
  secure: false,
})

const extractCookieValue = (cookieHeader: Option.Option<string>, name: string): string => {
  const header = Option.getOrElse(cookieHeader, () => '')
  const firstSegment = header.split(';')[0] ?? ''
  const prefix = `${name}=`
  return firstSegment.startsWith(prefix) ? firstSegment.slice(prefix.length) : ''
}

describe('effect AuthService', () => {
  it('verifies Caller PIN and issues a signed HttpOnly cookie', async () => {
    const program = Effect.gen(function* testCallerPin() {
      const auth = yield* AuthService
      const anon = makeMeta()
      expect(yield* auth.isCaller(anon)).toBe(false)
      expect(yield* auth.isViewer(anon)).toBe(true)

      const wrongExit = yield* Effect.exit(auth.verifyCallerPin(anon, '0000'))
      expect(wrongExit._tag).toBe('Failure')

      const ok = yield* auth.verifyCallerPin(anon, '2468')
      expect(ok.status.callerAuthenticated).toBe(true)

      const token = extractCookieValue(ok.cookieHeader, CALLER_COOKIE_NAME)
      expect(yield* auth.isCaller(makeMeta({ [CALLER_COOKIE_NAME]: token }))).toBe(true)
      expect(yield* auth.isCaller(makeMeta({ [CALLER_COOKIE_NAME]: 'caller.tampered' }))).toBe(false)
    }).pipe(Effect.provide(makeTestLayer({ callerPin: '2468' })))

    // oxlint-disable-next-line no-restricted-properties -- Running Effect program in Vitest unit test.
    await Effect.runPromise(program)
  })

  it('gates viewer access when inviteCode is configured', async () => {
    const program = Effect.gen(function* testInviteCode() {
      const auth = yield* AuthService
      const anon = makeMeta()
      expect(yield* auth.isViewer(anon)).toBe(false)

      const ok = yield* auth.verifyInviteCode(anon, 'arrington2026')
      expect(ok.status.viewerAuthenticated).toBe(true)
      expect(ok.status.inviteRequired).toBe(true)

      const token = extractCookieValue(ok.cookieHeader, VIEWER_COOKIE_NAME)
      expect(yield* auth.isViewer(makeMeta({ [VIEWER_COOKIE_NAME]: token }))).toBe(true)
      expect(yield* auth.isCaller(makeMeta({ [VIEWER_COOKIE_NAME]: token }))).toBe(false)
    }).pipe(Effect.provide(makeTestLayer({ callerPin: '2468', inviteCode: 'arrington2026' })))

    // oxlint-disable-next-line no-restricted-properties -- Running Effect program in Vitest unit test.
    await Effect.runPromise(program)
  })

  it('rate limits repeated failed PIN attempts per IP', async () => {
    const program = Effect.gen(function* testRateLimit() {
      const auth = yield* AuthService
      const attacker = makeMeta({}, '203.0.113.10')

      const statuses = yield* Effect.forEach(
        [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
        () =>
          auth.verifyCallerPin(attacker, '1111').pipe(
            Effect.as(200),
            Effect.catchTag('AuthDeniedError', (err) => Effect.succeed(err.status))
          ),
        { concurrency: 1 }
      )
      expect(statuses.at(9)).toBe(401)
      expect(statuses.at(10)).toBe(429)
    }).pipe(Effect.provide(makeTestLayer({ callerPin: '9999' })))

    // oxlint-disable-next-line no-restricted-properties -- Running Effect program in Vitest unit test.
    await Effect.runPromise(program)
  })
})
