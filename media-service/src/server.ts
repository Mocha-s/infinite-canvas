import { randomUUID } from "node:crypto";
import express, { type Express, type Request } from "express";
import { Client } from "minio";

const STAGING_DAYS = 7;
const MAX_IMAGE_BYTES = 30 * 1024 * 1024;
const MAX_VIDEO_BYTES = 90 * 1024 * 1024;
const STAGING_BUCKET = process.env.MINIO_BUCKET || "staging";

type ObjectInfo = { metaData?: Record<string, string>; size?: number };
export type StagingObject = {
  key: string;
  size: number;
  lastModified: Date;
  metaData: Record<string, string>;
};

export type MediaObjectStore = {
  putObject: (
    bucket: string,
    key: string,
    body: Buffer,
    size: number,
    metaData: Record<string, string>,
  ) => Promise<void>;
  getObject: (bucket: string, key: string) => Promise<NodeJS.ReadableStream>;
  statObject: (bucket: string, key: string) => Promise<ObjectInfo>;
  removeObject: (bucket: string, key: string) => Promise<void>;
  listObjects: (bucket: string, prefix: string) => Promise<StagingObject[]>;
  ensureStagingBucket: (bucket: string, days: number) => Promise<void>;
};

export type MediaServiceOptions = {
  store: MediaObjectStore;
  token?: string;
  publicBaseUrl?: string;
  now?: () => number;
};

export function createMediaApp(options: MediaServiceOptions): Express {
  const app = express();
  const now = options.now || Date.now;

    app.get("/health", (_request, response) => response.json({ ok: true }));
    app.get("/api/health", (_request, response) => response.json({ ok: true }));

  app.get("/api/staging/list", async (request, response) => {
    if (!authorized(request, options.token))
      return response.status(401).json({ error: "Unauthorized" });
    try {
      const items = await options.store.listObjects(STAGING_BUCKET, "staging/");
      return response.json({
        items: items.map((item) => ({
          storageKey: item.key,
          url: publicUrl(options.publicBaseUrl, item.key),
          originalName: decodeFilename(
            item.metaData["x-amz-meta-original-name"] ||
            item.metaData["original-name"] ||
            item.metaData["Original-Name"] ||
              item.key.split("/").pop() ||
              item.key,
          ),
          mimeType:
            item.metaData["content-type"] ||
            item.metaData["Content-Type"] ||
            "application/octet-stream",
          bytes: item.size,
          createdAt: item.lastModified.toISOString(),
          expiresAt: new Date(
            item.lastModified.getTime() + STAGING_DAYS * 24 * 60 * 60 * 1000,
          ).toISOString(),
        })),
      });
    } catch (error) {
      console.error(
        "staging list failed",
        error instanceof Error ? error.message : String(error),
      );
      return response
        .status(502)
        .json({ error: "Temporary media storage is unavailable" });
    }
  });

  app.post(
    "/api/staging/upload",
    express.raw({ type: "*/*", limit: `${MAX_VIDEO_BYTES}b` }),
    async (request, response) => {
      if (!authorized(request, options.token))
        return response.status(401).json({ error: "Unauthorized" });
      const contentType = String(request.headers["content-type"] || "")
        .split(";", 1)[0]
        .toLowerCase();
      const maxBytes = contentType.startsWith("image/")
        ? MAX_IMAGE_BYTES
        : contentType.startsWith("video/")
          ? MAX_VIDEO_BYTES
          : 0;
      if (!maxBytes)
        return response
          .status(415)
          .json({ error: "Only image and video uploads are supported" });

      const body = Buffer.isBuffer(request.body)
        ? request.body
        : Buffer.alloc(0);
      if (body.length > maxBytes)
        return response.status(413).json({ error: "Media file is too large" });
        const filename = decodeFilename(String(request.headers["x-media-filename"] || "media"));
      if (
        filename.includes("/") ||
        filename.includes("\\") ||
        filename.length > 160
      )
        return response.status(400).json({ error: "Invalid filename" });

      const extension = extensionFor(contentType, filename);
      const key = `staging/${randomUUID()}${extension}`;
      const expiresAt = new Date(
        now() + STAGING_DAYS * 24 * 60 * 60 * 1000,
      ).toISOString();
      try {
        await options.store.putObject(STAGING_BUCKET, key, body, body.length, {
          "Content-Type": contentType,
          "Cache-Control": "private, max-age=604800",
          "Original-Name": encodeURIComponent(filename),
        });
        return response
          .status(201)
          .json({
            url: publicUrl(options.publicBaseUrl, key),
            storageKey: key,
            expiresAt,
          });
      } catch (error) {
        console.error(
          "staging upload failed",
          error instanceof Error ? error.message : String(error),
        );
        return response
          .status(502)
          .json({ error: "Temporary media storage is unavailable" });
      }
    },
  );

  app.delete("/api/staging/*key", async (request, response) => {
    if (!authorized(request, options.token))
      return response.status(401).json({ error: "Unauthorized" });
    const key = safeStagingKey(request.params.key);
    if (!key)
      return response.status(400).json({ error: "Invalid staging key" });
    try {
      await options.store.removeObject(STAGING_BUCKET, key);
      return response.status(204).end();
    } catch (error) {
      console.error(
        "staging delete failed",
        error instanceof Error ? error.message : String(error),
      );
      return response
        .status(502)
        .json({ error: "Temporary media storage is unavailable" });
    }
  });

  app.delete("/api/staging", async (request, response) => {
    if (!authorized(request, options.token))
      return response.status(401).json({ error: "Unauthorized" });
    const key = safeStagingKey(String(request.query.key || ""));
    if (!key)
      return response.status(400).json({ error: "Invalid staging key" });
    try {
      await options.store.removeObject(STAGING_BUCKET, key);
      return response.status(204).end();
    } catch (error) {
      console.error(
        "staging delete failed",
        error instanceof Error ? error.message : String(error),
      );
      return response
        .status(502)
        .json({ error: "Temporary media storage is unavailable" });
    }
  });

  app.use("/media", async (request, response) => {
    const key = safeStagingKey(request.path.replace(/^\/+/, ""));
    if (!key)
      return response.status(400).json({ error: "Invalid staging key" });
    try {
      const info = await options.store.statObject(STAGING_BUCKET, key);
      const contentType =
        info.metaData?.["content-type"] ||
        info.metaData?.["Content-Type"] ||
        "application/octet-stream";
      response.setHeader("Content-Type", contentType);
      if (typeof info.size === "number")
        response.setHeader("Content-Length", String(info.size));
      const stream = await options.store.getObject(STAGING_BUCKET, key);
      stream.on("error", () => {
        if (!response.headersSent) response.status(404).end();
      });
      stream.pipe(response);
    } catch {
      return response.status(404).json({ error: "Media not found" });
    }
  });

  return app;
}

