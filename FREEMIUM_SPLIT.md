# 免费版 / 专业版（Pro）功能切分方案

> 本文档是 NetOps Platform 商业化落地的**操作清单**：明确哪些页面 / 模块属于免费开源核心，哪些需要加锁为专业版（Pro）专属。
> 配套说明见 [`README.md`](./README.md) 的"版本功能对比表"与"专业版付费引导模块"。

---

## 一、切分原则

| 维度 | 免费版（开源核心）| 专业版（Pro）|
| --- | --- | --- |
| 目标用户 | 个人 / 小团队 / 学习者 | 多机房、多团队的企业 |
| 价值定位 | "看得见、管得了"的基础运维 | "规划得动、自动化、可合规" |
| 设计取向 | 吸引用户与社区、建立口碑 | 创造付费意愿与商业收入 |
| 是否开源 | 是（MIT）| 否（闭源 + 商业授权）|

**关键策略**：把"最惊艳的 3D 监控、拓扑、机柜"留在免费版做引流；把"规模、自动化、协作、合规、移动"放到专业版做变现。

---

## 二、逐模块锁定清单（结构化表格）

图例：`✅ 免费` = 开源核心；`🔒 Pro` = 需加锁为专业版专属；`部分` = 基础免费、高级 Pro。

| 序号 | 模块 | 路由 / 入口 | 需加锁的关键文件 | 免费版 | 专业版 | 锁定策略 | 商业理由 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 登录与会话 | `/login` | `src/views/LoginView.vue` | ✅ | ✅ | 不锁 | 所有用户入口 |
| 2 | 数智机房监控 | `/dashboard` | `src/views/dashboard/DashboardView.vue`、`src/views/datacenter/DataCenterView.vue`(monitor) | ✅ | ✅ | 不锁 | 引流型"哇点"功能 |
| 3 | 机柜 3D 管理 | `/cabinets` | `src/views/cabinets/CabinetsView.vue`、`src/components/cabinet/*` | ✅ | ✅ | 不锁 | 资产可视化的核心体验 |
| 4 | 设备管理 | `/devices` | `src/views/devices/DevicesView.vue`、`DeviceCard/DeviceDetailPanel/RealDevicePanel` | ✅ | ✅ | 不锁 | 基础台账 |
| 5 | 网络拓扑（基础）| `/topology` | `src/views/topology/TopologyView.vue`、`components/canvas-topology/CanvasEngine.js`、`TopologyCanvas.vue`、`TopologyToolbar.vue` | ✅ | ✅ | 不锁 | 核心编辑器，做口碑 |
| 5a | 拓扑高级能力 | `/topology` | `LayoutEngine.js`（自动布局）、批量导入导出、多图层、小地图共享 | 部分 | 🔒 | 按功能开关锁 | 企业批量运维刚需 |
| 6 | 设备库 | `/devicelib` | `src/views/devicelib/DeviceLibView.vue`、`src/data/deviceModels.js`、`cliCommandLibrary.js` | ✅ | ✅ | 不锁 | 通用知识库 |
| 7 | 操作日志 | `/logs` | `src/views/logs/OperationLogView.vue` | ✅ | ✅ | 不锁 | 基础审计 |
| 8 | SSH 命令库 | — | `src/components/SshCommandLibrary.vue` | ✅ | ✅ | 不锁 | 效率工具 |
| 9 | **机房规划** | `/datacenter` | `src/views/datacenter/DataCenterView.vue`(plan)、`RingGauge.vue` | — | 🔒 | **整页锁** | 容量规划是多机房企业的付费点 |
| 10 | **IP 管理** | `/ip-management` | `src/views/ip-management/IpManagementView.vue`、`stores/ipPool.js`、`stores/ipLedger.js` | — | 🔒 | **整页锁** | IP 资源治理是网工高频痛点 |
| 11 | **数据报表** | `/data-report` | `src/views/data-report/DataReportView.vue`、`vue-echarts` 集成 | — | 🔒 | **整页锁**（导出按钮同步锁）| 报表导出是典型付费项 |
| 12 | **数据接入** | `/data-ingest` | `src/views/data-ingest/DataIngestView.vue`、`DataSourcesTab.vue`、`IngestDataTab.vue`、`stores/dataIngest.js`、`data/ingestConfig.js` | — | 🔒 | **整页锁** | 自动化采集降低人力成本 |
| 13 | **通知推送** | `/notification` | `src/views/notification/NotificationView.vue`、`stores/notification.js`、`nodemailer` 集成 | — | 🔒 | **整页锁** | 主动告警是运维价值高地 |
| 14 | **移动端** | Android | `android/`、`@capacitor/*`、移动专属视图 | — | 🔒 | 构建/打包开关 | 随身运维溢价能力 |
| 15 | **多项目/协作** | — | `stores/` 中项目隔离、`netops_projects` 多租户 | — | 🔒 | 功能开关 | 团队协作场景 |
| 16 | **API / Webhook** | — | `src/plugins/network-tools*.js` 暴露的接口层 | — | 🔒 | 接口鉴权锁 | 系统集成刚需 |
| 17 | **自动备份/同步** | — | `stores/db-sync-utils.js` | — | 🔒 | 功能开关 | 数据安全溢价 |
| 18 | **SLA / 可用性** | — | 基于 `stores/monitoring.js`、`alert.js` 的可用性聚合 | — | 🔒 | 功能开关 | 合规与汇报场景 |

