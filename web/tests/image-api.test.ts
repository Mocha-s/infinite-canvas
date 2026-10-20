import { expect, test } from "bun:test";

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

const { buildJsonImageReferences, hasReusablePublicReferenceUrl } = await import("../src/services/api/image");

test("serializes JSON image edit references as image_url objects", () => {
    expect(buildJsonImageReferences(["https://media.example/one.png", "https://media.example/two.png"])).toEqual([
        { image_url: "https://media.example/one.png" },
        { image_url: "https://media.example/two.png" },
    ]);
});

test("refreshes a stale public URL when a local image copy exists", () => {
    expect(hasReusablePublicReferenceUrl({ dataUrl: "", url: "https://media.example/image.png", storageKey: "image:local" })).toBe(false);
    expect(hasReusablePublicReferenceUrl({ dataUrl: "", url: "https://media.example/image.png" })).toBe(true);
});
