import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'
import * as Queue from 'effect/Queue'
import * as Schema from 'effect/Schema'
import * as Stream from 'effect/Stream'
import { Subscription } from 'foldkit'

import { Message } from './message'
import type { Model } from './model'
import { SharedGameStateJsonString } from './model'

const decodeGameEvent = Schema.decodeUnknownOption(SharedGameStateJsonString)

const gameEventsStream: Stream.Stream<Message> = Stream.callback<Message>((queue) =>
  Effect.acquireRelease(
    Effect.sync(() => {
      if (typeof window === 'undefined' || typeof EventSource === 'undefined') {
        return Option.none<EventSource>()
      }
      const source = new EventSource('/api/events')
      source.addEventListener('open', () => {
        Queue.offerUnsafe(queue, Message.ChangedSyncConnection({ connected: true }))
      })
      source.addEventListener('error', () => {
        Queue.offerUnsafe(queue, Message.ChangedSyncConnection({ connected: false }))
      })
      source.addEventListener('message', (event) => {
        const parsed = decodeGameEvent(event.data)
        if (Option.isSome(parsed)) {
          Queue.offerUnsafe(queue, Message.ReceivedSyncedGame({ game: parsed.value }))
        }
      })
      return Option.some(source)
    }),
    (maybeSource) =>
      Effect.sync(() => {
        if (Option.isSome(maybeSource)) {
          maybeSource.value.close()
        }
      })
  )
)

export const subscriptions = Subscription.make<Model, Message>()((entry) => ({
  liveGameEvents: entry(
    { viewerAuthenticated: Schema.Boolean },
    {
      modelToDependencies: (model) => ({ viewerAuthenticated: model.viewerAuthenticated }),
      dependenciesToStream: ({ viewerAuthenticated }) => (viewerAuthenticated ? gameEventsStream : Stream.empty),
    }
  ),
}))
