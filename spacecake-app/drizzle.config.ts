import { defineConfig } from "drizzle-kit"

export default defineConfig({
  out: "./src/drizzle", // 👈 Output directory
  schema: "./src/schema/drizzle.ts", // 👈 Schema file (created above)

  dialect: "postgresql",
})
