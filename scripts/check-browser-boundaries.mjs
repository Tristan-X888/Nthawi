import { existsSync, readFileSync, readdirSync, realpathSync } from "node:fs"
import { isBuiltin } from "node:module"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import ts from "typescript"

const sourcePattern = /\.(?:[cm]?[jt]sx?)$/
const assets = /\.(?:css|svg|png|jpe?g|gif|webp|ico|woff2?)(?:\?.*)?$/

const ignoredDirectories = new Set([
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".git",
  ".next",
  ".turbo",
])

const backendNames = ["@nthawi/api", "@nthawi/db", "@nthawi/tooling"]

const authClients = new Set([
  "better-auth/client",
  "better-auth/react",
  "better-auth/client/plugins",
  "@better-auth/infra/client",
])

function inside(file, directory) {
  const relative = path.relative(directory, file)

  return (
    relative === "" ||
    (!relative.startsWith(".." + path.sep) &&
      relative !== ".." &&
      !path.isAbsolute(relative))
  )
}

function filesIn(directory) {
  if (!existsSync(directory)) return []

  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) {
      return []
    }

    const file = path.join(directory, entry.name)

    if (entry.isDirectory()) return filesIn(file)
    return sourcePattern.test(file) ? [realpathSync(file)] : []
  })
}

export function readReferences(text, filename = "source.ts") {
  const source = ts.createSourceFile(
    filename,
    text,
    ts.ScriptTarget.Latest,
    true
  )

  if (source.parseDiagnostics.length) {
    throw new Error("Source could not be parsed")
  }

  const references = []

  const add = (node, expression) => {
    references.push({
      position: node.getStart(source),
      specifier:
        expression && ts.isStringLiteralLike(expression)
          ? expression.text
          : undefined,
    })
  }

  function visit(node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier) add(node, node.moduleSpecifier)
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference)
    ) {
      add(node, node.moduleReference.expression)
    } else if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument)
    ) {
      add(node, node.argument.literal)
    } else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) &&
          node.expression.text === "require"))
    ) {
      add(node, node.arguments[0])
    }

    ts.forEachChild(node, visit)
  }

  visit(source)

  let client = false

  for (const statement of source.statements) {
    if (
      !ts.isExpressionStatement(statement) ||
      !ts.isStringLiteral(statement.expression)
    ) {
      break
    }

    if (statement.expression.text === "use client") client = true
  }

  return { source, references, client }
}

