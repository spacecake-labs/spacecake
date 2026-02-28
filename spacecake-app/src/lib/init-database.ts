import { Database } from "@/services/database"
import { RuntimeClient } from "@/services/runtime-client"

/**
 * returns the Database service instance from the renderer runtime.
 * PGlite creation and migrations now happen in the main process —
 * this just returns the IPC proxy.
 */
export const initializeDatabase = () => RuntimeClient.runPromise(Database)

export type DatabaseInstance = Awaited<ReturnType<typeof initializeDatabase>>
