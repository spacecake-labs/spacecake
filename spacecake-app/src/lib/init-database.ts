import { Effect } from "effect"

import { Database } from "@/services/database"
import { Migrations } from "@/services/migrations"
import { RuntimeClient } from "@/services/runtime-client"

export const initializeDatabase = () =>
  RuntimeClient.runPromise(
    Effect.gen(function* () {
      const migration = yield* Migrations
      yield* migration.apply
      return yield* Database
    }),
  )

export type DatabaseInstance = Awaited<ReturnType<typeof initializeDatabase>>
