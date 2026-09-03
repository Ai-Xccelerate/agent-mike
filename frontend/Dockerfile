FROM node:22-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
# NEXT_PUBLIC_* is inlined at `next build`. Railway only forwards vars that
# are declared as ARG here — a Variables save + image redeploy is not enough.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_CORE_API_URL
ARG NEXT_PUBLIC_CORE_APP_URL
ARG NEXT_PUBLIC_WIDGET_ORIGIN
ARG NEXT_PUBLIC_MIKE_WIDGET_SITE_TOKEN
ARG NEXT_PUBLIC_APP_ENV
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_CORE_API_URL=$NEXT_PUBLIC_CORE_API_URL
ENV NEXT_PUBLIC_CORE_APP_URL=$NEXT_PUBLIC_CORE_APP_URL
ENV NEXT_PUBLIC_WIDGET_ORIGIN=$NEXT_PUBLIC_WIDGET_ORIGIN
ENV NEXT_PUBLIC_MIKE_WIDGET_SITE_TOKEN=$NEXT_PUBLIC_MIKE_WIDGET_SITE_TOKEN
ENV NEXT_PUBLIC_APP_ENV=$NEXT_PUBLIC_APP_ENV
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
EXPOSE 3000
CMD ["node", "server.js"]

