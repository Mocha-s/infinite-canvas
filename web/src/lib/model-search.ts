import { modelOptionName } from "@/stores/use-config-store";

export function filterModelsByName(models: string[], query: string): string[];
export function filterModelsByName(models: string[], query: string) {
    const needle = query.trim().toLocaleLowerCase();
    return needle ? models.filter((model) => modelOptionName(model).toLocaleLowerCase().includes(needle)) : models;
}
