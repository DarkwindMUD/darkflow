FROM node:22.23.4-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY client/ ./client/
COPY public/ ./public/
COPY lib/ ./lib/
COPY scripts/ ./scripts/
COPY test/typia-sentinel.mjs ./test/typia-sentinel.mjs
COPY tsconfig.json tsconfig.node.json vite.config.ts ./
RUN npm run build

FROM node:22.23.4-alpine AS runtime

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server.js ./
COPY lib/ ./lib/
COPY --from=builder /app/dist/client/ ./dist/client/

EXPOSE 3000

CMD ["node", "server.js"]
