# بناء صورة الـ API — السياق هو جذر الـ monorepo.
FROM node:20-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
RUN apt-get update -y && apt-get install -y openssl unzip && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS build
COPY package.json pnpm-workspace.yaml .npmrc tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --no-frozen-lockfile
COPY packages ./packages
COPY apps/api ./apps/api
RUN pnpm --filter @ibp/db generate
RUN pnpm --filter @ibp/api build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app /app
WORKDIR /app/apps/api
RUN chmod +x docker-entrypoint.sh
EXPOSE 4000
# نقطة الدخول تطبّق الهجرات (prisma migrate deploy) ثم تُقلع — عطّلها بـ SKIP_MIGRATIONS=true
ENTRYPOINT ["./docker-entrypoint.sh"]
