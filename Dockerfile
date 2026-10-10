# Stage 1: build the React frontend (web/). Without web/dist the server falls back to the classic UI in public/.
FROM node:22-alpine AS web
WORKDIR /web
COPY web/package*.json ./
RUN npm install --no-audit --no-fund
COPY web/ ./
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY . .
COPY --from=web /web/dist ./web/dist
ENV NODE_ENV=production PORT=3000 DB_FILE=/data/club.db
# Mount a persistent disk at /data. ORGANIZER_KEY, PASS_SECRET and JWT_SECRET must be provided at run time.
VOLUME /data
EXPOSE 3000
# seed.js is a no-op once the events table has data, so restarts never wipe registrations.
CMD ["sh", "-c", "node --no-warnings server/seed.js && exec node --no-warnings server/index.js"]
