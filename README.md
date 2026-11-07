# 塔岛 CS 1.6 · 中文局域网对战平台

本仓库 Fork 自 [balintsoos/cs16-web-server](https://github.com/balintsoos/cs16-web-server)，沿用 MIT 许可证的网页客户端代码和 WebRTC/Xash3D 技术路线。

**当前状态：已提交开发预览代码，但尚未完成 Docker 真机运行、YaPB 加载和真人/BOT 同场对战验收。不要当作可直接投入生产的成品。**

## 本次开发内容

- 中文默认、可切换英文的响应式网页大厅，优化桌面和小屏布局。
- 昵称记忆、输入安全处理、初始加载进度与 WebRTC 超时错误反馈。
- 浏览器解压资源改为固定 4 个并发任务，降低大量文件同时解压时的内存峰值。
- 使用固定摘要的第三方 Xash3D WebRTC 服务器镜像替换无法直接构建的旧引擎源码依赖。
- 构建时下载官方 YaPB Linux 4.4.957 资源，尝试以独立游戏 DLL 方式加载 BOT。
- 预置 8 人目标人数、BOT 自动补位和真人加入时自动让位配置。
- 将端口绑定到虚拟机的实际内网地址，不自动将包含游戏资源的镜像公开推送。

## 建议部署虚拟机规格

| 使用人数 | vCPU | 内存 | SSD |
|---|---:|---:|---:|
| 测试（2-4 真人，少量 BOT） | 2 | 4 GB | 40 GB |
| **推荐（4-10 真人 + BOT）** | **4** | **8 GB** | **60 GB** |
| 更多玩家和 BOT 的预留方案 | 6-8 | 12-16 GB | 100 GB |

推荐 Debian 13 x86_64 + Docker Engine + Docker Compose 插件；尽量使用性能较好的 CPU 核心、SSD 与有线网络。这些是保守规划值，**并非经过该项目压力测试的性能数据**。服务器负责局域网同步与 BOT 逻辑，实际网页游戏图像渲染由每个玩家的电脑承担。

## 在全新 VM 上部署

1. 给 VM 配置一个局域网固定 IP，例如 192.168.2.x，并确认同事电脑能够访问。
2. 安装 Docker Engine 和 Docker Compose 插件；确认新 VM 能访问 Docker Hub、npm 和 GitHub Releases。
3. 在新虚拟机上执行：

~~~bash
git clone https://github.com/cjl88615/cs16-web-server.git
cd cs16-web-server
git switch feat/zh-lan-yapb-20261107
cp .env.example .env
nano .env
docker compose build
docker compose up -d
docker compose logs --tail=100 -f
~~~

编辑 .env，将 LAN_IP 改为新 VM 的**实际内网 IP**。示例 192.168.2.120 只是占位符，不能在没有核查地址占用的情况下直接使用。

访问地址：http://虚拟机内网IP:27016

内网防火墙放行：27016/TCP（网页 + WebSocket 信令）、27018/UDP（WebRTC 联机）。请仅向公司的可信内网网段开放，不要在公网路由器上转发这两个端口。Cloudflare HTTP Tunnel 不能取代浏览器与游戏服务器需要的直接 UDP 连接。

**首次构建需要较长时间下载游戏文件**。SteamCMD app 90 偶尔可能失败，失败时核查网络后重新执行 docker compose build。项目仓库中不保存 Valve 游戏资产，也不向 GitHub Container Registry 推送完整游戏镜像。

## BOT 设置

BOT 服务器默认配置见：configs/cstrike/server.cfg，关键选项：

~~~cfg
yb_quota "8"
yb_quota_mode "fill"
yb_autovacate "1"
yb_autovacate_keep_slots "1"
yb_skill "55"
yb_language "chs"
~~~

含义：目标 8 个游戏席位（真人 + BOT），真人增加时相应减少 BOT；BOT 难度预设为中等偏上。游戏进程能否正确加载 YaPB 仍需要在新虚拟机上通过日志和控制台验证。修改上述配置后重新构建并重启容器即可应用新配置。本版本不向普通玩家开放无认证的 BOT 管理 API。

官方参考：[YaPB 安装](https://yapb.github.io/docs/en/getting-started/installation/) / [YaPB CVAR](https://yapb.github.io/docs/en/configuring/cvars/)。

请注意：BOT **需要地图导航图 graph**，某些地图首次进入需要下载/生成。纯离线运行时应提前准备导航图。原版游戏并不保证包含 fy_iceworld 自定义地图；要玩冰雪地图，必须额外获得有权使用的地图资源及对应 BOT 导航图。

## 上线前验收清单

1. Docker 完整构建成功、服务正常启动，没有 DLL 加载错误。
2. 从新 VM 的网页首页进入 de_dust2，成功显示游戏画面与第一人称控制。
3. 服务器控制台能够执行 yb version、yb list，BOT 可以行动、射击并打完回合。
4. 两台同一 LAN 的 Windows 电脑用不同昵称同时进入，正常联机；第二位真人进入时 BOT 让出空位。
5. 切换到至少另一张地图，BOT 能正常导航；重启容器后机器人资源和图数据保持完好。
6. 检查 WebRTC UDP 可达性、浏览器内存、服务器 CPU/内存和延迟；再决定是否增加玩家数量。

**尚未经过上面实测，不代表 BOT 已经可用。**

## 技术限制、版权和回滚

- 上游 Dockerfile 依赖的 yohimik/xash3d-fwgs 与 yohimik/goxash3d-fwgs GitHub 地址目前不可直接访问。这里改为复用经过其他 LAN 项目使用的固定镜像 digest，但仍需确认能在您的 VM 上正常拉取。
- YaPB 虽然支持 Xash3D，但并没有现成证据证明它在这份特定 Go/WebRTC 封装下可正常运行。如果 standalone 加载方式失败，应针对实际镜像进行兼容适配，而不是继续宣称 BOT 功能已完成。
- Counter-Strike 1.6 游戏、贴图、模型、音乐、商标等资产属于 Valve 及相关权利人。请遵守 Steam/游戏许可条款，勿将 gamefiles.zip 或包含游戏资产的 Docker 镜像公开分发。
- 原版 main 分支保持不变，开发工作均位于 feat/zh-lan-yapb-20261107。验收失败时可停止新容器并回到 main；不要覆盖其他服务器已有项目。
