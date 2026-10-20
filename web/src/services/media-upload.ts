import i18n from "@/i18n";
import { withLocalProxy, type AiConfig } from "@/stores/use-config-store";

type MediaUploadConfig = Pick<AiConfig, "mediaUploadUrl" | "mediaUploadToken">;

export type PublicMedia = { url: string; storageKey: string };
type PresignResponse = { uploadUrl?: string; url?: string; storageKey?: string };

export async function uploadPublicMedia(blob: Blob, config: MediaUploadConfig): Promise<PublicMedia> {
    const endpoint = config.mediaUploadUrl.trim();
    if (!endpoint) throw new Error(i18n.t("mediaUpload.endpointRequired"));
    if (new URL(endpoint).protocol !== "https:") throw new Error(i18n.t("mediaUpload.httpsRequired"));
    const contentType = blob.type || "application/octet-stream";
    const kind = contentType.startsWith("video/") ? "video" : contentType.startsWith("image/") ? "image" : "";
    if (!kind) throw new Error(i18n.t("mediaUpload.unsupportedType"));
    if (kind === "image" && blob.size > 30 * 1024 * 1024) throw new Error(i18n.t("mediaUpload.imageTooLarge"));
    if (kind === "video" && blob.size > 90 * 1024 * 1024) throw new Error(i18n.t("mediaUpload.videoTooLarge"));

    const response = await fetch(withLocalProxy(endpoint), {
        method: "POST",
        headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            ...(config.mediaUploadToken.trim() ? { Authorization: `Bearer ${config.mediaUploadToken.trim()}` } : {}),
        },
        body: JSON.stringify({ kind, contentType, size: blob.size }),
    });
    if (!response.ok) throw new Error(i18n.t("mediaUpload.presignFailed", { status: response.status }));

    const presign = (await response.json()) as PresignResponse;
    if (!presign.uploadUrl || !presign.url) throw new Error(i18n.t("mediaUpload.invalidResponse"));
    if (new URL(presign.uploadUrl).protocol !== "https:" || new URL(presign.url).protocol !== "https:") throw new Error(i18n.t("mediaUpload.httpsRequired"));
    const upload = await fetch(withLocalProxy(presign.uploadUrl), { method: "PUT", headers: { "Content-Type": contentType }, body: blob });
    if (!upload.ok) throw new Error(i18n.t("mediaUpload.uploadFailed", { status: upload.status }));
    return { url: presign.url, storageKey: presign.storageKey || "" };
}

export function isPublicMediaUrl(value: string) {
    return /^https?:\/\//i.test(value.trim());
}
