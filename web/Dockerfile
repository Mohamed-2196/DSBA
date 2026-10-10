# DSBA Hub web app behind Caddy: TLS, the API under /api, security headers and request size caps.
# Build context: web/. Used by compose.prod.yaml; the server's configuration is deploy/Caddyfile.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# The API's CSRF cookie in production (DSBA_CSRF_COOKIE, __Host-dsba_csrf by default there): the two must agree.
ARG VITE_CSRF_COOKIE=__Host-dsba_csrf
# Analytics stay off without a key (with one, see DSBA_CSP_*_EXTRA in deploy/Caddyfile).
ARG VITE_POSTHOG_KEY=
ENV VITE_CSRF_COOKIE=${VITE_CSRF_COOKIE} \
    VITE_POSTHOG_KEY=${VITE_POSTHOG_KEY}
RUN npx tsc -p tsconfig.json \
    && npx vite build --logLevel warn \
    && node deploy/csp-hashes.mjs dist/index.html > /app/csp-script-hashes

FROM caddy:2.10-alpine
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
COPY --from=build /app/csp-script-hashes /etc/caddy/csp-script-hashes
# The hashes of the built index.html's inline scripts go into the Content-Security-Policy when Caddy reads its
# configuration, so they always match the page this image serves.
CMD ["sh", "-c", "export DSBA_CSP_SCRIPT_HASHES=\"$(cat /etc/caddy/csp-script-hashes)\" && exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile"]
