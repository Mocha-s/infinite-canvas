import { useEffect, useMemo, useState } from "react";
import { App, Button, Empty, Input, Pagination, Popconfirm, Tag, Tooltip } from "antd";
import { Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { deleteStagingMedia, listStagingMedia, type StagedMedia } from "@/services/media-staging";
import { cn } from "@/lib/utils";

type Props = { onSelect?: (media: StagedMedia) => void; compact?: boolean };
const PAGE_SIZE = 8;

export function StagingMediaBrowser({ onSelect, compact = false }: Props) {
    const { message } = App.useApp();
    const { t } = useTranslation();
    const [items, setItems] = useState<StagedMedia[]>([]);
    const [keyword, setKeyword] = useState("");
    const [kind, setKind] = useState<"all" | "image" | "video">("all");
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const remove = async (media: StagedMedia) => {
        try {
            await deleteStagingMedia(media);
            setItems((current) => current.filter((item) => item.storageKey !== media.storageKey));
            message.success(t("mediaUpload.stagingDeleted"));
        } catch (reason) {
            message.error(reason instanceof Error ? reason.message : t("mediaUpload.stagingDeleteFailed"));
        }
    };

    const refresh = async () => {
        setLoading(true);
        setError("");
        try {
            setItems(await listStagingMedia());
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : t("mediaUpload.stagingListFailed"));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void refresh();
    }, []);

    const filtered = useMemo(() => {
        const query = keyword.trim().toLowerCase();
        return items.filter((item) => {
            const itemKind = item.mimeType?.startsWith("video/") ? "video" : "image";
            return (kind === "all" || itemKind === kind) && (!query || `${item.originalName || ""} ${item.storageKey}`.toLowerCase().includes(query));
        });
    }, [items, keyword, kind]);
    const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
                <Input
                    className="w-56"
                    size="small"
                    prefix={<Search className="size-3.5 text-stone-400" />}
                    placeholder={t("canvas.assetPicker.search")}
                    value={keyword}
                    allowClear
                    onChange={(event) => {
                        setPage(1);
                        setKeyword(event.target.value);
                    }}
                />
                <div className="flex gap-1.5">
                    {(["all", "image", "video"] as const).map((option) => (
                        <Tag.CheckableTag key={option} checked={kind === option} className={cn("prompt-filter-tag", kind === option && "is-active")} onChange={() => { setPage(1); setKind(option); }}>
                            {option === "all" ? t("common.all") : t(`assets.kinds.${option}`)}
                        </Tag.CheckableTag>
                    ))}
                </div>
                <Button size="small" icon={<RefreshCw className="size-3.5" />} loading={loading} onClick={() => void refresh()}>
                    {t("mediaUpload.stagingRefresh")}
                </Button>
            </div>

            {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">{error}</div> : null}
            {visible.length ? (
                <div className={cn("grid gap-2", compact ? "grid-cols-2" : "grid-cols-4")}>
                    {visible.map((item) => {
                        const isVideo = item.mimeType?.startsWith("video/");
                        return (
                            <Tooltip
                                key={item.storageKey}
                                placement="right"
                                mouseEnterDelay={0.3}
                                overlayInnerStyle={{ padding: 4, maxWidth: "none" }}
                                title={
                                    <div className="grid h-56 w-72 place-items-center overflow-hidden rounded-md bg-black">
                                        {isVideo ? <video src={item.url} autoPlay loop muted playsInline preload="metadata" className="max-h-56 max-w-72 object-contain" /> : <img src={item.url} alt={item.originalName || item.storageKey} className="max-h-56 max-w-72 object-contain" />}
                                    </div>
                                }
                            >
                                <div key={item.storageKey} className="group relative min-w-0 overflow-hidden rounded-md border border-stone-200 bg-white text-left transition-[border-color,box-shadow] hover:border-stone-400 hover:shadow-sm dark:border-stone-700 dark:bg-stone-900">
                                    <button type="button" className="block w-full text-left" onClick={() => (onSelect ? onSelect(item) : window.open(item.url, "_blank", "noopener,noreferrer"))}>
                                    {isVideo ? <video src={item.url} muted preload="metadata" className="aspect-[4/3] w-full object-cover" /> : <img src={item.url} alt={item.originalName || item.storageKey} className="aspect-[4/3] w-full object-cover" />}
                                    <div className={cn("min-w-0", compact ? "px-1.5 py-1" : "p-2.5")}>
                                        <div className="truncate text-xs font-medium">{item.originalName || item.storageKey}</div>
                                        <div className="mt-1 flex min-w-0 items-center justify-between gap-1 text-[10px] text-stone-500">
                                            <span className="truncate">{t("mediaUpload.stagingSource")}</span>
                                            {compact ? null : <span className="shrink-0 tabular-nums">{item.expiresAt ? new Date(item.expiresAt).toLocaleDateString() : ""}</span>}
                                        </div>
                                    </div>
                                    {onSelect ? <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-stone-950/0 text-sm font-medium text-white opacity-0 transition-[background-color,opacity] group-hover:bg-stone-950/55 group-hover:opacity-100">{t("canvas.assetPicker.insert")}</div> : null}
                                    </button>
                                    <div className="pointer-events-none absolute inset-x-1.5 bottom-1.5 flex translate-y-1 items-center justify-between gap-1 opacity-0 transition-[opacity,transform] group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100">
                                        {onSelect ? <button type="button" className="grid size-8 place-items-center rounded-md bg-white/90 text-stone-700 shadow-sm backdrop-blur transition hover:bg-white dark:bg-black/70 dark:text-stone-100 dark:hover:bg-black/90" aria-label={t("canvas.assetPicker.insert")} title={t("canvas.assetPicker.insert")} onClick={() => onSelect(item)}><Plus className="size-4" /></button> : <span />}
                                        <Popconfirm title={t("mediaUpload.stagingDeleteTitle")} okText={t("common.delete")} cancelText={t("common.cancel")} okButtonProps={{ danger: true }} onConfirm={() => void remove(item)}>
                                            <button type="button" className="grid size-8 place-items-center rounded-md bg-white/90 text-stone-700 shadow-sm backdrop-blur transition hover:bg-white hover:text-red-500 dark:bg-black/70 dark:text-stone-100 dark:hover:bg-black/90" aria-label={t("mediaUpload.stagingDelete")} title={t("mediaUpload.stagingDelete")}><Trash2 className="size-4" /></button>
                                        </Popconfirm>
                                    </div>
                                </div>
                            </Tooltip>
                        );
                    })}
                </div>
            ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={error ? t("mediaUpload.stagingListFailed") : t("mediaUpload.stagingEmpty")} className="py-12" />
            )}
            {filtered.length > PAGE_SIZE ? <div className="flex justify-center"><Pagination size="small" current={page} pageSize={PAGE_SIZE} total={filtered.length} onChange={setPage} showSizeChanger={false} /></div> : null}
        </div>
    );
}
