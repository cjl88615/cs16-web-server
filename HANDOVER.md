# 项目交接入口

版本：2026.11.07-r2；原始基线：4dfe0f9e14e2fa7dd15f1278bb59055b4739e5b8。

目标是中文网页大厅 + 局域网独立游戏服务器 + YaPB 自动补位，不是重写 CS 引擎，也不是 AI API 驱动的机器人。

## 接手先看

1. `VERSION`、Git HEAD、`docs/VERIFICATION.md`，不要把开发分支或构建成功误报成生产上线。
2. `README.md`、`docs/DEPLOYMENT.md`、`.env.example`。
3. `THIRD_PARTY.md` 与固定源码版本，尤其原依赖已删除/下架的问题。

## 不能随意改的契约

- 浏览器 `connect 127.0.0.1:8080` 是虚拟引擎网络地址，不是配置错误。
- WebRTC 的 `read` 通道是客户端向服务器发送，`write` 通道是服务器向客户端发送；JSON 信令 `data` 是对象，不是再编码一层的 JSON 字符串。
- 服务端虚拟玩家 IP 为保留网段地址，最后一字节是槽位，完整 IP 是会话标识。不能退回仅凭槽位发送旧数据。
- 不能把固定 Xash3D 引擎直接换成保存分支的最新 HEAD，Go/C 回调 ABI 已变化。
- `BOT_QUOTA` 是总人口目标，不是固定机器人数量；必须留真人加入位置。
- 首屏不下载 WASM 与游戏 ZIP；缓存按资源包版本失效；解压最多 4 个文件并发。
- 中文 HTML 菜单不等于原生 HUD/字体完整汉化；原生文本不能伪报已翻译。
- `/readyz` 是引擎回调活跃检查，不是 BOT/多人玩法测试。

## 文件分工

`src/client/src/main.ts` 管理大厅状态与快捷菜单；`webrtc.ts` 管理联机生命周期；`gamefiles.ts` 管理版本缓存/下载；`player.ts` 和 `paths.ts` 处理输入边界。

`src/server/config.go` 校验环境并生成 BOT/比赛配置；`sfu.go` 保留 Pion 媒体与数据桥接；`wire_connection.go` 防止复用槽位误发旧数据；`http_policy.go` 处理来源和静态文件边界。

维护记录统一更新本文件、README、验收记录，不另起一堆散乱交接文件。改动后运行客户端测试、前端构建、Go 纯逻辑测试、Docker 构建与真实对局测试，并分别记录结果。

## r2 低配 VM 约束与接手说明

用户要求 **2 核 2GB**，不可未经实测擅自建议 4 核 8GB。请以 `.env.example` 的 MAX_PLAYERS=8 / BOT_QUOTA=5、Docker 1536 MiB 内存上限为低配验收基线。Go 堆预算不代表容器 RSS。

网络读缓冲复用要确保排队数据持有**独立 payload 切片**，绝不能把下次 Read 会覆盖的原始 8 KiB 缓冲丢进 channel。原生 recvfrom 空闲轮询使用共享 ticker，保持固定最多 10ms 等待和优先读到现成包。禁止为了跑分而禁用 WebRTC Origin 检查或降低引擎游戏模拟到明显影响射击手感。

首次构建可在 2GB VM 上使用 `sh scripts/build-2gb.sh` 顺序编译，构建内存和正式运行内存严格分开验收。后续如需继续优化，先做真实 CPU/内存/机器人性能观测，不依据 Go 基准推断整场游戏性能。
