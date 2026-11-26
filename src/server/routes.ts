import path from 'node:path'

import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as HttpRouter from 'effect/http/HttpRouter'
import * as HttpServerRequest from 'effect/http/HttpServerRequest'
import * as HttpServerResponse from 'effect/http/HttpServerResponse'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'

import { SharedGameState } from '../model'
import type { AuthRequestMeta } from './auth'
import { AuthService } from './auth'
import { ServerConfig } from './config'
import { GameStore } from './store'

const PinBody = Schema.Struct({ pin: Schema.String })
const InviteBody = Schema.Struct({ code: Schema.String })

const extractMeta = (request: HttpServerRequest.HttpServerRequest): AuthRequestMeta => {
  const forwarded = request.headers['x-forwarded-for']
  const forwardedIp = forwarded !== undefined && forwarded.length > 0 ? (forwarded.split(',')[0]?.trim() ?? '') : ''
  const clientIp = forwardedIp.length > 0 ? forwardedIp : Option.getOrElse(request.remoteAddress, () => 'local')
  const secure = request.headers['x-forwarded-proto'] === 'https'
  return {
    cookies: request.cookies,
    clientIp,
    secure,
  }
}

const jsonResponse = (body: unknown, status = 200): HttpServerResponse.HttpServerResponse =>
  HttpServerResponse.jsonUnsafe(body, { status })

const withOptionalSetCookie = (
  response: HttpServerResponse.HttpServerResponse,
  cookieHeader: Option.Option<string>
): HttpServerResponse.HttpServerResponse =>
  Option.match(cookieHeader, {
    onNone: () => response,
    onSome: (cookie) => HttpServerResponse.setHeader(response, 'set-cookie', cookie),
  })

const serveDistFile = (pathname: string) =>
  Effect.gen(function* serveStatic() {
    const config = yield* ServerConfig
    const fs = yield* FileSystem.FileSystem
    const distRoot = path.resolve(config.distDir)
    const safeRelative = path
      .normalize(pathname)
      .replace(/^(?:\.\.(?:\/|\\|$))+/u, '')
      .replace(/^\/+/u, '')
    const candidate =
      safeRelative.length > 0 ? path.resolve(distRoot, safeRelative) : path.resolve(distRoot, 'index.html')

    const insideDist = candidate.startsWith(distRoot)
    const candidateExists = insideDist
      ? yield* fs.exists(candidate).pipe(Effect.catch(() => Effect.succeed(false)))
      : false
    const isFile = candidateExists
      ? yield* fs.stat(candidate).pipe(
          Effect.map((info) => info.type === 'File'),
          Effect.catch(() => Effect.succeed(false))
        )
      : false

    const targetPath = isFile ? candidate : path.resolve(distRoot, 'index.html')
    const isImmutableAsset = isFile && pathname.startsWith('/assets/')
    const cacheControl = isImmutableAsset ? 'public, max-age=31536000, immutable' : 'no-cache'

    return yield* HttpServerResponse.file(targetPath, {
      headers: { 'cache-control': cacheControl },
    }).pipe(Effect.catch(() => Effect.succeed(jsonResponse({ error: 'Not found' }, 404))))
  })

