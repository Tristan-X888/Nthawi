# shadcn/ui monorepo template

This is a Next.js monorepo template with shadcn/ui.

## Installing dependencies

Use pnpm 10.16.1, as pinned in `package.json`. The workspace automatically
downloads and uses Node 24.21.0 for pnpm commands and scripts; a global Node 22
installation does not need to be replaced. Check the project runtime with
`pnpm exec node --version` (plain `node --version` reports your global runtime).
The first install requires access to both `nodejs.org` and `registry.npmjs.org`.

```bash
pnpm install --frozen-lockfile
```

On PowerShell, use `pnpm.cmd` if execution policy blocks the `pnpm.ps1` launcher.
Run project tools through `pnpm exec` or `pnpm run` to use the managed runtime.

Root tools use exact versions, and new additions default to exact versions.
When adding or upgrading tools, choose versions explicitly (for example,
`pnpm add -Dw typescript@6.0.3`) and commit both the manifest and lockfile.
An unversioned `pnpm add` can select a new major version even with `saveExact`.
Engine and peer dependency checks reject incompatible dependencies.

If a download fails with `ENOTFOUND`, `ECONNRESET`, or `ETIMEDOUT`, restore the
connection to the official registry and rerun the install. The workspace uses
four concurrent requests, longer timeouts, retries, and cached downloads to
reduce failures on intermittent connections. These settings cannot prevent a
DNS or network outage. Once all packages are cached, you can install without
registry access:

```bash
pnpm install --offline --frozen-lockfile
```

If an interrupted `pnpm add` left the manifest and lockfile out of sync, confirm
the intended dependency versions in `package.json`, then run `pnpm install`
once to reconcile them. Keep the lockfile and package store: deleting them
causes unnecessary downloads. A lockfile-only install does not repair
`node_modules`.

The API tests use Vite's native `resolve.tsconfigPaths`; the obsolete
`vite-tsconfig-paths`/`tsconfck` chain is no longer needed for path aliases.

## Adding components

To add components to your app, run the following command at the root of your `web` app:

```bash
pnpm dlx shadcn@latest add button -c apps/web
```

This will place the ui components in the `packages/ui/src/components` directory.

## Using components

To use the components in your app, import them from the `ui` package.

```tsx
import { Button } from "@workspace/ui/components/button"
```

## Authentication and environment setup

See the [Nthawi authentication setup guide](docs/runbooks/authentication-setup.md) for the implementation,
provider dashboards, private environment configuration, migrations, and tests.
