import { afterAll, expect, test } from "bun:test";

const localStorage = new Map<string, string>();
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
if (!originalStorage) {
    Object.defineProperty(globalThis, "localStorage", {
        configurable: true,
        value: {
            getItem: (key: string) => localStorage.get(key) || null,
            setItem: (key: string, value: string) => localStorage.set(key, value),
            removeItem: (key: string) => localStorage.delete(key),
        },
    });
}
afterAll(() => {
    if (!originalStorage) Reflect.deleteProperty(globalThis, "localStorage");
});

const { useConfigStore } = await import("../src/stores/use-config-store");
const { uploadPublicMedia } = await import("../src/services/media-upload");

test("routes presign and upload requests through the local proxy", async () => {
    const previousConfig = useConfigStore.getState().config;
    const requests: string[] = [];
    const previousFetch = globalThis.fetch;
    useConfigStore.setState({ config: { ...previousConfig, proxyEnabled: true, proxyUrl: "http://127.0.0.1:23210" } });
    globalThis.fetch = (async (input) => {
        requests.push(String(input));
        if (requests.length === 1) return new Response(JSON.stringify({ uploadUrl: "https://media.example/upload", url: "https://media.example/image.png" }), { headers: { "Content-Type": "application/json" } });
        return new Response(null, { status: 200 });
    }) as typeof fetch;

    try {
        await uploadPublicMedia(new Blob(["image"], { type: "image/png" }), { mediaUploadUrl: "https://media.example/presign", mediaUploadToken: "" });
    } finally {
        globalThis.fetch = previousFetch;
        useConfigStore.setState({ config: previousConfig });
    }

    expect(requests).toEqual(["http://127.0.0.1:23210/https://media.example/presign", "http://127.0.0.1:23210/https://media.example/upload"]);
});