---

## 三、建议加锁的"整页"清单（一句话汇总）

需要**整页加锁为 Pro 专属**的 `.vue` 入口：

- `src/views/datacenter/DataCenterView.vue`（仅 plan 规划模式；monitor 监控模式保持免费）
- `src/views/ip-management/IpManagementView.vue`
- `src/views/data-report/DataReportView.vue`
- `src/views/data-ingest/DataIngestView.vue`（含 `DataSourcesTab.vue`、`IngestDataTab.vue`）
- `src/views/notification/NotificationView.vue`
- 移动端 Android 构建产物（`android/` + Capacitor 打包开关）

需要**按子功能加锁（基础免费 / 高级 Pro）**的：

- 网络拓扑：`LayoutEngine.js` 自动布局、批量导入导出、多图层共享
- 数据报表：导出 / 高级图表能力
- 设备台账：超过免费额度后的批量导入

---

## 四、落地实现建议（路由级门禁）

现有路由已具备 `meta.requiresAuth` 门禁（`src/router/index.js` + `useAuthStore`）。可复用同一机制扩展专业版校验：

1. 在 `router` 的 `meta` 中增加 `pro: true` 标记（如 `ip-management`、`data-report`、`data-ingest`、`notification`、规划态 `datacenter`）。
2. 在 `router.beforeEach` 守卫中：若 `to.meta.pro && !licenseStore.isPro`，则 `next('/pricing')`（导向专业版引导页）或就地渲染"升级弹层"。
3. 专业版状态由 `electron/` 授权组件（`LicenseCheck.exe` 等）校验结果注入前端 `licenseStore`，与现有试用/激活流程一致。
4. 对于"部分锁"的功能（如拓扑自动布局），在对应按钮/菜单处用 `v-if="licenseStore.isPro"` 控制显隐，并给出"Pro"角标。

> 注意：纯前端门禁仅用于"体验引导"，**真正的授权校验必须以 `electron/` 闭源组件为准**，避免被轻易绕过。

---

## 五、与 README 的对应关系

- 免费/Pro 能力总览 → `README.md`「🆚 版本功能对比表」
- 购买/激活说明 → `README.md`「💎 专业版 / Pro（付费引导模块）」
- 开源范围与授权 → `README.md`「🔒 许可与商业化」+「⚠️ 开源前安全须知」
