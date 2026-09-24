FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
ENV VITE_SITE_URL=https://fb-java-production.up.railway.app
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "server.js"]