export async function createMinioStoreFromEnv(): Promise<MediaObjectStore> {
  const client = new Client({
    endPoint: process.env.MINIO_ENDPOINT || "media-minio",
    port: Number(process.env.MINIO_PORT || 9000),
    useSSL: process.env.MINIO_USE_SSL === "true",
    accessKey: process.env.MINIO_ACCESS_KEY || "minioadmin",
    secretKey: process.env.MINIO_SECRET_KEY || "minioadmin",
  });

  return {
    putObject: async (bucket, key, body, size, metaData) => {
      await client.putObject(bucket, key, body, size, metaData);
    },
    getObject: (bucket, key) => client.getObject(bucket, key),
    statObject: (bucket, key) => client.statObject(bucket, key),
    removeObject: (bucket, key) => client.removeObject(bucket, key),
    listObjects: (bucket, prefix) =>
      new Promise<StagingObject[]>((resolve, reject) => {
        const items: StagingObject[] = [];
        const stream = client.listObjects(bucket, prefix, true);
        stream.on("data", (item) => {
          if (!item.name || item.size === undefined || !item.lastModified) return;
          items.push({ key: item.name, size: item.size, lastModified: item.lastModified, metaData: {} });
        });
        stream.on("error", reject);
        stream.on("end", () => resolve(items));
      }).then((items) =>
        Promise.all(
          items.map(async (item) => ({
            ...item,
            metaData: (await client.statObject(bucket, item.key))
              .metaData as Record<string, string>,
          })),
        ),
      ),
    ensureStagingBucket: async (bucket, days) => {
      if (!(await client.bucketExists(bucket)))
        await client.makeBucket(bucket, "us-east-1");
      await client.setBucketLifecycle(bucket, {
        Rule: [
          {
            ID: "staging-seven-days",
            Status: "Enabled",
            Expiration: { Days: days },
          },
        ],
      });
    },
  };
}

async function start() {
  const store = await createMinioStoreFromEnv();
  await withRetries(() =>
    store.ensureStagingBucket(STAGING_BUCKET, STAGING_DAYS),
  );
  const app = createMediaApp({
    store,
    token: process.env.MEDIA_STAGING_TOKEN,
    publicBaseUrl: process.env.MEDIA_PUBLIC_BASE_URL,
  });
  const port = Number(process.env.PORT || 3001);
  app.listen(port, "0.0.0.0", () =>
    console.log(`media service listening on ${port}`),
  );
}

function authorized(request: Request, token?: string) {
  if (!token) return true;
  return request.headers.authorization === `Bearer ${token}`;
}

function safeStagingKey(value: string | string[]) {
  const key = decodeURIComponent(
    Array.isArray(value) ? value.join("/") : value,
  );
  return key.startsWith("staging/") &&
    !key.includes("..") &&
    !key.includes("\\")
    ? key
    : "";
}

function extensionFor(contentType: string, filename: string) {
  const fromName = filename.match(/\.[a-z0-9]{1,8}$/i)?.[0].toLowerCase();
  if (fromName) return fromName;
  if (contentType === "image/jpeg") return ".jpg";
  if (contentType === "image/webp") return ".webp";
  if (contentType === "video/webm") return ".webm";
  return contentType.startsWith("video/") ? ".mp4" : ".png";
}

function decodeFilename(value: string) {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
}

function publicUrl(base: string | undefined, key: string) {
  return `${(base || "").replace(/\/+$/, "")}/media/${key}` || `/media/${key}`;
}

async function withRetries(task: () => Promise<void>) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      await task();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw lastError;
}

if (process.argv[1] && process.argv[1].endsWith("server.js")) void start();
