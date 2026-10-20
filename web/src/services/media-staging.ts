import { MEDIA_STAGING_TOKEN } from "@/constant/runtime-config";

export type StagedMedia = {
    url: string;
    storageKey: string;
    expiresAt: string;
    originalName?: string;
    mimeType?: string;
    bytes?: number;
    createdAt?: string;
};

export async function uploadStagingMedia(blob: Blob, filename: string): Promise<StagedMedia> {
    const response = await fetch("/media-api/staging/upload", {
        method: "POST",
        headers: {
            "Content-Type": blob.type || "application/octet-stream",
            "Content-Length": String(blob.size),
            "X-Media-Filename": encodeURIComponent(filename),
            ...(MEDIA_STAGING_TOKEN ? { Authorization: `Bearer ${MEDIA_STAGING_TOKEN}` } : {}),
        },
        body: blob,
    });
    if (!response.ok) throw new Error(`暂存服务请求失败（HTTP ${response.status}）`);
    const result = (await response.json()) as Partial<StagedMedia>;
    if (!result.url || !result.storageKey || !result.expiresAt) throw new Error("暂存服务返回数据无效");
    return { url: result.url, storageKey: result.storageKey, expiresAt: result.expiresAt };
}

export async function listStagingMedia(): Promise<StagedMedia[]> {
    const response = await fetch("/media-api/staging/list", {
        headers: MEDIA_STAGING_TOKEN ? { Authorization: `Bearer ${MEDIA_STAGING_TOKEN}` } : {},
        cache: "no-store",
    });
    if (!response.ok) throw new Error(`暂存素材读取失败（HTTP ${response.status}）`);
    const payload = (await response.json()) as { items?: StagedMedia[] };
    return Array.isArray(payload.items) ? payload.items : [];
}

export async function deleteStagingMedia(media: StagedMedia) {
    const keyPath = media.storageKey.split("/").map(encodeURIComponent).join("/");
    const response = await fetch(`/media-api/staging/${keyPath}`, {
        method: "DELETE",
        headers: MEDIA_STAGING_TOKEN ? { Authorization: `Bearer ${MEDIA_STAGING_TOKEN}` } : {},
    });
    if (!response.ok) throw new Error(`删除暂存素材失败（HTTP ${response.status}）`);
}
