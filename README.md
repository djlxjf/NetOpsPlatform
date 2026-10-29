# NetOps Platform · 轻量化网络运维管理平台

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux%20%7C%20Android-lightgrey.svg)](#-平台支持)
[![Framework](https://img.shields.io/badge/framework-Vue%203-42b883.svg)](https://vuejs.org/)
[![Version](https://img.shields.io/badge/version-1.6.3-green.svg)](#)

> 一套面向中小机房与网络运维团队的**可视化运维平台**：用 3D 机房、网络拓扑、机柜视图把资产"看见"，用 SNMP / SSH 采集把状态"摸清"，用报表与告警把风险"管住"。同时提供桌面端（Windows / macOS / Linux）与移动端（Android）。

---

## 📌 项目简介

NetOps Platform 是一款基于 **Vue 3** 构建、可打包为 **Electron 桌面应用**与 **Capacitor Android 应用**的轻量化网络运维管理系统。它把分散的设备台账、链路拓扑、机柜容量、IP 资源、采集数据与告警通知整合到一个本地优先（Local-first）的客户端中，适合没有预算采购重型网管系统（如商业 NMS）的中小团队。

**核心定位**：开源免费的核心功能 + 面向企业的专业版（Pro）增值能力（详见下方对比表与付费引导模块）。

### 技术栈

| 分层 | 选型 |
| --- | --- |
| 前端框架 | Vue 3 + Vite + Pinia + Vue Router |
| UI 组件 | Element Plus + ECharts（图表）|
| 3D 可视化 | Three.js（数智机房 / 机柜 / 机房规划）|
| 拓扑编辑 | @antv/x6 + @vue-flow（双引擎，可切换）|
| 本地存储 | better-sqlite3（嵌入式数据库）|
| 设备采集 | net-snmp、ssh2 / ssh2-sftp、nodemailer（告警邮件）|
| 终端 | xterm（SSH 终端 + Zmodem 文件传输）|
| 桌面端 | Electron（Win / macOS / Linux）|
| 移动端 | Capacitor（Android）|
| 质量保障 | Vitest（单元）、Playwright（端到端）|

---

## ✨ 核心特性

- **🏢 数智机房 3D 监控大屏**：实时呈现机房温度、动环、传感器与告警的只读监控视图。
- **📐 机房规划（3D）**：以可视化方式规划墙体、门窗、机柜摆放与容量，支持多房间。
- **🗄️ 机柜 3D 管理**：逐柜、逐 U 位展示设备面板与端口，支持品牌面板（华为 / 海康等）贴图。
- **🖥️ 设备与资产台账**：设备卡片、详情面板、真实设备接入，统一管理 IT 资产。
- **🕸️ 网络拓扑编辑**：拖拽式画布、自动布局、小地图、缩略图、连线渲染与属性面板。
- **📡 数据接入**：通过 SNMP / SSH 等多源采集设备与链路数据并入库。
- **🌐 IP 资源管理**：IP 地址池与台账的规划、分配与回收（专业版重点能力）。
- **📊 数据报表**：基于 ECharts 的多维统计与导出（专业版重点能力）。
- **🔔 通知推送**：异常自动告警，支持邮件等分发渠道（专业版重点能力）。
- **📝 操作日志**：全量操作留痕，满足审计与追溯需求。
- **⌨️ SSH 命令库 / 终端**：内置常用命令模板与 SSH 终端，提升排障效率。
- **📱 多端一致**：同一套代码库覆盖桌面三端与 Android 移动端。

---

## 🖼️ 项目截图（说明）

> 下面是建议随仓库提供的截图清单。**当前仓库尚未包含截图文件**，请在上线前于 `docs/screenshots/` 目录放置对应图片，并把文件名替换到下表（图片请用压缩后的 PNG/JPG，单张建议 < 500 KB）。

| 建议文件名 | 对应页面 / 功能 | 截图应展示的内容 |
| --- | --- | --- |
| `dashboard-monitor.png` | 数智机房监控大屏 | 3D 机房全景 + 顶栏统计 + 温度/动环/告警面板 |
| `datacenter-plan.png` | 机房规划（3D） | 可编辑墙体/门窗/机柜摆放的规划视图 |
| `cabinet-3d.png` | 机柜管理 | 单柜逐 U 设备面板与端口高亮 |
| `topology-editor.png` | 网络拓扑 | 拖拽画布 + 小地图 + 节点/连线属性面板 |
| `device-list.png` | 设备管理 | 设备卡片网格与详情抽屉 |
| `ip-management.png` | IP 管理（Pro） | IP 地址池分配树/表格（Pro 角标）|
| `data-report.png` | 数据报表（Pro） | ECharts 多维图表与导出按钮（Pro 角标）|
| `data-ingest.png` | 数据接入（Pro） | SNMP/SSH 数据源配置列表（Pro 角标）|
| `notification.png` | 通知推送（Pro） | 告警规则与邮件分发配置（Pro 角标）|
| `mobile-android.png` | 移动端（Pro） | Android 上的同源界面（Pro 角标）|

```markdown
<!-- 在上方"核心特性"之后可插入示例： -->
![数智机房监控大屏](docs/screenshots/dashboard-monitor.png)
```

---

## 🧩 功能模块一览

| 模块 | 路由 | 主要文件 | 说明 |
| --- | --- | --- | --- |
| 登录与会话 | `/login` | `src/views/LoginView.vue` | 账号 + 项目双会话门禁 |
| 数智机房（监控）| `/dashboard` | `src/views/dashboard/DashboardView.vue` → `datacenter/DataCenterView.vue`(monitor) | 3D 只读监控大屏 |
| 机柜管理 | `/cabinets` | `src/views/cabinets/CabinetsView.vue` + `components/cabinet/*` | 逐 U 3D 机柜 |
| 设备管理 | `/devices` | `src/views/devices/DevicesView.vue` + `DeviceCard/DeviceDetailPanel/RealDevicePanel` | 资产台账 |
| 机房规划 | `/datacenter` | `src/views/datacenter/DataCenterView.vue`(plan) | 可编辑 3D 规划 |
| 网络拓扑 | `/topology` | `src/views/topology/TopologyView.vue` + `components/canvas-topology/*` | 拓扑画布引擎 |
| 设备库 | `/devicelib` | `src/views/devicelib/DeviceLibView.vue` + `src/data/deviceModels.js` | 设备型号库 |
| 操作日志 | `/logs` | `src/views/logs/OperationLogView.vue` | 审计留痕 |
| SSH 命令库 | — | `src/components/SshCommandLibrary.vue` | 命令模板 |
| IP 管理 | `/ip-management` | `src/views/ip-management/IpManagementView.vue` | IP 资源规划（Pro）|
| 数据报表 | `/data-report` | `src/views/data-report/DataReportView.vue` | 报表与导出（Pro）|
| 数据接入 | `/data-ingest` | `src/views/data-ingest/DataIngestView.vue` | 多源采集（Pro）|
| 通知推送 | `/notification` | `src/views/notification/NotificationView.vue` | 告警分发（Pro）|

> 3D 引擎位于独立子项目 `datacenter-3d/`（Three.js + 实例化渲染 + 深色科技风），由主工程引用其构建产物。

---

## 🆚 版本功能对比表

| 能力 | 免费版（开源核心）| 专业版（Pro）|
| --- | --- | --- |
| 数智机房 3D 监控大屏 | ✅ | ✅ |
| 机柜 3D 管理（逐 U）| ✅ | ✅ |
| 设备 / 资产台账 | ✅ | ✅ |
| 网络拓扑编辑（基础）| ✅ | ✅ |
| 设备库 / SSH 命令库 | ✅ | ✅ |
| 操作日志 | ✅ | ✅ |
| 桌面端（Win/macOS/Linux）| ✅ | ✅ |
| 机房规划（多房间容量规划）| — | 💎 |
| IP 地址资源规划 | — | 💎 |
| 高级数据报表与导出 | — | 💎 |
| 多源数据接入（SNMP/SSH 自动化）| — | 💎 |
| 自动告警与通知分发 | — | 💎 |
| 移动端（Android）| — | 💎 |
| 多项目 / 团队协作 | — | 💎 |
| API / Webhook 集成 | — | 💎 |
| 自动备份与云同步 | — | 💎 |
| SLA / 可用性报表 | — | 💎 |
| 商业授权与技术支持 | — | 💎 |

完整、可操作的"哪些页面/模块需要加锁为专业版专属"清单见 **[FREEMIUM_SPLIT.md](./FREEMIUM_SPLIT.md)**。

---

## 💎 专业版 / Pro（付费引导模块）

专业版面向**有多机房、多团队、自动化与合规需求的企业用户**，在免费核心之上解锁容量规划、资源治理、自动化采集、智能告警与移动办公等增值能力。

**专业版包含（摘要）**
- 机房容量规划与多房间管理
- IP 资源全生命周期治理
- 高级报表、导出与 SLA 可用性分析
- SNMP / SSH 多源自动化采集
- 异常自动告警与多渠道分发
- Android 移动端随身运维
- 多项目协作、API/Webhook、自动备份同步
- 商业使用授权 + 优先技术支持

**如何获取 / 激活**
1. 前往官方购买渠道获取专业版许可证（占位链接：`<你的购买页 / 邮箱>`）。
2. 桌面端启动时会调用内置授权校验；试用到期或需要激活时自动弹出激活窗口。
3. 在激活窗口填入许可证密钥完成激活；激活逻辑由 `electron/` 下的授权组件处理。

> 当前仓库中 `electron/LicenseCore.dll`、`LicenseActivate.exe`、`LicenseCheck.exe` 为**预编译的闭源授权组件**，不包含在 MIT 开源范围内，仅随专业版发行包提供。开源代码本身采用 MIT 许可（见 [License](#-许可与商业化)）。

---

## 🚀 快速开始

> 需要 Node.js ≥ 20 与 npm ≥ 10。

```bash
# 1. 安装依赖
npm install

# 2. 启动 Web 开发服务器（默认 http://localhost:5173）
npm run dev

# 3. 构建 Web 产物
npm run build

# 4. 打包桌面端
npm run electron:build:win      # Windows
npm run electron:build:mac      # macOS
npm run electron:build:linux    # Linux
npm run electron:build:all      # 全平台

# 5. 移动端（需 Android Studio）
npm run build && npx cap sync android
```

常用脚本：`npm run lint`（代码规范）、`npm run test:unit`（单元测试）、`npm run test:e2e`（端到端）。

---

## 📦 项目结构（精简）

```
NetOpsPlatform/
├─ src/                  # 主工程（Vue 3 前端 + Pinia 状态 + 路由）
│  ├─ views/             # 各业务页面（登录/监控/拓扑/机柜/IP/报表…）
│  ├─ components/        # 公共与业务组件（含 canvas-topology、cabinet 3D）
│  ├─ stores/            # Pinia 状态（设备/拓扑/IP/告警/采集…）
│  ├─ data/              # 设备型号库、命令库等静态数据
│  └─ router/            # 路由与权限门禁
├─ datacenter-3d/        # 独立 3D 机房引擎子项目（Three.js）
├─ electron/             # 桌面端主进程 + 授权组件 + 数据库
├─ android/              # Capacitor 原生安卓工程（见 .gitignore 说明）
├─ public/               # 静态资源
└─ scripts/              # 发布 / 验证脚本
```

---

## 🔒 许可与商业化

- **源代码**：以 **MIT 许可证**开源（见 [`LICENSE`](./LICENSE)），任何人可免费使用、修改、再分发核心功能。
- **专业版（Pro）**：在 MIT 核心之上提供闭源增值模块与商业授权，需购买许可证方可启用（见上方付费引导模块）。
- **授权组件**：`electron/` 下的 `LicenseCore.dll` 等预编译二进制为商业资产，不开放源码，仅随专业版发行包分发。

这是一种典型的 **Open-Core（开放核心）** 模式：用免费核心吸引用户与社区，用专业版实现商业化。

---

## ⚠️ 开源前安全须知（必读）

本仓库在首次推送到 GitHub **之前**，请务必完成以下核对：

1. **已补全 `.gitignore`**：已排除 `node_modules/`、`dist/`、`release/`、`base_apk_extracted/`、`src.green-backup/`、`.env`、`*.db` 等。请勿提交依赖、构建产物、备份与密钥。
2. **密钥扫描**：提交前请用 `gitleaks` 或 `git-secrets` 扫描，确认无真实口令、API Key、私钥被纳入版本控制。本仓库代码中 `Sentry` 的 DSN 当前为占位符（`your-dsn@sentry.io`），是安全的；但请不要在 `.env` 中填入真实密钥后误提交。
3. **授权二进制**：`electron/*.dll`、`*.exe` 为闭源授权组件，公开仓库中建议仅保留"校验接口说明"，或将专业版以独立私有仓库 / 发行包形式提供，避免混淆开源范围。
4. **占位信息替换**：将 `package.json` 中的 `repository.url`（`your-github-username`）替换为你的真实地址；`README` 中的购买/联系占位链接替换为真实渠道。

---

## 🤝 贡献

欢迎以 Issue / Pull Request 形式参与核心功能改进。提交前请运行 `npm run lint` 与 `npm run test:unit`。专业版闭源模块不在本仓库接受外部修改。

## 📮 联系方式

- 问题反馈：仓库 Issue
- 专业版咨询 / 购买：`<你的邮箱或购买页占位>`

---

© NetOps Platform. 核心代码基于 MIT 许可开源；专业版增值能力与授权组件为商业资产。
