FROM node:24.22.1-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY server.js ./
COPY lib/ ./lib/
COPY public/ ./public/

EXPOSE 3000

CMD ["node", "server.js"]
