import * as Schema from 'effect/Schema'

export class AuthDeniedError extends Schema.TaggedError<AuthDeniedError>()('AuthDeniedError', {
  status: Schema.Number,
  message: Schema.String,
}) {}
