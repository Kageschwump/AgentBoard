# AgentBoard server (the board + API). Agents run elsewhere, via runner/agentboard-runner.mjs.
FROM node:24-bookworm-slim AS build
WORKDIR /app

# Build tools, in case better-sqlite3 has no prebuilt binary for this platform.
# OpenSSL is needed by Prisma's schema engine.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npx prisma generate && npm run build


FROM node:24-bookworm-slim
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    PORT=3000 \
    DATABASE_URL=file:/data/agentboard.db \
    NEXT_TELEMETRY_DISABLED=1

COPY --from=build /app ./
RUN mkdir -p /data

EXPOSE 3000

# Mount persistent storage at /data. The schema is applied on every start.
CMD ["sh", "-c", "npx prisma db push && exec npx next start -H 0.0.0.0"]
