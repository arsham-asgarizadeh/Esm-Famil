FROM node:20-alpine AS build
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile && pnpm --filter @esmfamil/server build
CMD ["pnpm","--filter","@esmfamil/server","exec","tsx","src/index.ts"]
