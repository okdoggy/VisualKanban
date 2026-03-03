FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV VK_STATE_SYNC_ENABLED=true
ENV VK_STATE_SYNC_POLL_INTERVAL_MS=5000
ENV NEXT_PUBLIC_VK_STATE_SYNC_ENABLED=true
ENV NEXT_PUBLIC_VK_STATE_SYNC_POLL_INTERVAL_MS=5000
ENV NEXT_PUBLIC_VK_STATE_WORKSPACE_ID=main

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

USER appuser
EXPOSE 3000
CMD ["node", "server.js"]
