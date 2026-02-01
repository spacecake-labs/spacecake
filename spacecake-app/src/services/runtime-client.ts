import { Layer, ManagedRuntime } from "effect"

import { Database } from "@/services/database"
import { EditorManager } from "@/services/editor-manager"
import { Migrations } from "@/services/migrations"

const MainLayer = Layer.mergeAll(Migrations.Default, Database.Default, EditorManager.Default)

export const RuntimeClient = ManagedRuntime.make(MainLayer)
