import * as Array from "effect/Array"
import * as Effect from "effect/Effect"
import * as Either from "effect/Either"
import { flow, pipe } from "effect/Function"
import * as Schema from "effect/Schema"
export const validate = <A, I>(schema: Schema.Schema<A, I>) =>
  flow(
    Schema.decodeEither(schema),
    Either.flip,
    Either.map((error) => error.message),
    Either.getOrNull,
  )

export const singleResult = <A, E>(orFail: () => E) =>
  Effect.flatMap((results: A[]) => pipe(results, Array.head, Effect.mapError(orFail)))

export const maybeSingleResult = <A>() =>
  Effect.flatMap((results: A[]) => Effect.succeed(Array.head(results)))
