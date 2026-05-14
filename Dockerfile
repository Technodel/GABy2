FROM node:20-alpine AS builder-server

WORKDIR /app
COPY package.json ./
RUN npm install
COPY tsconfig.json ./
COPY src/server ./src/server
RUN npm run build


FROM node:20-alpine AS builder-renderer

WORKDIR /app/renderer
COPY src/renderer/package.json ./
RUN npm install
COPY src/renderer ./
RUN npm run build


FROM node:20-alpine AS runtime

RUN apk add --no-cache dumb-init

WORKDIR /app

COPY package.json ./
RUN npm install --production

COPY --from=builder-server /app/dist ./dist
COPY --from=builder-renderer /app/renderer/dist ./src/renderer/dist

RUN mkdir -p /data

ENV NODE_ENV=production
ENV GABY_PORT=3000
ENV GABY_DB_PATH=/data/gaby.db

EXPOSE 3000

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/server/index.js"]
