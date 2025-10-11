import { Database } from "@/services/database"
import { FileManager } from "@/services/file-manager"
import { Migrations } from "@/services/migrations"
import { Layer, ManagedRuntime } from "effect"

const MainLayer = Layer.mergeAll(
  Migrations.Default,
  Database.Default,
  FileManager.Default
)

export const RuntimeClient = ManagedRuntime.make(MainLayer)
