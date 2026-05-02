FROM node:20-alpine AS base
WORKDIR /app
# OpenSSL is required by Prisma's query engine on Alpine
RUN apk add --no-cache openssl
COPY package*.json ./
COPY prisma ./prisma

FROM base AS development
ENV NODE_ENV=development
RUN npm install
RUN npx prisma generate
COPY . .
EXPOSE 3001
# Converts legacy PG enum selector columns to varchar (no data loss), then pushes schema.
# `db push` is dev-oriented; prod uses `prisma migrate deploy`.
CMD ["sh", "-c", "npx prisma generate && node scripts/ensure-text-selector-columns.mjs && npx prisma db push && npm run start:dev"]

FROM base AS build
RUN npm install
RUN npx prisma generate
COPY . .
RUN npm run build

FROM node:20-alpine AS production
ENV NODE_ENV=production
WORKDIR /app
RUN apk add --no-cache openssl
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev
RUN npx prisma generate
COPY --from=build /app/dist ./dist
EXPOSE 3001
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
