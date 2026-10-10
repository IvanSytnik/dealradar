FROM node:22-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production
ENV DB_PATH=/app/data/dealradar.db

COPY package.json package-lock.json ./
# tsx is a runtime dependency; test tooling is skipped
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

COPY tsconfig.json ./
COPY src ./src

RUN mkdir -p /app/data && chown -R node:node /app
USER node

VOLUME ["/app/data"]
CMD ["npx", "tsx", "src/index.ts"]
