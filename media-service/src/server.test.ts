import { afterEach, expect, test } from "bun:test";
import { Readable } from "node:stream";
import { createServer, type Server } from "node:http";
import { createMediaApp, type MediaObjectStore } from "./server.js";

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map(
        (server) =>
          new Promise<void>((resolve) => server.close(() => resolve())),
      ),
  );
});

function memoryStore(): MediaObjectStore {
  const objects = new Map<string, { body: Buffer; metaData: Record<string, string>; lastModified: Date }>();
  return {
    putObject: async (_bucket, key, body, _size, metaData) =>
      void objects.set(key, { body, metaData, lastModified: new Date("2026-10-20T00:00:00.000Z") }),
    getObject: async (_bucket, key) => {
      const object = objects.get(key);
      if (!object) throw new Error("missing");
      return Readable.from(object.body);
    },
    statObject: async (_bucket, key) => {
      const object = objects.get(key);
      if (!object) throw new Error("missing");
      return { size: object.body.length, metaData: object.metaData };
    },
    removeObject: async (_bucket, key) => void objects.delete(key),
    listObjects: async (_bucket, prefix) => Array.from(objects.entries()).filter(([key]) => key.startsWith(prefix)).map(([key, value]) => ({ key, size: value.body.length, lastModified: value.lastModified, metaData: value.metaData })),
    ensureStagingBucket: async () => undefined,
  };
}

async function appUrl(token = "secret") {
  const server = createServer(
    createMediaApp({
      store: memoryStore(),
      token,
      now: () => Date.parse("2026-10-20T00:00:00.000Z"),
    }),
  );
  servers.push(server);
  await new Promise<void>((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve()),
  );
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("server did not start");
  return `http://127.0.0.1:${address.port}`;
}

test("requires the staging token for uploads", async () => {
  const base = await appUrl();
  const response = await fetch(`${base}/api/staging/upload`, {
    method: "POST",
    body: "image",
    headers: { "Content-Type": "image/png" },
  });
  expect(response.status).toBe(401);
});

test("stores an image and serves it through the media route", async () => {
  const base = await appUrl();
  const upload = await fetch(`${base}/api/staging/upload`, {
    method: "POST",
    body: "image",
    headers: {
      Authorization: "Bearer secret",
      "Content-Type": "image/png",
      "X-Media-Filename": "reference.png",
    },
  });
  expect(upload.status).toBe(201);
  const result = (await upload.json()) as {
    url: string;
    storageKey: string;
    expiresAt: string;
  };
  expect(result.storageKey).toMatch(/^staging\//);
  expect(result.url).toBe(`/media/${result.storageKey}`);
  expect(result.expiresAt).toBe("2026-10-27T00:00:00.000Z");

  const media = await fetch(`${base}${result.url}`);
  expect(media.status).toBe(200);
  expect(await media.text()).toBe("image");
});

test("accepts encoded non-ASCII filenames", async () => {
    const base = await appUrl();
    const upload = await fetch(`${base}/api/staging/upload`, {
        method: "POST",
        body: "image",
        headers: { Authorization: "Bearer secret", "Content-Type": "image/png", "X-Media-Filename": encodeURIComponent("贵州山路.png") },
    });
    expect(upload.status).toBe(201);
    const result = await upload.json();
    expect(result.storageKey).toMatch(/^staging\/.*\.png$/);
    const listing = await fetch(`${base}/api/staging/list`, { headers: { Authorization: "Bearer secret" } });
    const payload = await listing.json();
    expect(payload.items[0].originalName).toBe("贵州山路.png");
});

test("rejects unsupported media types", async () => {
  const base = await appUrl();
  const response = await fetch(`${base}/api/staging/upload`, {
    method: "POST",
    body: "text",
    headers: { Authorization: "Bearer secret", "Content-Type": "text/plain" },
  });
  expect(response.status).toBe(415);
});

test("requires the staging token for the media list", async () => {
    const base = await appUrl();
    const response = await fetch(`${base}/api/staging/list`);
    expect(response.status).toBe(401);
});
