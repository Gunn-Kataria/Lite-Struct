# Getting started

## Prerequisites

| Tool | Notes |
|---|---|
| Node.js 20+ | Developed on Node 22 |
| Redis | Any recent version, reachable on `localhost:6379` by default. No modules needed (plain strings, sets and one hash) |
| A modern browser | Chrome/Edge/Firefox/Safari |

## Install

```bash
cd server && npm install
cd ../web && npm install
# optional: end-to-end tests
cd ../e2e && npm install
```

## Run

Three terminals:

```bash
# 1. Redis  (skip if it is already running as a service)
redis-server

# 2. API — http://localhost:4000
cd server && npm start          # node src/index.js   (npm run dev uses nodemon)

# 3. Web app — http://localhost:8081
cd web && npm run dev           # Vite dev server (hot reload)
```

Or from the repository root: `npm run dev:server` and `npm run dev:web`.

Open <http://localhost:8081>. API health check: `GET http://localhost:4000/health` → `{"ok":true}`. The host-application demo is at <http://localhost:8081/host-demo.html> (see [embedding.md](embedding.md)).

## Configuration

### Server (environment variables)

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `4000` | HTTP port |
| `REDIS_HOST` | `127.0.0.1` | Redis host |
| `REDIS_PORT` | `6379` | Redis port |
| `LOG_LEVEL` | `debug` | pino level (`trace`…`fatal`) |
| `API_TOKEN` | *(unset)* | when set, every `/api` request must send `Authorization: Bearer <token>` |
| `CORS_ORIGINS` | *(unset = any origin)* | comma-separated list of allowed browser origins |

### Web app

| Variable | Default | Meaning |
|---|---|---|
| `VITE_API_URL` | `http://localhost:4000` | Base URL of the API (no trailing slash). Read at build/dev-start time. A host application can instead call `configure({ apiUrl })` |

Example: `VITE_API_URL=http://192.168.1.20:4000 npm run dev`. If the API uses `API_TOKEN`, the standalone studio has no way to send it — use `configure({ getAuthToken })` from a host, or leave the token off for local use.

## Production builds

```bash
cd web
npm run build        # static site -> web/dist   (VITE_API_URL is baked in at build time)
npm run build:lib    # embeddable library -> web/dist-lib/tstruct-react.js
npm run preview      # serve web/dist locally
```

Serve `web/dist` from any static host **with an SPA fallback** (unknown paths → `index.html`, because routes like `/structs/...` are client-side). `host-demo.html` is built too and can be dropped if unwanted.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| "Cannot reach server at http://localhost:4000. Is it running?" | API not running or wrong `VITE_API_URL` |
| API logs `Redis error` / requests hang | Redis is not running or `REDIS_HOST`/`REDIS_PORT` are wrong |
| `Cannot PUT /api/structs/...` (HTML error page) | An old API process is still bound to port 4000 — stop it and start `npm start` again |
| Vite says port 8081 is in use | Another dev server is running there (the port is strict, e2e expects 8081) |
| Selection field shows "Could not load options from …" | The field's `apiUrl` is unreachable, returns non-JSON, or blocks cross-origin requests. Use **Retry** once fixed, or edit the definition |
| Location capture does nothing | The browser blocked geolocation. Allow the permission (needs `https` or `localhost`) |
| `401 Unauthorized` from the API | `API_TOKEN` is set on the server but the client sends no/wrong bearer token |
| Browser CORS error | `CORS_ORIGINS` doesn't include the page's origin |

## Resetting data

There is no delete API (deleting structs/records is out of scope). To wipe everything the app has created:

```bash
redis-cli --scan --pattern 'struct:*'  | xargs redis-cli del
redis-cli --scan --pattern 'record:*'  | xargs redis-cli del
redis-cli --scan --pattern 'records:*' | xargs redis-cli del
redis-cli del structs:index structs:keys
```

(Or `FLUSHDB` if the Redis database is used only for this app.) See [redis.md](redis.md).
