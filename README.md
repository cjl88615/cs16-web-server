# 塔岛 CS 1.6 · 局域网网页版

基于 [balintsoos/cs16-web-server](https://github.com/balintsoos/cs16-web-server) 的中文与 YaPB 升级分支。版本：**2026.11.07-r2**。

目标：同事打开同一个局域网网址加入对战；人数不足时由 BOT 补位。浏览器客户端仍使用 Xash3D WebAssembly，服务器为独立运行的 Xash3D + Go/Pion WebRTC 桥接，不依赖房主电脑持续开着。

> 本分支的源码检查、前端构建与截图检查不等于完整游戏验收。真实联机/BOT/容器构建状态以 [验收记录](docs/VERIFICATION.md) 为准。

## 本次改动

- 中文大厅、加载进度、故障提示、操作说明；电脑/窄屏响应式排版。
- 游戏中按 **F2** 打开中文快捷菜单：选队、常用武器/装备购买、全屏。保留原游戏的队伍、金钱、购买区与购买时间规则。
- YaPB **4.4.957**，低配默认以真人 + BOT 合计 **5 人**为补位目标，普通难度，房间上限 8 人，保留额外真人席位。
- 默认地图 `de_dust2`，轮换 `de_inferno`、`cs_office`；BOT 导航随构建提供，运行时关闭自动下载/上传导航。
- 点击“加载游戏”后才加载引擎和资源；按资源包版本使用本机缓存，缓存不可用时仍可继续，解压并发限制为 4。
- 中文昵称按 UTF-8 字节限长；过滤命令分隔符；增加联机超时、重试和断开清理。
- 修复跨来源 WebSocket、信令竞争、连接槽位复用、随机虚拟 IP 与 `sv_lan` 不兼容、启动回调竞争等问题。
- 恢复已失效的构建依赖；固定与原 ABI 匹配的引擎源码，保留 npm 完整性校验；提供健康检查与自动化源码检查。

**中文范围：网页大厅和 HTML 快捷菜单。原生游戏 HUD、聊天字体、内置菜单仍可能显示英文，不能视为完整汉化客户端。** 手机页面可正常排版，不代表已完成触控实战适配。

## 部署

专为 **2 vCPU / 2 GB RAM** 的精简 Debian 13 x86_64 虚拟机调整默认配置，建议预留约 40 GB 磁盘（包括本地编译缓存）。游戏画面在同事电脑的浏览器渲染，VM 负责 BOT、游戏计算及联机数据；**实际流畅度尚需在 2 核 2GB 的虚拟机上验收**。详见 [虚拟机与网络](docs/DEPLOYMENT.md)。

已安装 Docker Engine 与 Compose 插件后：

```bash
git clone --branch upgrade/20261107-cn-bots https://github.com/cjl88615/cs16-web-server.git
cd cs16-web-server
cp .env.example .env
# 编辑 .env：LAN_IP 必须换成这台虚拟机的真实局域网 IPv4。
docker compose config --quiet
sh scripts/build-2gb.sh
# 等镜像构建成功后再启动
docker compose up -d --no-build
docker compose logs --tail=100
```

玩家使用 `http://虚拟机IP:27016/`。同一台电脑首次点击“加载游戏”会下载资源；准备完成后再点击“进入对战”，让浏览器在用户操作下启动音频与游戏。**不要把客户端代码里的 `connect 127.0.0.1:8080` 改为 VM IP：它是引擎桥接的虚拟地址。**

## BOT 与比赛设置

在 `.env` 中配置，改后运行 `docker compose up -d --force-recreate`：

| 设置 | 默认值 | 说明 |
| --- | --- | --- |
| `LAN_IP` | 示例地址 | 必须改成 VM 真实 IP，不能用 127.0.0.1 |
| `MAX_PLAYERS` | 8 | 房间总席位，2–32 |
| `BOT_QUOTA` | 5 | 真人 + BOT 的目标人数，0 到 MAX_PLAYERS−1；0 关闭补位 |
| `BOT_DIFFICULTY` | 2 | 0 新手 / 1 休闲 / 2 普通 / 3 困难 / 4 大师 |
| `START_MAP` | de_dust2 | 服务器与客户端都必须具有地图，且服务器要有匹配导航 |
| `WEB_PORT` | 27016 | 网页 TCP 端口 |
| `PORT` | 27018 | WebRTC UDP 端口 |

示例：目标 5 人，正常补位完成后，1 位真人 + 4 个 BOT，2 位真人 + 3 个 BOT。补位/让位不是强制在同一帧发生；真实行为必须通过对局验收。管理员统一设置 BOT，不向所有玩家开放任意服务器控制台。

## 2 核 2GB 优化要点

- 按默认 5 人目标开局，保留 8 个最大真人席位；不要直接将目标设成 16 人。
- 服务端每位 WebRTC 连接复用 8 KiB 输入缓冲，仅保存实际数据长度；避免原本每个网络包都分配 8 KiB。
- WebRTC 同时连接数受 MAX_PLAYERS 限制，防止大量空闲标签页耗尽 2GB VM 的内存。
- 原生引擎的网络轮询改为共享 ticker，避免空闲时频繁分配/销毁计时器。
- 限制 BOT 线程池为 1 个工作线程、简化穿墙检测并关闭装饰性喷漆；降低网络更新频率和带宽上限。
- Docker 运行内存限额 1536 MiB、Go 管理堆软预算 384 MiB，给系统保留约 512 MiB；不人为限制 CPU 配额以免游戏帧抖动。
- 新增 `scripts/build-2gb.sh`：在 2GB VM 上串行执行 Docker 构建，原生编译改为单线程；编译阶段如内存不足可能需要临时 Swap。**构建成功与稳定游戏是两项不同验收。**

## 状态与安全边界

`/healthz` 只表示网页进程可响应；`/readyz` 额外检查引擎网络回调是否近期运行。二者均不能证明 BOT 正常走位或多个客户端对战成功。

大厅显示的是**开局配置**，不是实时人数或地图轮换后的当前地图。局域网部署不自动等于 Internet 服务：请限制 TCP/UDP 访问来源，不做公网端口映射，不把此版本当作已加固的公开游戏平台。

## 开发与维护

```bash
npm ci
npm run test:unit
npm run build
go test -race src/server/config.go src/server/config_test.go src/server/http_policy.go src/server/http_policy_test.go src/server/wire_connection.go src/server/wire_connection_test.go
```

完整 Go 引擎构建需 32 位 C 库与固定引擎静态库，通过 Dockerfile 完成。修改前先读 [HANDOVER.md](HANDOVER.md)。保留原 MIT LICENSE；引擎、插件及 Valve 游戏素材的授权不能由本项目 MIT 许可证代替，详见 [THIRD_PARTY.md](THIRD_PARTY.md)。默认构建流程不会把含游戏素材的镜像公开发布。
