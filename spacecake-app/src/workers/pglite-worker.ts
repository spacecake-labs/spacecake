import { PGlite } from "@electric-sql/pglite"
import { live } from "@electric-sql/pglite/live"
import { worker } from "@electric-sql/pglite/worker"

worker({
  async init() {
    return await PGlite.create("idb://spacecake", {
      extensions: { live },
      relaxedDurability: true,
    })
  },
})
