# Builds the SPA and serves it (plus the API reverse proxy) with nginx.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
LABEL org.opencontainers.image.title="lalita-erp-web"
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
RUN addgroup -S web && adduser -S -G web web \
 && chown -R web:web /usr/share/nginx/html /var/cache/nginx \
 && sed -i 's|user  nginx;|user  web;|' /etc/nginx/nginx.conf
USER web
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:8080/ >/dev/null || exit 1
