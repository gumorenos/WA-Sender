FROM node:20-bookworm-slim AS deps

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS builder

WORKDIR /app

ARG DATABASE_URL=postgresql://wa_sender:wa_sender_password@postgres-app:5432/wa_sender
ARG AUTH_SECRET=build-placeholder-secret-at-least-32-characters
ARG NEXTAUTH_SECRET=build-placeholder-secret-at-least-32-characters
ARG AUTH_GOOGLE_ID=placeholder.apps.googleusercontent.com
ARG AUTH_GOOGLE_SECRET=placeholder-secret
ARG AUTH_URL=http://localhost:3000
ARG NEXTAUTH_URL=http://localhost:3000

ENV DATABASE_URL=$DATABASE_URL
ENV AUTH_SECRET=$AUTH_SECRET
ENV NEXTAUTH_SECRET=$NEXTAUTH_SECRET
ENV AUTH_GOOGLE_ID=$AUTH_GOOGLE_ID
ENV AUTH_GOOGLE_SECRET=$AUTH_GOOGLE_SECRET
ENV AUTH_URL=$AUTH_URL
ENV NEXTAUTH_URL=$NEXTAUTH_URL
ENV NEXT_TELEMETRY_DISABLED=1

COPY . .
RUN npm run db:generate
RUN npm run build

FROM node:20-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/scripts ./scripts
COPY package.json package-lock.json ./

RUN npm prune --omit=dev && chown -R node:node /app

USER node

EXPOSE 3000

CMD ["npm", "run", "start"]