export function checkBrowserBoundaries(rootDirectory) {
  const root = realpathSync(rootDirectory)

  const backendDirectories = [
    "apps/api",
    "packages/db",
    "packages/tooling",
  ].map((directory) => {
    const absolute = path.join(root, directory)
    return existsSync(absolute) ? realpathSync(absolute) : absolute
  })

  const browserDirectories = [
    "apps/widget/src",
    "packages/ui/src",
    "packages/contracts/src",
  ].map((directory) => path.join(root, directory))

  const webFiles = filesIn(path.join(root, "apps/web"))
  const browserFiles = browserDirectories.flatMap(filesIn)
  const browserSeeds = new Set(browserFiles)

  const parsed = new Map()
  const configurations = new Map()
  const errors = new Set()
  const visited = new Set()

  function parse(file) {
    if (!parsed.has(file)) {
      parsed.set(file, readReferences(readFileSync(file, "utf8"), file))
    }

    return parsed.get(file)
  }

  function optionsFor(file) {
    const widgetConfig = path.join(root, "apps/widget/tsconfig.app.json")

    const config =
      inside(file, path.join(root, "apps/widget/src")) &&
      existsSync(widgetConfig)
        ? widgetConfig
        : ts.findConfigFile(path.dirname(file), ts.sys.fileExists)

    if (!config || !inside(config, root)) {
      throw new Error("TypeScript configuration is missing")
    }

    if (!configurations.has(config)) {
      const loaded = ts.readConfigFile(config, ts.sys.readFile)

      if (loaded.error) {
        throw new Error("TypeScript configuration is invalid")
      }

      const result = ts.parseJsonConfigFileContent(
        loaded.config,
        ts.sys,
        path.dirname(config)
      )

      if (result.errors.length) {
        throw new Error("TypeScript configuration is invalid")
      }

      configurations.set(config, result.options)
    }

    return configurations.get(config)
  }

  function report(file, reference, message) {
    const location = parse(file).source.getLineAndCharacterOfPosition(
      reference.position
    )

    errors.add(
      `${path.relative(root, file)}:${location.line + 1}:` +
        `${location.character + 1} ${message}`
    )
  }

  function visit(file, browser) {
    file = realpathSync(file)

    const { references, client } = parse(file)
    browser ||= client

    const key = `${file}:${browser}`
    if (visited.has(key)) return
    visited.add(key)

    const options = optionsFor(file)

    for (const reference of references) {
      const name = reference.specifier

      if (name === undefined) {
        if (browser) {
          report(file, reference, "Computed module loading is forbidden")
        }

        continue
      }

      const namedBackend = backendNames.some(
        (entry) => name === entry || name.startsWith(entry + "/")
      )

      const serverAuth =
        ((name === "@better-auth/infra" ||
          name.startsWith("@better-auth/infra/")) &&
          !authClients.has(name)) ||
        name.startsWith("@better-auth/core") ||
        name.startsWith("@better-auth/drizzle-adapter") ||
        ((name === "better-auth" || name.startsWith("better-auth/")) &&
          !authClients.has(name))

      if (
        namedBackend ||
        (browser &&
          (serverAuth ||
            name === "server-only" ||
            name.startsWith("node:") ||
            isBuiltin(name)))
      ) {
        report(file, reference, "Forbidden import: " + name)
        continue
      }

      if (browser && /^(?:https?:|data:|file:)/.test(name)) {
        report(file, reference, "Unsupported module URL")
        continue
      }

      if (assets.test(name)) continue

      let target =
        name === "@nthawi/contracts"
          ? path.join(root, "packages/contracts/src/index.ts")
          : ts.resolveModuleName(name, file, options, ts.sys).resolvedModule
              ?.resolvedFileName

      const alias = Object.keys(options.paths ?? {}).some((pattern) => {
        const [prefix, suffix] = pattern.split("*")

        return suffix === undefined
          ? name === prefix
          : name.startsWith(prefix) && name.endsWith(suffix)
      })

      const workspace =
        name.startsWith("@nthawi/") || name.startsWith("@workspace/")

      if (!target || !existsSync(target)) {
        if (browser && (name.startsWith(".") || alias || workspace)) {
          report(file, reference, "Unresolved workspace/source import: " + name)
        }

        continue
      }

      target = realpathSync(target)

      if (backendDirectories.some((directory) => inside(target, directory))) {
        report(file, reference, "Import resolves to a backend workspace")
        continue
      }

      if (
        !inside(target, root) ||
        inside(target, path.join(root, "node_modules"))
      ) {
        continue
      }

      if (target.includes(path.sep + "dist" + path.sep)) {
        const stem = target
          .replace(path.sep + "dist" + path.sep, path.sep + "src" + path.sep)
          .replace(/(?:\.d)?\.[cm]?[jt]sx?$/, "")

        const extensions = /(?:\.d)?\.m(?:ts|js)$/.test(target)
          ? [".mts", ".mjs"]
          : /(?:\.d)?\.c(?:ts|js)$/.test(target)
            ? [".cts", ".cjs"]
            : [".ts", ".tsx", ".js", ".jsx"]

        target = extensions
          .map((extension) => stem + extension)
          .find(existsSync)

        if (!target) {
          report(file, reference, "Workspace export has no reviewed source")
          continue
        }
      }

      if (sourcePattern.test(target)) visit(target, browser)
    }
  }

  for (const directory of [
    path.join(root, "apps/web"),
    ...browserDirectories,
  ]) {
    if (!existsSync(directory)) {
      errors.add("Missing browser source: " + path.relative(root, directory))
    }
  }

  if (!existsSync(path.join(root, "packages/contracts/src/index.ts"))) {
    errors.add("Missing contracts entry point: packages/contracts/src/index.ts")
  }

  for (const file of webFiles) visit(file, false)

  for (const file of [...webFiles, ...browserFiles]) {
    if (browserSeeds.has(file) || parse(file).client) {
      visit(file, true)
    }
  }

  return [...errors].sort()
}

const invokedPath = process.argv[1]

if (
  invokedPath &&
  import.meta.url === pathToFileURL(path.resolve(invokedPath)).href
) {
  try {
    const root = fileURLToPath(new URL("../", import.meta.url))
    const errors = checkBrowserBoundaries(root)

    if (errors.length) {
      console.error(errors.join("\n"))
      process.exitCode = 1
    } else {
      console.log("Browser import boundaries passed.")
    }
  } catch {
    console.error(
      "Browser boundary check failed to read or parse project source/configuration."
    )
    process.exitCode = 1
  }
}
