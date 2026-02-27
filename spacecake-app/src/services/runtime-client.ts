import { Layer, ManagedRuntime } from "effect"

import { DatabaseIpcLayer } from "@/services/database-ipc"
import { EditorManager } from "@/services/editor-manager"

const MainLayer = EditorManager.Default.pipe(Layer.provideMerge(DatabaseIpcLayer))

export const RuntimeClient = ManagedRuntime.make(MainLayer)
