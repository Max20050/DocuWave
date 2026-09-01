FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-alpine AS lint
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run lint
RUN npm run type-check

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Forces the lint stage into the build graph so a failure here fails the image build.
COPY --from=lint /app/package.json /tmp/.lint-ok
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
