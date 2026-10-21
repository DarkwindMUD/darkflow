FROM node:22.23.4-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY server.js ./
COPY lib/ ./lib/
COPY public/ ./public/

EXPOSE 3000

CMD ["node", "server.js"]
