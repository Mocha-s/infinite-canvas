import { expect, test } from "bun:test";

Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
        getItem: () => null,
        setItem: () => undefined,
        removeItem: () => undefined,
    },
});

const { defaultConfig } = await import("../src/stores/use-config-store");
const { createVideoGenerationTask } = await import("../src/services/api/video");

function openAiVideoConfig() {
    const model = "channel::seedance2.0-900-3";
    return {
        ...defaultConfig,
        model,
        videoModel: model,
        apiKey: "test-key",
        channels: [
            {
                id: "channel",
                name: "Channel",
                baseUrl: "https://api.example.com",
                apiKey: "test-key",
                apiFormat: "openai" as const,
                models: [{ name: "seedance2.0-900-3", capability: "video" as const }],
            },
        ],
    };
}

test("passes public video reference URLs to a model plugin without downloading them", async () => {
    const model = "channel::seedance2.0-900-3";
    const config = {
        ...defaultConfig,
        model,
        videoModel: model,
        apiKey: "test-key",
        channels: [
            {
                id: "channel",
                name: "Channel",
                baseUrl: "https://api.example.com",
                apiKey: "test-key",
                apiFormat: "openai" as const,
                models: [{ name: "seedance2.0-900-3", capability: "video" as const, script: "return imageUrls[0];" }],
            },
        ],
    };

    const task = await createVideoGenerationTask(config, "make a video", [{ id: "image-1", name: "reference.png", type: "image/png", dataUrl: "https://tmp.example/reference.png" }]);

    expect(task.provider).toBe("plugin");
});

test("explains when an OpenAI video reference cannot be downloaded", async () => {
    const previousWindow = globalThis.window;
    const previousFetch = globalThis.fetch;
    Object.defineProperty(globalThis, "window", { configurable: true, value: { setTimeout, clearTimeout } });
    globalThis.fetch = (async () => {
        throw new TypeError("Failed to fetch");
    }) as typeof fetch;

    try {
        await expect(createVideoGenerationTask(openAiVideoConfig(), "make a video", [{ id: "image-1", name: "reference.png", type: "image/png", dataUrl: "https://tmp.example/reference.png" }])).rejects.toThrow("参考图读取失败");
    } finally {
        globalThis.fetch = previousFetch;
        if (previousWindow) Object.defineProperty(globalThis, "window", { configurable: true, value: previousWindow });
        else Reflect.deleteProperty(globalThis, "window");
    }
});
