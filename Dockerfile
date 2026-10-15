FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --include=dev
COPY . .
RUN npm run build && npm prune --omit=dev
ENV NODE_ENV=production PORT=3001 DB_PATH=/app/data/ajaia.db
EXPOSE 3001
CMD ["node", "server/index.js"]
