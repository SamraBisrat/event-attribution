FROM node:22-alpine
RUN apk add --no-cache openssl

EXPOSE 3000

WORKDIR /app

COPY package.json package-lock.json* ./

RUN npm ci --include=dev && npm cache clean --force

COPY . .

RUN DATABASE_URL=file:build.sqlite npx prisma generate && npm run build && npm prune --omit=dev

ENV NODE_ENV=production
ENV HOST=0.0.0.0

CMD ["npm", "run", "docker-start"]
