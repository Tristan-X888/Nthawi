import assert from "node:assert/strict"
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"

import {
  checkBrowserBoundaries,
  readReferences,
} from "./check-browser-boundaries.mjs"

function fixture(t) {
  const parent = realpathSync(tmpdir())
  const root = realpathSync(mkdtempSync(path.join(parent, "nthawi-boundary-")))

  t.after(() => {
    assert.equal(path.dirname(root), parent)
    assert.ok(path.basename(root).startsWith("nthawi-boundary-"))
    rmSync(root, { recursive: true, force: true })
  })

  function put(relative, content) {
    const destination = path.resolve(root, relative)
    const within = path.relative(root, destination)

    assert.ok(
      within !== ".." &&
        !within.startsWith(".." + path.sep) &&
        !path.isAbsolute(within)
    )

    mkdirSync(path.dirname(destination), { recursive: true })
    writeFileSync(destination, content)
  }

  const config = JSON.stringify({
    compilerOptions: {
      module: "ESNext",
      moduleResolution: "Bundler",
      target: "ES2022",
      jsx: "preserve",
    },
  })

  for (const directory of [
    "apps/widget",
    "packages/ui",
    "packages/contracts",
  ]) {
    put(`${directory}/tsconfig.json`, config)
    put(`${directory}/src/index.ts`, "export {}")
  }

  put(
    "apps/web/tsconfig.json",
    JSON.stringify({
      compilerOptions: {
        module: "ESNext",
        moduleResolution: "Bundler",
        target: "ES2022",
        jsx: "preserve",
        paths: {
          "@/*": ["./*"],
          "@db/*": ["../../packages/db/src/*"],
        },
      },
    })
  )

  return { root, put }
}

test("extracts module references without matching comments or strings", () => {
  const result = readReferences(`
    "use client";
    import type { X } from "@nthawi/db";
    export * from "@nthawi/tooling/env";
    type Y = import("@nthawi/api").Y;
    import("node:fs");
    require(variable);
    // import "@nthawi/db";
    const text = "import '@nthawi/db'";
  `)

  assert.equal(result.client, true)
  assert.deepEqual(
    result.references.map((reference) => reference.specifier),
    ["@nthawi/db", "@nthawi/tooling/env", "@nthawi/api", "node:fs", undefined]
  )

  assert.equal(readReferences('import "react"; "use client";').client, false)
})

const rejected = [
  'import "@nthawi/db"',
  'export * from "@nthawi/db/schema/auth"',
  'import type { ServerEnv } from "@nthawi/tooling/env"',
  'import "@nthawi/api"',
  'import "better-auth"',
  'import "better-auth/node"',
  'import "@better-auth/infra"',
  'import "@better-auth/drizzle-adapter"',
  'import "node:crypto"',
  'import "fs/promises"',
  'import("node:fs")',
  'require("node:fs")',
  "import(variable)",
  "require(variable)",
]

for (const source of rejected) {
  test(`rejects browser reference: ${source}`, (t) => {
    const { root, put } = fixture(t)
    put("apps/web/app/page.tsx", `"use client"; ${source}`)

    assert.ok(checkBrowserBoundaries(root).length > 0)
  })
}

test("permits the existing Better Auth browser entry points", (t) => {
  const { root, put } = fixture(t)

  put(
    "apps/web/app/page.tsx",
    `"use client";
     import "better-auth/react";
     import "better-auth/client";
     import "better-auth/client/plugins";
     import "@better-auth/infra/client";`
  )

  assert.deepEqual(checkBrowserBoundaries(root), [])
})

test("permits Node APIs in a server-only web module", (t) => {
  const { root, put } = fixture(t)
  put("apps/web/lib/server.ts", 'import "node:crypto"')

  assert.deepEqual(checkBrowserBoundaries(root), [])
})

test("follows client aliases and catches a backend alias", (t) => {
  const { root, put } = fixture(t)

  put("apps/web/app/page.tsx", '"use client"; import "@/lib/bridge.js"')
  put("apps/web/lib/bridge.ts", 'export * from "@db/index.js"')
  put("packages/db/src/index.ts", "export {}")

  assert.ok(
    checkBrowserBoundaries(root).some((error) =>
      error.includes("backend workspace")
    )
  )
})

test("checks a helper again when it becomes browser-reachable", (t) => {
  const { root, put } = fixture(t)

  put("apps/web/lib/helper.ts", 'import "node:crypto"')
  put("apps/web/lib/server.ts", 'import "./helper.js"')
  put("apps/web/app/page.tsx", '"use client"; import "../lib/helper.js"')

  assert.ok(
    checkBrowserBoundaries(root).some((error) => error.includes("node:crypto"))
  )
})

test("rejects relative imports into the API", (t) => {
  const { root, put } = fixture(t)

  put("apps/api/src/index.ts", "export {}")
  put("apps/web/app/page.tsx", '"use client"; import "../../api/src/index.js"')

  assert.ok(
    checkBrowserBoundaries(root).some((error) =>
      error.includes("backend workspace")
    )
  )
})

