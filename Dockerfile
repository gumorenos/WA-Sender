FROM node:20-bookworm-slim AS deps

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS builder

WORKDIR /app

COPY . .
RUN DATABASE_URL="postgresql://wa_sender:wa_sender_password@postgres-app:5432/wa_sender" npm run db:generate
RUN DATABASE_URL="postgresql://wa_sender:wa_sender_password@postgres-app:5432/wa_sender" \
  AUTH_SECRET="build-placeholder-secret-at-least-32-characters" \
  NEXTAUTH_SECRET="build-placeholder-secret-at-least-32-characters" \
  AUTH_GOOGLE_ID="placeholder.apps.googleusercontent.com" \
  AUTH_GOOGLE_SECRET="placeholder-secret" \
  AUTH_URL="http://localhost:3000" \
  NEXTAUTH_URL="http://localhost:3000" \
  npm run build

FROM node:20-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

# Prisma Client is generated in the builder stage. Copy that node_modules tree,
# then prune development dependencies in the runtime image.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/scripts ./scripts
COPY package.json package-lock.json ./

RUN npm prune --omit=dev && chown -R node:node /app

USER node

EXPOSE 3000

CMD ["npm", "run", "start"]
