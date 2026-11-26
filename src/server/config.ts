import { randomBytes } from 'node:crypto'

import * as Config from 'effect/Config'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Random from 'effect/Random'

export interface ServerConfigData {
  readonly host: string
  readonly port: number
  readonly dbPath: string
  readonly distDir: string
  readonly callerPin: string
  readonly generatedPin: boolean
  readonly inviteCode: Option.Option<string>
  readonly sessionSecret: string
  readonly otlpEndpoint: Option.Option<string>
  readonly otlpServiceName: string
  readonly mapleIngestKey: Option.Option<string>
}

const optionalNonEmpty = (name: string): Config.Config<Option.Option<string>> =>
  Config.String(name).pipe(
    Config.withDefault(''),
    Config.map((raw) => {
      const trimmed = raw.trim()
      return trimmed.length > 0 ? Option.some(trimmed) : Option.none()
    })
  )

export class ServerConfig extends Context.Service<ServerConfig, ServerConfigData>()('bingo/ServerConfig') {
  public static readonly make: Effect.Effect<ServerConfigData, Config.ConfigError> = Effect.gen(
    function* makeServerConfig() {
      const host = yield* Config.String('HOST').pipe(Config.withDefault('127.0.0.1'))
      const port = yield* Config.Number('PORT').pipe(Config.withDefault(4173))
      const dbPath = yield* Config.String('BINGO_DB_PATH').pipe(Config.withDefault('bingo.db'))
      const distDir = yield* Config.String('BINGO_DIST_DIR').pipe(Config.withDefault('dist'))
      const configuredPin = yield* optionalNonEmpty('BINGO_CALLER_PIN')
      const inviteCode = yield* optionalNonEmpty('BINGO_INVITE_CODE')
      const configuredSecret = yield* optionalNonEmpty('BINGO_SESSION_SECRET')
      const otlpEndpoint = yield* optionalNonEmpty('OTEL_EXPORTER_OTLP_ENDPOINT')
      const otlpServiceName = yield* Config.String('OTEL_SERVICE_NAME').pipe(Config.withDefault('bingo'))
      const mapleIngestKey = yield* optionalNonEmpty('MAPLE_INGEST_KEY')

      const generatedPin = Option.isNone(configuredPin)
      const fallbackPin = yield* Random.nextIntBetween(100_000, 999_999)
      const callerPin = Option.getOrElse(configuredPin, () => String(fallbackPin))
      const sessionSecret = Option.getOrElse(configuredSecret, () => randomBytes(32).toString('hex'))

      return {
        host,
        port,
        dbPath,
        distDir,
        callerPin,
        generatedPin,
        inviteCode,
        sessionSecret,
        otlpEndpoint,
        otlpServiceName,
        mapleIngestKey,
      }
    }
  )

  public static readonly layer: Layer.Layer<ServerConfig, Config.ConfigError> = Layer.effect(this, this.make)
}
