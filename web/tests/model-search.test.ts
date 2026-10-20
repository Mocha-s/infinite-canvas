import { afterAll, expect, test } from "bun:test";

const values = new Map<string, string>();
const previousStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) },
});
afterAll(() => {
    if (previousStorage) Object.defineProperty(globalThis, "localStorage", previousStorage);
    else Reflect.deleteProperty(globalThis, "localStorage");
});

const { filterModelsByName } = await import("../src/lib/model-search");

test("filters model names case-insensitively and ignores provider prefixes", () => {
    expect(filterModelsByName(["default::Seedance-2.0", "studio::gpt-image-2.5"], " SEEDANCE ")).toEqual(["default::Seedance-2.0"]);
    expect(filterModelsByName(["studio::gpt-image-2.5"], "studio")).toEqual([]);
});

test("returns all models for an empty or whitespace query", () => {
    const models = ["a::gpt-image", "b::seedance"];
    expect(filterModelsByName(models, "")).toBe(models);
    expect(filterModelsByName(models, "   ")).toBe(models);
});
