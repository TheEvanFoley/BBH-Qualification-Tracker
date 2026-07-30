FROM node:20-bookworm

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --build-from-source
RUN npx playwright install --with-deps chromium

COPY backend ./backend
COPY frontend ./frontend

ENV NODE_ENV=production
ENV PORT=3000
ENV DATABASE_DIR=/app/backend/data
ENV PLAYWRIGHT_BROWSERS_PATH=/root/.cache/ms-playwright

RUN npm run build

EXPOSE 3000

CMD ["node", "backend/src/server.js"]
