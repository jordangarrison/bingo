import * as NodeHttpClient from '@effect/platform-node/NodeHttpClient'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Otlp from 'effect/observability/Otlp'
import * as Option from 'effect/Option'

import { ServerConfig } from './config'

export const TelemetryLive: Layer.Layer<never, never, ServerConfig> = Layer.unwrap(
  Effect.gen(function* buildTelemetryLayer() {
    const config = yield* ServerConfig
    if (Option.isNone(config.otlpEndpoint)) {
      return Layer.empty
    }
    const headers: Record<string, string> = Option.match(config.mapleIngestKey, {
      onNone: () => ({}),
      onSome: (key) => ({ 'x-maple-ingest-key': key }),
    })
    return Otlp.layerJson({
      baseUrl: config.otlpEndpoint.value,
      resource: {
        serviceName: config.otlpServiceName,
        serviceVersion: '0.1.0',
      },
      headers,
      compression: 'gzip',
      loggerMergeWithExisting: true,
    }).pipe(Layer.provide(NodeHttpClient.layerFetch))
  })
)
