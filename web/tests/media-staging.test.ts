import { afterEach, expect, test } from "bun:test";

const { listStagingMedia, uploadStagingMedia } = await import("../src/services/media-staging");

const previousFetch = globalThis.fetch;

afterEach(() => {
    globalThis.fetch = previousFetch;
});

test("uploads media to the same-origin staging service", async () => {
    let request: Request | undefined;
    globalThis.fetch = (async (input, init) => {
        request = new Request(new URL(String(input), "http://localhost"), init);
        return new Response(JSON.stringify({ url: "/media/staging/one.png", storageKey: "staging/one.png", expiresAt: "2026-10-27T00:00:00.000Z" }), { status: 201 });
    }) as typeof fetch;

    const result = await uploadStagingMedia(new Blob(["image"], { type: "image/png" }), "reference.png");

    expect(request?.url).toBe("http://localhost/media-api/staging/upload");
    expect(request?.headers.get("Content-Type")).toBe("image/png");
    expect(request?.headers.get("X-Media-Filename")).toBe("reference.png");
    expect(result.storageKey).toBe("staging/one.png");
});

test("rejects an invalid staging response", async () => {
    globalThis.fetch = (async () => new Response(JSON.stringify({}), { status: 201 })) as typeof fetch;
    await expect(uploadStagingMedia(new Blob(["image"], { type: "image/png" }), "reference.png")).rejects.toThrow("暂存服务返回数据无效");
});

test("reads the temporary media library", async () => {
    globalThis.fetch = (async (input) => {
        expect(String(input)).toBe("/media-api/staging/list");
        return new Response(JSON.stringify({ items: [{ storageKey: "staging/one.png", url: "/media/staging/one.png", expiresAt: "2026-10-27T00:00:00.000Z", mimeType: "image/png" }] }), { status: 200 });
    }) as typeof fetch;
    await expect(listStagingMedia()).resolves.toHaveLength(1);
});
