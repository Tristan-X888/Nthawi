ARG NODE_IMAGE=node:24.21.0-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20

FROM ${NODE_IMAGE} AS tools

WORKDIR /app

RUN npm install --global pnpm@10.16.1


FROM tools AS pruner

RUN npm install --global turbo@2.11.4

COPY . .

RUN turbo prune \
    @nthawi/api \
    @workspace/typescript-config \
    @workspace/eslint-config \
    --docker


FROM tools AS builder

COPY --from=pruner /app/out/json/ ./
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=pruner /app/pnpm-workspace.yaml ./pnpm-workspace.yaml

# Reuse verified package contents without reusing an installed workspace.
RUN --mount=type=cache,id=nthawi-pnpm-store,target=/pnpm/store,sharing=locked \
    pnpm install --store-dir=/pnpm/store --frozen-lockfile

COPY --from=pruner /app/out/full/ ./
COPY --from=pruner /app/pnpm-workspace.yaml ./pnpm-workspace.yaml

RUN pnpm exec turbo run build --filter=@nthawi/api --force


FROM tools AS production-dependencies

WORKDIR /app

COPY --from=pruner /app/out/json/ ./
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=pruner /app/pnpm-workspace.yaml ./pnpm-workspace.yaml

RUN --mount=type=cache,id=nthawi-pnpm-store,target=/pnpm/store,sharing=locked \
    pnpm install --store-dir=/pnpm/store --prod --frozen-lockfile


FROM ${NODE_IMAGE} AS runtime

ENV NODE_ENV=production

WORKDIR /app

COPY --from=production-dependencies --chown=node:node \
    /app/package.json ./package.json

COPY --from=production-dependencies --chown=node:node \
    /app/node_modules ./node_modules

COPY --from=production-dependencies --chown=node:node \
    /app/apps ./apps

COPY --from=production-dependencies --chown=node:node \
    /app/packages ./packages

COPY --from=builder --chown=node:node \
    /app/apps/api/dist ./apps/api/dist

COPY --from=builder --chown=node:node \
    /app/packages/db/dist ./packages/db/dist

COPY --from=builder --chown=node:node \
    /app/packages/tooling/dist ./packages/tooling/dist

COPY --from=builder --chown=node:node \
    /app/packages/contracts/dist ./packages/contracts/dist

USER node

EXPOSE 4000

CMD ["node", "apps/api/dist/main.js"]
