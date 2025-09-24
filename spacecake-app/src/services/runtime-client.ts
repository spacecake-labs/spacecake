import { Database } from "@/services/database"
import { Migrations } from "@/services/migrations"
import { Layer, ManagedRuntime } from "effect"

const MainLayer = Layer.mergeAll(Migrations.Default, Database.Default)

export const RuntimeClient = ManagedRuntime.make(MainLayer)
