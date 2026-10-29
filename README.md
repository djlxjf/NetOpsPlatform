# NetOps Platform · 轻量化网络运维管理平台

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux%20%7C%20Android-lightgrey.svg)](#-平台支持)
[![Framework](https://img.shields.io/badge/framework-Vue%203-42b883.svg)](https://vuejs.org/)
[![Version](https://img.shields.io/badge/version-1.6.3-green.svg)](#)

> 一套面向中小机房与网络运维团队的**可视化运维平台**：用 3D 机房、网络拓扑、机柜视图把资产"看见"，用 SNMP / SSH 采集把状态"摸清"，用报表与告警把风险"管住"。同时提供桌面端（Windows / macOS / Linux）与移动端（Android）。

---

## 📌 项目简介

NetOps Platform 是一款基于 **Vue 3** 构建、可打包为 **Electron 桌面应用**与 **Capacitor Android 应用**的轻量化网络运维管理系统。它把分散的设备台账、链路拓扑、机柜容量、IP 资源、采集数据与告警通知整合到一个本地优先（Local-first）的客户端中，适合没有预算采购重型网管系统（如商业 NMS）的中小团队。

**核心定位**：**完整开源、全部功能免费**。所有能力（3D 机房、拓扑编辑、IP 资源管理、数据报表、数据接入、告警通知、移动端）均无功能墙、无付费墙，遵循 MIT 许可证开放使用。若项目对你有帮助，欢迎[随缘打赏](#-随缘打赏)支持持续开发。

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
- **🌐 IP 资源管理**：IP 地址池与台账的规划、分配与回收。
- **📊 数据报表**：基于 ECharts 的多维统计与导出。
- **🔔 通知推送**：异常自动告警，支持邮件等分发渠道。
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
| `ip-management.png` | IP 管理 | IP 地址池分配树/表格 |
| `data-report.png` | 数据报表 | ECharts 多维图表与导出按钮 |
| `data-ingest.png` | 数据接入 | SNMP/SSH 数据源配置列表 |
| `notification.png` | 通知推送 | 告警规则与邮件分发配置 |
| `mobile-android.png` | 移动端 | Android 上的同源界面 |

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
| IP 管理 | `/ip-management` | `src/views/ip-management/IpManagementView.vue` | IP 资源规划 |
| 数据报表 | `/data-report` | `src/views/data-report/DataReportView.vue` | 报表与导出 |
| 数据接入 | `/data-ingest` | `src/views/data-ingest/DataIngestView.vue` | 多源采集 |
| 通知推送 | `/notification` | `src/views/notification/NotificationView.vue` | 告警分发 |

> 3D 引擎位于独立子项目 `datacenter-3d/`（Three.js + 实例化渲染 + 深色科技风），由主工程引用其构建产物。

---

## 🆓 全开源说明

本项目**完整开源、全部功能免费**，不设任何功能墙与付费墙。

| 能力 | 是否开源免费 |
| --- | --- |
| 数智机房 3D 监控大屏 | ✅ 免费 |
| 机柜 3D 管理（逐 U）| ✅ 免费 |
| 设备 / 资产台账 | ✅ 免费 |
| 网络拓扑编辑（双引擎）| ✅ 免费 |
| 机房规划（多房间容量规划）| ✅ 免费 |
| IP 地址资源规划 | ✅ 免费 |
| 高级数据报表与导出 | ✅ 免费 |
| 多源数据接入（SNMP/SSH 自动化）| ✅ 免费 |
| 自动告警与通知分发 | ✅ 免费 |
| 设备库 / SSH 命令库 | ✅ 免费 |
| 操作日志（审计留痕）| ✅ 免费 |
| 移动端（Android）| ✅ 免费 |
| 多项目 / 团队协作 | ✅ 免费 |
| API / Webhook 集成 | ✅ 免费 |
| 自动备份与云同步 | ✅ 免费 |
| SLA / 可用性报表 | ✅ 免费 |
| 桌面端（Win/macOS/Linux）| ✅ 免费 |

- 源码以 **MIT 许可证**开放，任何人可自由使用、修改、再分发、商用，无需申请授权。
- 没有"专业版"、没有功能解锁、没有授权码校验（`electron/` 下的历史授权组件已不作为分发门槛）。
- 若这些能力对你有帮助，欢迎[随缘打赏](#-随缘打赏)；打赏完全自愿，不影响任何功能的使用。

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
├─ electron/             # 桌面端主进程 + 数据库
├─ android/              # Capacitor 原生安卓工程（见 .gitignore 说明）
├─ public/               # 静态资源
└─ scripts/              # 发布 / 验证脚本
```

---

## 🔓 许可

- **源代码**：以 **MIT 许可证**开源（见 [`LICENSE`](./LICENSE)），任何人可免费使用、修改、再分发，**包括商业用途**，无需申请授权。
- **全部功能**：无功能墙、无付费墙、无授权码校验，仓库中的所有能力均完整可用。
- **欢迎二次开发**：Fork、修改、二次分发均 welcome，请保留 MIT 许可声明。

---

## ☕ 随缘打赏

如果这个项目对你有帮助，或者你单纯觉得"这东西挺有意思"，欢迎请我喝杯咖啡 ☕ —— **完全自愿，不打赏也完全不影响你使用项目的任何功能**。

<p align="center">
  <img src="./public/donate-alipay.png" alt="支付宝收款码" width="220" height="280">
  &nbsp;&nbsp;&nbsp;
  <img src="./public/donate-wechat.png" alt="微信收款码" width="220" height="280">
</p>

<p align="center">
  <sub>支付宝 &nbsp;·&nbsp; 微信 &nbsp;·&nbsp; 金额随意，多少都行</sub>
</p>

打赏用途：服务器与域名开销、第三方服务订阅、SDK 授权、买咖啡。再次感谢每一位使用、Star、提 Issue 和提 PR 的朋友 🙏

---

## ⚠️ 开源前安全须知（必读）

本仓库在首次推送到 GitHub **之前**，请务必完成以下核对：

1. **已补全 `.gitignore`**：已排除 `node_modules/`、`dist/`、`release/`、`base_apk_extracted/`、`src.green-backup/`、`.env`、`*.db` 等。请勿提交依赖、构建产物、备份与密钥。
2. **密钥扫描**：提交前请用 `gitleaks` 或 `git-secrets` 扫描，确认无真实口令、API Key、私钥被纳入版本控制。本仓库代码中 `Sentry` 的 DSN 当前为占位符（`your-dsn@sentry.io`），是安全的；但请不要在 `.env` 中填入真实密钥后误提交。
3. **占位信息替换**：将 `package.json` 中的 `repository.url`（`your-github-username`）替换为你的真实地址（本仓库已改为 `https://github.com/djlxjf/NetOpsPlatform`）；`README` 中的联系方式占位替换为真实渠道。

---

## 🤝 贡献

欢迎以 Issue / Pull Request 形式参与改进。提交前请运行 `npm run lint` 与 `npm run test:unit`。所有功能模块均开放接受外部修改。

## 📮 联系方式

- 问题反馈：仓库 Issue
- 交流与建议：仓库 Issue / Discussions

---

© NetOps Platform. 基于 MIT 许可证完全开源。
