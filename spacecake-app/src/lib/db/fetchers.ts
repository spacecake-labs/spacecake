import { PgliteError, type DatabaseMethodName } from "@/services/database"

/**
 * calls a Database service method on the main process via IPC.
 * throws PgliteError on failure (for use inside useDbQuery fetchers).
 */
export const fetchDb = async <T>(method: DatabaseMethodName, ...args: unknown[]): Promise<T> => {
  const result = await window.electronAPI.db.invoke(method, ...args)
  if (result._tag === "Left") {
    throw new PgliteError({ cause: result.value.cause })
  }
  return result.value as T
}
