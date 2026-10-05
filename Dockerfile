# 多阶段构建：编译 core / server / web → 精简运行镜像
FROM node:20-alpine AS build
WORKDIR /src
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/core/package.json packages/core/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN npm ci --registry=https://registry.npmmirror.com --no-audit --no-fund
COPY packages packages
COPY apps apps
RUN npm run build -w @mingpan/core && npm run build -w @mingpan/server && npm run build -w @mingpan/web \
 && npm prune --omit=dev --workspace @mingpan/server --workspace @mingpan/core --include-workspace-root=false --no-audit --no-fund || npm prune --omit=dev --no-audit --no-fund

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8080
COPY --from=build /src/package.json ./
COPY --from=build /src/node_modules node_modules
COPY --from=build /src/packages/core/package.json packages/core/
COPY --from=build /src/packages/core/dist packages/core/dist
COPY --from=build /src/apps/server/package.json apps/server/
COPY --from=build /src/apps/server/dist apps/server/dist
COPY --from=build /src/apps/server/prompts apps/server/prompts
COPY --from=build /src/apps/server/style apps/server/style
COPY --from=build /src/apps/web/dist apps/web/dist
USER node
EXPOSE 8080
CMD ["node", "apps/server/dist/server.js"]
