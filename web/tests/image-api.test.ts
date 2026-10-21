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

const { imageEditReferenceField, shouldIncludeImageEditOutputFormat } = await import("../src/services/api/image");

test("uses the multipart image[] field for multiple edit references", () => {
    expect(imageEditReferenceField(1)).toBe("image");
    expect(imageEditReferenceField(3)).toBe("image[]");
});

test("omits output_format for GPT Image edit requests", () => {
    expect(shouldIncludeImageEditOutputFormat("gpt-image-2.5")).toBe(false);
    expect(shouldIncludeImageEditOutputFormat("gpt-image-2.5-sunburst-4k")).toBe(false);
    expect(shouldIncludeImageEditOutputFormat("dall-e-2")).toBe(true);
});
