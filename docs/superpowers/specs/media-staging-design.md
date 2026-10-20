# 内网媒体暂存设计

## 目标

在当前 Compose 部署中增加一个只负责内网临时媒体备份的服务和 MinIO。生成媒体仍先写入浏览器 IndexedDB；开启自动暂存后再复制到内网 MinIO。公网 AI 所需的长期 URL 继续通过前端已有的公网媒体上传配置生成，绝不把内网 URL 传给公网模型。

## 边界

- 暂存服务只提供上传、下载和健康检查，不承担公网媒体存储。
- 暂存 bucket 的生命周期固定为 7 天，由 MinIO 自动清理。
- MinIO 凭据只存在媒体服务环境变量中，浏览器不能接触。
- 暂存 URL 仅写入节点元数据作为局域网备份地址；请求公网模型时只使用本地 `storageKey` 或前端现有公网上传结果。
- 公网 MinIO 的 URL、Token 和上传逻辑保持现有行为。
- 当前 Nginx 通过同源 `/media-api` 代理 API，通过 `/media` 代理暂存文件。

## 用户行为

- 配置的「媒体上传」页增加「自动上传生成媒体到内网暂存」开关，默认关闭。
- 节点媒体工具菜单增加「上传到内网暂存」操作。
- 已上传暂存的媒体显示成功提示并保存 `stagingUrl` 与 `stagingExpiresAt`。
- 暂存服务不可用时不影响浏览器本地媒体，也不覆盖已有 `publicUrl`；自动上传失败显示警告。

## 服务接口

- `GET /health` 返回 `{ "ok": true }`。
- `POST /api/staging/upload` 接收原始媒体 body；使用 `Content-Type`、`Content-Length` 和 `X-Media-Filename`，校验图片 30 MB、视频 90 MB的限制，写入随机对象 key，返回 `{ url, storageKey, expiresAt }`。
- `DELETE /api/staging/:key` 只允许删除 `staging/` 前缀对象。
- `GET /media/:key` 从暂存 bucket 读取对象并透传内容类型；对象不存在返回 404。

## 安全与部署

- 服务使用 `MEDIA_STAGING_TOKEN` 校验上传和删除请求；下载 URL 不需要 Token，便于局域网浏览器和上游临时调试使用。
- 对象名由服务端生成，不能使用用户提供的路径。
- Compose 增加 `minio`、`media-service`，MinIO 数据使用命名卷；媒体服务等待 MinIO 健康后启动。
- 媒体服务启动时创建 staging bucket 并设置 7 天生命周期规则。
