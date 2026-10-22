# ---- Byg appen ----
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html tsconfig.json vite.config.ts ./
COPY public ./public
COPY src ./src
RUN npm run build

# ---- Server: nginx med statiske filer + proxy til Radicale ----
FROM nginx:1.28-alpine
ENV RADICALE_URL=http://radicale:5232 \
    LISTEN_PORT=8080 \
    BASE_PATH=""
COPY docker/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY docker/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO /dev/null "http://127.0.0.1:${LISTEN_PORT}/" || exit 1