test("does not confuse db-copy with the backend db package", (t) => {
  const { root, put } = fixture(t)

  put(
    "packages/db-copy/tsconfig.json",
    '{"compilerOptions":{"moduleResolution":"Bundler","module":"ESNext"}}'
  )
  put("packages/db-copy/src/index.ts", "export {}")
  put(
    "apps/web/app/page.tsx",
    '"use client"; import "../../../packages/db-copy/src/index.js"'
  )

  assert.deepEqual(checkBrowserBoundaries(root), [])
})

test("rejects unresolved local browser imports", (t) => {
  const { root, put } = fixture(t)
  put("apps/web/app/page.tsx", '"use client"; import "./missing.js"')

  assert.ok(
    checkBrowserBoundaries(root).some((error) => error.includes("Unresolved"))
  )
})

test("handles safe import cycles", (t) => {
  const { root, put } = fixture(t)

  put("packages/ui/src/a.ts", 'import "./b.js"')
  put("packages/ui/src/b.ts", 'import "./a.js"')

  assert.deepEqual(checkBrowserBoundaries(root), [])
})

test("rejects malformed source rather than silently passing", (t) => {
  const { root, put } = fixture(t)
  put("packages/contracts/src/index.ts", "export {")

  assert.throws(() => checkBrowserBoundaries(root))
})

test("rejects server-only modules in a client graph", (t) => {
  const { root, put } = fixture(t)
  put("apps/web/app/page.tsx", '"use client"; import "../lib/private.js"')
  put("apps/web/lib/private.ts", 'import "server-only"')

  assert.ok(
    checkBrowserBoundaries(root).some((error) =>
      error.includes("Forbidden import: server-only")
    )
  )
})

test("requires the owner web source directory", (t) => {
  const { root } = fixture(t)
  const directory = path.join(root, "apps/web")
  assert.equal(realpathSync(directory), directory)
  rmSync(directory, { recursive: true })

  assert.ok(
    checkBrowserBoundaries(root).includes(
      "Missing browser source: " + path.join("apps", "web")
    )
  )
})

test("permits server-only markers outside a client graph", (t) => {
  const { root, put } = fixture(t)
  put("apps/web/lib/server.ts", 'import "server-only"')

  assert.deepEqual(checkBrowserBoundaries(root), [])
})

test("requires a TypeScript configuration for browser source", (t) => {
  const { root, put } = fixture(t)
  put("apps/web/app/page.tsx", '"use client"; export {}')
  const config = path.join(root, "apps/web/tsconfig.json")
  assert.ok(existsSync(config))
  rmSync(config)

  assert.throws(
    () => checkBrowserBoundaries(root),
    /TypeScript configuration is missing/
  )
})

test("rejects invalid inherited TypeScript configurations", (t) => {
  const { root, put } = fixture(t)
  put("packages/ui/tsconfig.json", '{"extends":"./missing.json"}')

  assert.throws(
    () => checkBrowserBoundaries(root),
    /TypeScript configuration is invalid/
  )
})

test("rejects a missing contracts entry point", (t) => {
  const { root } = fixture(t)
  const entry = path.join(root, "packages/contracts/src/index.ts")
  assert.ok(existsSync(entry))
  rmSync(entry)

  assert.ok(
    checkBrowserBoundaries(root).includes(
      "Missing contracts entry point: packages/contracts/src/index.ts"
    )
  )
})

test("follows compiled ESM workspace declarations to their source", (t) => {
  const { root, put } = fixture(t)
  put(
    "packages/browser/tsconfig.json",
    '{"compilerOptions":{"module":"ESNext","moduleResolution":"Bundler"}}'
  )
  put("packages/browser/dist/index.d.mts", "export {}")
  put("packages/browser/src/index.mts", 'import "node:crypto"')
  put(
    "apps/web/app/page.tsx",
    '"use client"; import "../../../packages/browser/dist/index.mjs"'
  )

  assert.ok(
    checkBrowserBoundaries(root).some((error) =>
      error.includes("Forbidden import: node:crypto")
    )
  )
})

test("rejects compiled workspace exports without matching source", (t) => {
  const { root, put } = fixture(t)
  put("packages/browser/dist/index.d.ts", "export {}")
  put(
    "apps/web/app/page.tsx",
    '"use client"; import "../../../packages/browser/dist/index.js"'
  )

  assert.ok(
    checkBrowserBoundaries(root).some((error) =>
      error.includes("Workspace export has no reviewed source")
    )
  )
})

test("checks source inside dot-prefixed route directories", (t) => {
  const { root, put } = fixture(t)
  // Keep the project config valid: TypeScript's default input glob omits dot directories.
  put("apps/web/lib/index.ts", "export {}")
  put("apps/web/app/.well-known/page.tsx", '"use client"; import "node:crypto"')

  assert.ok(
    checkBrowserBoundaries(root).some((error) =>
      error.includes("Forbidden import: node:crypto")
    )
  )
})

test("recognizes client entries discovered in another workspace", (t) => {
  const { root, put } = fixture(t)
  put(
    "apps/web/app/page.tsx",
    'import "../../../packages/shared/src/client.js"'
  )
  put(
    "packages/shared/tsconfig.json",
    '{"compilerOptions":{"module":"ESNext","moduleResolution":"Bundler"}}'
  )
  put("packages/shared/src/client.ts", '"use client"; import "node:crypto"')

  assert.ok(
    checkBrowserBoundaries(root).some((error) =>
      error.includes("Forbidden import: node:crypto")
    )
  )
})
