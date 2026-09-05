# syntax=docker/dockerfile:1
FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat openssl

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache git openssh
WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN mkdir -p public

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN npx prisma generate
RUN npm run build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=29870
ENV HOST=0.0.0.0

RUN apk add --no-cache git bash openssh curl procps net-tools docker-cli docker-cli-compose python3 py3-pip && \
    npm install -g serve pm2

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 deploynest

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma ./prisma
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh
RUN mkdir -p /app/data/deployments /var/www
RUN chmod -R 777 /app/data /var/www 2>/dev/null || true

EXPOSE 29870

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["npm", "start"]
