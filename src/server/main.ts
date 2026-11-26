import { createServer } from 'node:http'

import * as NodeHttpServer from '@effect/platform-node/NodeHttpServer'
import * as NodeRuntime from '@effect/platform-node/NodeRuntime'
import * as Effect from 'effect/Effect'
import * as HttpRouter from 'effect/http/HttpRouter'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'

import { AuthService } from './auth'
import { ServerConfig } from './config'
import { BingoRoutes } from './routes'
import { GameStore } from './store'

const StartupBanner = Layer.effectDiscard(
  Effect.gen(function* logStartup() {
    const config = yield* ServerConfig
    const pinSource = config.generatedPin
      ? 'auto-generated (set BINGO_CALLER_PIN to customize)'
      : 'from BINGO_CALLER_PIN'
    yield* Effect.logInfo(`[bingo] listening on http://${config.host}:${config.port} (db: ${config.dbPath})`)
    yield* Effect.logInfo(`[bingo-auth] Caller PIN: ${config.callerPin} (${pinSource})`)
    yield* Effect.logInfo(
      Option.isSome(config.inviteCode)
        ? '[bingo-auth] Room invite code: enabled (share /?join=<code>)'
        : '[bingo-auth] Room invite code: off (read-only Live Board is open)'
    )
  })
)

const HttpServerLive = Layer.unwrap(
  Effect.gen(function* buildServerLayer() {
    const config = yield* ServerConfig
    return NodeHttpServer.layer(() => createServer({ requestTimeout: 0 }), {
      host: config.host,
      port: config.port,
    })
  })
)

const ServicesLive = Layer.mergeAll(GameStore.layer, AuthService.layer, StartupBanner, HttpServerLive).pipe(
  Layer.provideMerge(ServerConfig.layer)
)

const MainLayer = HttpRouter.serve(BingoRoutes).pipe(Layer.provide(ServicesLive))

NodeRuntime.runMain(Layer.launch(MainLayer))
