import { defineConfig } from "drizzle-kit"

export default defineConfig({
  dialect: "postgresql",
  schema: ["./src/schema/app.ts", "./src/schema/auth.ts"],
  out: "./drizzle",
})
