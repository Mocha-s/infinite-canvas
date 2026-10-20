# Media Staging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an internal seven-day MinIO staging service while preserving the existing browser-local and public MinIO media flows.

**Architecture:** A small Node/TypeScript `media-service` stores raw uploads in an internal MinIO `staging` bucket and exposes same-origin API/media paths through Nginx. The frontend stores staging metadata separately from `storageKey` and `publicUrl`; public uploads remain handled by the existing configured frontend endpoint.

**Tech Stack:** Node 22, TypeScript, Express 5, MinIO JavaScript SDK, Docker Compose, Nginx, React, Zustand, Ant Design, Bun tests.

**Spec:** `docs/superpowers/specs/media-staging-design.md`

## Global Constraints

- Staging files expire after exactly 7 days through MinIO lifecycle configuration.
- Staging URLs are internal-only backups and must never be sent to public AI providers as public reference URLs.
- MinIO credentials remain server-side environment variables.
- Existing public media upload configuration and behavior remain available.
- Local browser IndexedDB remains the first durable copy for generated media.

### Task 1: Media Service

**Files:**
- Create: `media-service/package.json`
- Create: `media-service/tsconfig.json`
- Create: `media-service/src/server.ts`
- Create: `media-service/src/server.test.ts`
- Create: `media-service/Dockerfile`

**Interfaces:**
- Produces `GET /health`, `POST /api/staging/upload`, `DELETE /api/staging/:key`, and `GET /media/:key`.
- Upload response is `{ url: string; storageKey: string; expiresAt: string }`.

- [ ] Write tests for token rejection, MIME/size validation, random staging keys, upload response shape, and missing-object 404 using an in-memory MinIO adapter.
- [ ] Run `bun test media-service/src/server.test.ts` and verify RED before implementation.
- [ ] Implement the service with Express raw-body handling, `MEDIA_STAGING_TOKEN`, `MINIO_ENDPOINT`, `MINIO_PORT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_BUCKET`, and `MEDIA_PUBLIC_BASE_URL` environment variables.
- [ ] Create the staging bucket and lifecycle rule `{ ID: "staging-seven-days", Status: "Enabled", Expiration: { Days: 7 } }` during startup.
- [ ] Limit image uploads to 30 MB and video uploads to 90 MB; reject other MIME types and path-like filenames.
- [ ] Run the service tests and TypeScript build; verify GREEN.

### Task 2: Compose and Nginx

**Files:**
- Modify: `docker-compose.yml`
- Modify: `nginx.conf`
- Create: `.env.example` additions if the repository example exists, otherwise document variables in `docs/content/docs/development/`.

**Interfaces:**
- Compose service names are `media-minio` and `media-service`.
- App Nginx proxies `/media-api/` to `media-service:3001/api/` and `/media/` to `media-service:3001/media/`.

- [ ] Add a MinIO health check and named `media_minio_data` volume.
- [ ] Add the media service build, environment variables, dependency health condition, and internal port 3001.
- [ ] Add Nginx proxy locations with request body size limits and no static fallback.
- [ ] Run `docker compose config` and verify the rendered services, volume, environment names, and proxy targets.

### Task 3: Frontend Staging Client and Settings

**Files:**
- Create: `web/src/services/media-staging.ts`
- Modify: `web/src/stores/use-config-store.ts`
- Modify: `web/src/components/layout/app-config-modal.tsx`
- Modify: `web/src/i18n/locales/zh-CN.ts`
- Modify: `web/src/i18n/locales/en-US.ts`
- Test: `web/tests/media-staging.test.ts`

**Interfaces:**
- `uploadStagingMedia(blob: Blob, filename: string): Promise<{ url: string; storageKey: string; expiresAt: string }>` posts to `/media-api/staging/upload`.
- `AiConfig.stagingUploadEnabled: boolean` defaults to `false`.

- [ ] Write tests for the disabled flag default, upload request headers/body, response validation, and server-error propagation.
- [ ] Run the focused Bun test and verify RED.
- [ ] Implement the client with `withLocalProxy` excluded because the endpoint is same-origin; use `Content-Type`, `Content-Length`, `X-Media-Filename`, and the runtime staging token only if configured.
- [ ] Add the toggle to the existing media storage tab and keep public `mediaUploadUrl`/`mediaUploadToken` untouched.
- [ ] Run the focused and full Web tests; verify GREEN.

### Task 4: Canvas Metadata and Upload Actions

**Files:**
- Modify: `web/src/types/canvas.ts`
- Modify: `web/src/lib/canvas/canvas-generation-helpers.ts`
- Modify: `web/src/pages/canvas/project.tsx`
- Modify: `web/src/components/canvas/canvas-node-hover-toolbar.tsx`
- Modify: `web/src/i18n/locales/zh-CN.ts`
- Modify: `web/src/i18n/locales/en-US.ts`
- Test: `web/tests/canvas-staging.test.ts`

**Interfaces:**
- Image/video/audio metadata gains optional `stagingUrl` and `stagingExpiresAt`.
- `stageCanvasMedia(node): Promise<void>` reads the local IndexedDB media blob and updates only staging metadata.

- [ ] Write tests proving staging metadata does not replace `storageKey` or `publicUrl`, and that local staging references are excluded from `generationReferenceUrls`.
- [ ] Run the focused test and verify RED.
- [ ] Implement image/video/audio staging from local blobs; if no local `storageKey` exists, fail with a localized re-upload message instead of downloading an upstream temporary URL.
- [ ] Add a toolbar action for media nodes and use the existing flat toolbar style.
- [ ] Call the staging helper after successful generated image/video/audio persistence when `stagingUploadEnabled` is true; staging failure must leave the local node successful and show a warning.
- [ ] Run Web tests and manually verify the menu action with a local media node.

### Task 5: Public URL Boundary and Documentation

**Files:**
- Modify: `web/src/lib/canvas/canvas-generation-helpers.ts`
- Modify: `web/src/services/api/image.ts` only where a public URL is explicitly required.
- Modify: `CHANGELOG.md`
- Modify: `docs/content/docs/progress/pending-test.mdx`
- Modify: `docs/content/docs/progress/pending-test.zh-CN.mdx`

- [ ] Add tests proving `stagingUrl` is never selected as a model-facing public reference.
- [ ] Keep public promotion on the existing `uploadPublicMedia` path and only trigger it when the model/request path explicitly requires a public URL.
- [ ] Run `bun test`, `bun run typecheck`, `bun run build`, `docker compose config`, and a Docker smoke test for `/health`, upload, and `/media/...`.
- [ ] Record the user-visible toggle and staging behavior in the changelog and pending-test docs.
