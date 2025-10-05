import { useLiveQuery } from "@electric-sql/pglite-react"
import type { Query } from "drizzle-orm"
import {
  Data,
  Either,
  flow,
  Match,
  pipe,
  Schema,
  type ParseResult,
} from "effect"

import { useDatabase } from "@/hooks/use-database"

class MissingData extends Data.TaggedError("MissingData") {}
class InvalidData extends Data.TaggedError("InvalidData")<{
  parseError: ParseResult.ParseError
}> {}

const useQueryEffect = <A, I>(
  query: (orm: ReturnType<typeof useDatabase>) => Query,
  schema: Schema.Schema<A, I>
) => {
  const orm = useDatabase()
  const { params, sql } = query(orm)
  const results = useLiveQuery<I>(sql, params)
  return pipe(
    results?.rows,
    Either.fromNullable(() => new MissingData()),
    Either.flatMap(
      flow(
        Schema.decodeEither(Schema.Array(schema)),
        Either.mapLeft((parseError) => new InvalidData({ parseError }))
      )
    )
  )
}

export const useQuery = <A, I>(
  ...args: Parameters<typeof useQueryEffect<A, I>>
) => {
  const results = useQueryEffect(...args)
  return Either.match(results, {
    onLeft: (_) =>
      Match.value(_).pipe(
        Match.tagsExhaustive({
          InvalidData: ({ parseError }) => ({
            error: parseError,
            loading: false as const,
            data: undefined,
            empty: false as const,
          }),
          MissingData: (_) => ({
            loading: true as const,
            data: undefined,
            error: undefined,
            empty: false as const,
          }),
        })
      ),
    onRight: (rows) => ({
      data: rows,
      loading: false as const,
      error: undefined,
      empty: rows.length === 0,
    }),
  })
}

export const useQuerySingle = <A, I>(
  ...args: Parameters<typeof useQueryEffect<A, I>>
) => {
  const results = useQueryEffect(...args)
  return Either.match(results, {
    onLeft: (_) =>
      Match.value(_).pipe(
        Match.tagsExhaustive({
          InvalidData: ({ parseError }) => ({
            error: parseError,
            loading: false as const,
            data: undefined,
            empty: false as const,
          }),
          MissingData: (_) => ({
            loading: true as const,
            data: undefined,
            error: undefined,
            empty: false as const,
          }),
        })
      ),
    onRight: (rows) => {
      const head = rows[0]
      return head === undefined
        ? {
            data: undefined,
            loading: false as const,
            error: undefined,
            empty: true as const,
          }
        : {
            data: head,
            loading: false as const,
            error: undefined,
            empty: false as const,
          }
    },
  })
}
