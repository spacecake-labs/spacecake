import { PGlite } from "@electric-sql/pglite"

declare global {
  interface Window {
    migrationAPI: {
      sendDump: (dump: ArrayBuffer | null) => Promise<void>
    }
  }
}

async function migrate() {
  try {
    const client = await PGlite.create("idb://spacecake")

    // check if any user tables exist — empty db means fresh install
    const result = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM information_schema.tables WHERE table_schema = 'public'`,
    )

    const tableCount = parseInt(result.rows[0]?.count ?? "0", 10)

    if (tableCount === 0) {
      await client.close()
      await window.migrationAPI.sendDump(null)
      return
    }

    // dump the data directory as a tar.gz blob
    const dumpBlob = await client.dumpDataDir()
    await client.close()

    const arrayBuffer = await dumpBlob.arrayBuffer()
    await window.migrationAPI.sendDump(arrayBuffer)

    // clean up old IndexedDB databases
    if (typeof indexedDB.databases === "function") {
      const dbs = await indexedDB.databases()
      for (const db of dbs) {
        if (db.name && db.name.includes("spacecake")) {
          indexedDB.deleteDatabase(db.name)
        }
      }
    }
  } catch (error) {
    console.error("migration: failed to dump IndexedDB data:", error)
    await window.migrationAPI.sendDump(null)
  }
}

migrate()