// oxlint-disable-next-line react-hooks/rules-of-hooks -- HttpRouter.use is an Effect combinator, not a React hook.
export const BingoRoutes = HttpRouter.use((router) =>
  Effect.gen(function* registerRoutes() {
    const auth = yield* AuthService
    const store = yield* GameStore

    yield* router.add('GET', '/api/auth/status', (request) =>
      auth.statusFor(extractMeta(request)).pipe(Effect.map((status) => jsonResponse(status)))
    )

    yield* router.add('POST', '/api/auth/caller', (request) =>
      Effect.gen(function* handleCallerAuth() {
        const body = yield* HttpServerRequest.schemaBodyJson(PinBody).pipe(
          Effect.mapError(() => ({ status: 400, message: 'Invalid request' }))
        )
        const result = yield* auth.verifyCallerPin(extractMeta(request), body.pin)
        return withOptionalSetCookie(jsonResponse(result.status), result.cookieHeader)
      }).pipe(Effect.catch((error) => Effect.succeed(jsonResponse({ error: error.message }, error.status))))
    )

    yield* router.add('POST', '/api/auth/join', (request) =>
      Effect.gen(function* handleJoinAuth() {
        const body = yield* HttpServerRequest.schemaBodyJson(InviteBody).pipe(
          Effect.mapError(() => ({ status: 400, message: 'Invalid request' }))
        )
        const result = yield* auth.verifyInviteCode(extractMeta(request), body.code)
        return withOptionalSetCookie(jsonResponse(result.status), result.cookieHeader)
      }).pipe(Effect.catch((error) => Effect.succeed(jsonResponse({ error: error.message }, error.status))))
    )

    yield* router.add('POST', '/api/auth/logout', (request) =>
      Effect.gen(function* handleLogout() {
        const meta = extractMeta(request)
        const clearedCookie = yield* auth.clearCallerCookie(meta)
        const status = yield* auth.statusFor({
          ...meta,
          cookies: { ...meta.cookies, bingo_caller: undefined },
        })
        return HttpServerResponse.setHeader(jsonResponse(status), 'set-cookie', clearedCookie)
      })
    )

    yield* router.add('GET', '/api/game', (request) =>
      Effect.gen(function* handleGetGame() {
        const allowed = yield* auth.isViewer(extractMeta(request))
        if (!allowed) {
          return jsonResponse({ error: 'Room code required' }, 401)
        }
        const game = yield* store.read
        return jsonResponse(game)
      })
    )

    yield* router.add('PUT', '/api/game', (request) =>
      Effect.gen(function* handlePutGame() {
        const allowed = yield* auth.isCaller(extractMeta(request))
        if (!allowed) {
          return jsonResponse({ error: 'Caller PIN required' }, 401)
        }
        const body = yield* HttpServerRequest.schemaBodyJson(SharedGameState).pipe(
          Effect.mapError(() => 'invalid-body')
        )
        const saved = yield* store.write(body)
        return jsonResponse(saved)
      }).pipe(Effect.catch(() => Effect.succeed(jsonResponse({ error: 'Invalid JSON payload' }, 400))))
    )

    yield* router.add('GET', '/api/events', (request) =>
      Effect.gen(function* handleEvents() {
        const allowed = yield* auth.isViewer(extractMeta(request))
        if (!allowed) {
          return jsonResponse({ error: 'Room code required' }, 401)
        }
        const stream = yield* store.eventStream
        return HttpServerResponse.stream(stream, {
          contentType: 'text/event-stream',
          headers: {
            'cache-control': 'no-cache, no-transform',
            connection: 'keep-alive',
          },
        })
      }).pipe(
        Effect.catchTag('TooManyListenersError', () =>
          Effect.succeed(jsonResponse({ error: 'Too many live listeners' }, 503))
        )
      )
    )

    yield* router.add('GET', '/', (request) =>
      Effect.gen(function* handleRoot() {
        const url = new URL(request.originalUrl, 'http://localhost')
        const joinCode = url.searchParams.get('join')
        if (joinCode !== null) {
          const result = yield* auth.verifyInviteCode(extractMeta(request), joinCode).pipe(Effect.option)
          const redirect = HttpServerResponse.redirect('/', { status: 302 })
          return Option.match(result, {
            onNone: () => redirect,
            onSome: (ok) => withOptionalSetCookie(redirect, ok.cookieHeader),
          })
        }
        return yield* serveDistFile('/')
      })
    )

    yield* router.add('GET', '/*', (request) => {
      const url = new URL(request.originalUrl, 'http://localhost')
      return serveDistFile(url.pathname)
    })
  })
)
