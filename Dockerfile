FROM mcr.microsoft.com/playwright:v1.60.0-jammy

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY backend ./backend
COPY frontend ./frontend

ENV NODE_ENV=production
ENV PORT=3000
ENV DATABASE_DIR=/data

RUN npm run build

EXPOSE 3000

CMD ["node", "backend/src/server.js"]
