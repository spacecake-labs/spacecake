import { Context } from "effect"
import { createContext, useContext } from "react"

import { Database } from "@/services/database"

export const DatabaseContext = createContext<Context.Tag.Service<typeof Database>["orm"] | null>(
  null,
)

export const useDatabase = () => {
  const orm = useContext(DatabaseContext)
  if (orm === null) {
    throw new Error("useDatabase must be used within DatabaseProvider")
  }
  return orm
}
