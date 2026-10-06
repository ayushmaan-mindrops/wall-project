# Production image: builds the site and runs the dependency-free Node server.
# Mount a volume at /app/data to keep accounts, designs and leads (SQLite).
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG SITE_URL
ENV SITE_URL=${SITE_URL}
RUN npm run build

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production PORT=8080
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
COPY package.json ./
RUN mkdir -p /app/data && chown node:node /app/data
VOLUME ["/app/data"]
EXPOSE 8080
USER node
CMD ["node", "dist-server/prod.js"]
