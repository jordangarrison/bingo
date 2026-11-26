import * as Schema from 'effect/Schema'

export class TooManyListenersError extends Schema.TaggedError<TooManyListenersError>()('TooManyListenersError', {
  limit: Schema.Number,
}) {}
