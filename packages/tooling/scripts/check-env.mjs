import { existsSync } from "node:fs"
import { loadEnvFile } from "node:process"
import { fileURLToPath } from "node:url"
import { loadServerEnv } from "../dist/env.js"

const localEnv = new URL("../../../.env", import.meta.url)
if (existsSync(localEnv)) loadEnvFile(fileURLToPath(localEnv))
try {
  loadServerEnv()
  console.log("Server configuration is valid. No values were printed.")
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Invalid server configuration"
  )
  process.exitCode = 1
}
