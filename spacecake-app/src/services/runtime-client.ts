import { Database } from "@/services/database"
import { EditorManager } from "@/services/editor-manager"
import { Migrations } from "@/services/migrations"
import { Layer, ManagedRuntime } from "effect"

const MainLayer = Layer.mergeAll(
  Migrations.Default,
  Database.Default,
  EditorManager.Default
)

export const RuntimeClient = ManagedRuntime.make(MainLayer)
