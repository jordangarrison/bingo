import { createServer } from 'node:http'

import * as NodeHttpServer from '@effect/platform-node/NodeHttpServer'
import * as NodeRuntime from '@effect/platform-node/NodeRuntime'
import * as Duration from 'effect/Duration'
import * as Effect from 'effect/Effect'
import * as HttpRouter from 'effect/http/HttpRouter'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'

import { AuthService } from './auth'
import { ServerConfig } from './config'
import { BingoRoutes } from './routes'
import { GameStore } from './store'
import { TelemetryLive } from './telemetry'

const StartupBanner = Layer.effectDiscard(
  Effect.gen(function* logStartup() {
    const config = yield* ServerConfig
    yield* Effect.logInfo(`[bingo] listening on http://${config.host}:${config.port} (db: ${config.dbPath})`)
    // Never log a configured PIN: logs go to the journal and to OTLP.
    // A generated PIN is printed once, because there is no other way to learn it.
    yield* Effect.logInfo(
      config.generatedPin
        ? `[bingo-auth] Caller PIN: ${config.callerPin} (auto-generated; set BINGO_CALLER_PIN to choose one)`
        : '[bingo-auth] Caller PIN: configured from BINGO_CALLER_PIN'
    )
    yield* Effect.logInfo(
      Option.isSome(config.inviteCode)
        ? '[bingo-auth] Room invite code: enabled (share /?join=<code>)'
        : '[bingo-auth] Room invite code: off (read-only Live Board is open)'
    )
    yield* Effect.logInfo(
      Option.match(config.otlpEndpoint, {
        onNone: () => '[bingo-otel] OTLP export: disabled (set OTEL_EXPORTER_OTLP_ENDPOINT to enable)',
        onSome: (endpoint) => `[bingo-otel] OTLP export: enabled (${config.otlpServiceName} -> ${endpoint})`,
      })
    )
  })
)

const HttpServerLive = Layer.unwrap(
  Effect.gen(function* buildServerLayer() {
    const config = yield* ServerConfig
    return NodeHttpServer.layer(() => createServer({ requestTimeout: 0 }), {
      host: config.host,
      port: config.port,
      // Live SSE streams never end on their own. Cap the wait so a stop
      // does not hang until systemd sends SIGKILL.
      gracefulShutdownTimeout: Duration.seconds(3),
    })
  })
)

const ServicesLive = Layer.mergeAll(
  TelemetryLive,
  GameStore.layer,
  AuthService.layer,
  StartupBanner,
  HttpServerLive
).pipe(Layer.provideMerge(ServerConfig.layer))

const MainLayer = HttpRouter.serve(BingoRoutes).pipe(Layer.provide(ServicesLive))

NodeRuntime.runMain(Layer.launch(MainLayer))
