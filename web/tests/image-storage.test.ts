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

const { preferLocalImageUrl } = await import("../src/services/image-storage");

test("prefers the local image URL over a remote reference URL", () => {
    expect(preferLocalImageUrl({ dataUrl: "https://media.example/reference.png", url: "https://media.example/public.png" }, "blob:http://localhost/local-image")).toBe("blob:http://localhost/local-image");
});

test("falls back to the image data URL when no local image is available", () => {
    expect(preferLocalImageUrl({ dataUrl: "data:image/png;base64,local" }, "")).toBe("data:image/png;base64,local");
});
