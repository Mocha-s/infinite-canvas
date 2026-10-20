import { expect, test } from "bun:test";

Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
        getItem: () => null,
        setItem: () => undefined,
        removeItem: () => undefined,
    },
});

const { hydrateNodeGenerationContext } = await import("../src/components/canvas/canvas-node-generation");
const { generationReferenceUrls } = await import("../src/lib/canvas/canvas-generation-helpers");

test("keeps a public reference URL when hydrating generation context", async () => {
    const context = {
        prompt: "edit this image",
        referenceImages: [{ id: "image-1", name: "image.png", type: "image/png", dataUrl: "https://media.example/image.png" }],
        referenceVideos: [],
        referenceAudios: [],
        textCount: 0,
        imageCount: 1,
        videoCount: 0,
        audioCount: 0,
    };

    await expect(hydrateNodeGenerationContext(context)).resolves.toEqual(context);
});

test("keeps local reference data when a public URL is also present", async () => {
    const context = {
        prompt: "make a video",
        referenceImages: [{ id: "image-1", name: "image.png", type: "image/png", dataUrl: "blob:http://localhost/local-image", url: "https://media.example/image.png" }],
        referenceVideos: [],
        referenceAudios: [],
        textCount: 0,
        imageCount: 1,
        videoCount: 0,
        audioCount: 0,
    };

    await expect(hydrateNodeGenerationContext(context)).resolves.toEqual(context);
});

test("stores a local image key for later video retry when available", () => {
    expect(
        generationReferenceUrls({
            referenceImages: [{ id: "image-1", name: "image.png", type: "image/png", dataUrl: "blob:http://localhost/local-image", url: "https://media.example/image.png", storageKey: "image:local" }],
            referenceVideos: [],
            referenceAudios: [],
        }),
    ).toEqual(["image:local"]);
});
