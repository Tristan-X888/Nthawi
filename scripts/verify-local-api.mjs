import { resolve } from "node:path"
import { pathToFileURL } from "node:url"

import {
  createCompiledApiEnvironment,
  formatNeonApiError,
  NeonApiVerificationError,
  verifyCompiledApi,
} from "./verify-neon-api.mjs"

function reject() {
  throw new NeonApiVerificationError("configuration")
}

/** Accept only the preserved local database's two restricted runtime logins. */
export function createLocalApiEnvironment(environment, port) {
  if (
    environment.NEON_TARGET !== undefined ||
    environment.NEON_EXPECTED_BRANCH_ID !== undefined
  ) {
    reject()
  }
  for (const [variable, role] of [
    ["DATABASE_URL", "nthawi_business"],
    ["AUTH_DATABASE_URL", "nthawi_auth"],
  ]) {
    let url, username, password
    try {
      url = new URL(environment[variable])
      username = decodeURIComponent(url.username)
      password = decodeURIComponent(url.password)
    } catch {
      reject()
    }
    // Reject connection-string query options: pg permits host/role overrides.
    if (
      !["postgres:", "postgresql:"].includes(url.protocol) ||
      !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
      url.port !== "55433" ||
      url.pathname !== "/nthawi" ||
      username !== role ||
      !password ||
      password.includes("\0") ||
      url.search ||
      url.hash
    ) {
      reject()
    }
  }
  return createCompiledApiEnvironment(environment, port)
}

export async function verifyLocalApi(environment, options = {}) {
  return verifyCompiledApi(environment, createLocalApiEnvironment, options)
}

export function formatLocalApiError(error) {
  return formatNeonApiError(error).replace("NEON_API_", "LOCAL_API_")
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    if (process.argv.length !== 2) reject()
    const result = await verifyLocalApi(process.env)
    console.log(
      `LOCAL_API_ACCEPTANCE_PASSED shutdown_mode=${result.shutdownMode}`
    )
  } catch (error) {
    console.error(formatLocalApiError(error))
    process.exitCode = 1
  }
}
