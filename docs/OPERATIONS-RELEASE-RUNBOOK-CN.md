# MyEMS 生产运维与发布手册

## 1. 文档信息

| 项目 | 内容 |
| --- | --- |
| 文档名称 | MyEMS 生产运维与发布手册 |
| 文档版本 | v1.3 |
| 生效日期 | 2026-05-08 |
| 适用系统 | MyEMS Docker Compose 生产环境 |
| 适用目录 | `/home/ubuntu/myems-complete` |
| 运维入口目录 | `/home/ubuntu/myems-complete/others` |
| 维护责任 | 生产运维负责人、应用发布负责人、数据库负责人 |
| 敏感信息管理 | 账号密码、Token、密钥不写入本仓库，应保存在密码库或运维台账 |

## 2. 修订记录

| 版本 | 日期 | 修改人 | 说明 |
| --- | --- | --- | --- |
| v1.0 | 2026-04-16 | GitHub Copilot | 初版，覆盖发布、停机、恢复、回滚、数据对账 |
| v1.1 | 2026-04-28 | GitHub Copilot | 新增纯镜像生产部署模板、离线镜像交付要求、EMQX 与 myems-mqtt 初始化指引 |
| v1.2 | 2026-05-07 | GitHub Copilot | 补充 GitHub Actions 预构建、GHCR 在线验证、离线镜像包交付、分批上线与验证 SOP |
| v1.3 | 2026-05-08 | GitHub Copilot | 补充当前仓库 GitHub Actions 触发规则、artifact 命名、分支到 tag 的发布路径与本版本上线剧本 |

## 3. 文档目的与适用范围

本文档用于指导 MyEMS 生产环境的日常发布、停机维护、异常恢复、回滚与数据对账，目标是：

1. 尽量把版本发布安排在工作时间之后执行。
2. 在升级应用的同时，尽量减少对用户访问的影响。
3. 在涉及计量数据采集和外部接口接入时，优先控制数据丢失、断传和漏算风险。
4. 为值班人员提供可直接复制执行的命令模板和检查清单。

本文档适用于当前基于 Docker Compose 部署的 MyEMS 生产环境，也适用于后续同类环境复制使用。

## 4. 当前生产环境概况

### 4.1 当前部署结构

当前生产环境采用宿主机 MySQL + Docker Compose 应用服务模式。

当前核心运行面：

1. `emqx`
2. `web`
3. `admin`
4. `api`
5. `aggregation`
6. `cleaning`
7. `normalization`
8. `modbus_tcp`
9. `myems_mqtt`

Compose 文件位置：

`/home/ubuntu/myems-complete/others/docker-compose-on-linux.yml`

共享上传目录：

`/myems-upload`

### 4.2 当前端口规划

| 端口 | 服务 | 说明 |
| --- | --- | --- |
| 80 | `web` | 前台用户访问入口 |
| 8001 | `admin` | 管理后台入口 |
| 8000 | `api` | API 服务入口 |
| 1883 | `emqx` | MQTT Broker 入口，仅允许可信网络或开启 TLS 后暴露 |
| 18083 | `emqx` | EMQX Dashboard 入口，仅允许运维管理访问 |
| 3306 | MySQL | 数据库服务，仅允许宿主机和容器访问，不应对公网开放 |

### 4.3 当前服务特性

1. `web` 与 `admin` 为无状态前端入口，停机会直接影响登录与页面访问。
2. `api` 为系统统一业务入口，停机会导致前后台和外部调用全部不可用。
3. `modbus_tcp` 为实时轮询采集服务，停机窗口内会形成潜在数据盲区。
4. `emqx` 为 MQTT Broker，停机会导致 MQTT 设备或外部网关无法继续上送数据。
5. `myems_mqtt` 为 MQTT 入库适配服务，停机会导致已进入 Broker 的 MQTT 消息无法继续写入 MyEMS 历史表。
6. `cleaning`、`normalization`、`aggregation` 为后台处理服务，停机后通常可以通过恢复后的追平继续补处理。
7. 生产环境默认使用纯镜像模板 `others/docker-compose-on-linux.image.yml`，只允许执行 `docker compose pull` 或 `docker load` 后再 `up -d --no-build`。
8. `others/docker-compose-on-linux.yml` 仅用于开发、预发或经过审批的应急现场重建，不作为低内存生产环境的常规升级入口。

## 5. 系统架构与服务职责

### 5.1 服务职责说明

| 服务 | 主要职责 | 是否直接影响用户访问 | 是否直接影响数据采集 | 是否支持延迟恢复后追平 |
| --- | --- | --- | --- | --- |
| `emqx` | MQTT Broker，接收外部采集网关或设备上送消息 | 否 | 是 | 取决于客户端重传与会话策略 |
| `web` | 前台页面展示、看板、报表入口 | 是 | 否 | 不涉及 |
| `admin` | 后台管理、数据源与配置维护 | 是 | 间接 | 不涉及 |
| `api` | 登录、查询、配置、报表、第三方业务入口 | 是 | 间接 | 不涉及 |
| `modbus_tcp` | 实时采集 Modbus TCP 设备数据 | 否 | 是 | 默认否 |
| `myems_mqtt` | 订阅 MQTT Topic 并写入 MyEMS 历史表 | 否 | 是 | 取决于 Broker 保留、QoS 和客户端重投策略 |
| `cleaning` | 历史数据清洗、坏点标记 | 否 | 否 | 是 |
| `normalization` | 原始累计量归一化计算 | 否 | 否 | 是 |
| `aggregation` | 报表统计、聚合、碳排、账单计算 | 否 | 否 | 是 |
| MySQL | 业务数据、历史数据、配置数据存储 | 是 | 是 | 否 |

### 5.2 依赖关系说明

1. `web` 与 `admin` 依赖 `api`。
2. `api`、`modbus_tcp`、`myems_mqtt`、`cleaning`、`normalization`、`aggregation` 全部依赖 MySQL。
3. `myems_mqtt` 依赖 `emqx`、数据源、点位、Topic 绑定和网关 Token 配置。
4. `normalization` 依赖历史数据存在。
5. `aggregation` 依赖 `normalization` 的输出结果。
6. `modbus_tcp` 依赖网关、数据源、点位配置以及设备网络可达性。

## 6. 发布影响矩阵

| 停机对象 | 用户可见影响 | 数据风险 | 恢复后是否可追平 | 发布说明 |
| --- | --- | --- | --- | --- |
| `emqx` | 用户未必立刻感知，但 MQTT 入站中断 | 取决于设备 QoS、保留和重传策略，存在断传风险 | 取决于客户端补发能力 | 高风险发布项 |
| `web` | 前台无法打开或页面报错 | 无直接数据丢失 | 不涉及 | 可单独发布 |
| `admin` | 管理后台不可登录或不可配置 | 无直接数据丢失 | 不涉及 | 可单独发布 |
| `api` | 前后台全部不可用，第三方接口失败 | 若外部接口依赖 API，存在断传风险 | 不涉及 | 建议与前端错峰发布 |
| `cleaning` | 用户通常无直接感知 | 数据质量处理延迟 | 是 | 可短暂停机 |
| `normalization` | 报表与统计延迟更新 | 归一化结果滞后 | 是 | 可短暂停机 |
| `aggregation` | 统计、碳排、账单延迟更新 | 聚合结果滞后 | 是 | 可短暂停机 |
| `modbus_tcp` | 用户未必立刻感知，但实时采集停止 | 停机期间可能永久丢失实时采集点 | 默认否 | 高风险发布项 |
| `myems_mqtt` | 用户未必立刻感知，但 MQTT 数据不再入库 | Broker 已接收但未落库的数据可能延迟或丢失 | 取决于 Broker 会话和补发策略 | 高风险发布项 |
| MySQL | 全系统不可用 | 高风险 | 否 | 非必要禁止在正常发布中改动 |

## 7. 发布分级与时间窗口策略

### 7.1 发布分级

#### A 类：前端发布

适用范围：

1. `web` 静态资源调整
2. `admin` 静态资源调整
3. 样式、菜单、页面交互调整

发布要求：

1. 可单独发布。
2. 推荐在工作时间后执行。
3. 不应影响 `modbus_tcp`。

#### B 类：API 发布

适用范围：

1. API 逻辑调整
2. 登录、权限、接口字段、校验规则变更
3. 外部系统 HTTP/API 交互逻辑调整

发布要求：

1. 必须在工作时间后执行。
2. 应提前通知后台用户和接口调用方。
3. 如果不涉及采集链路，禁止顺带重启 `modbus_tcp`。

#### C 类：后台计算服务发布

适用范围：

1. `cleaning`
2. `normalization`
3. `aggregation`

发布要求：

1. 可与 API 分开发布。
2. 允许短暂停机。
3. 恢复后应重点验证是否开始追平。

#### D 类：采集链路发布

适用范围：

1. `modbus_tcp`
2. `emqx`
3. `myems_mqtt`
4. 网关、数据源、点位、采集逻辑调整
5. 第三方计量数据接口接入逻辑变更

发布要求：

1. 必须在工作时间后执行。
2. 必须设置停机时长目标。
3. 必须执行停机前后时点核对。
4. 必须具备明确恢复策略。
5. 若使用 MQTT，必须确认 EMQX 与 `myems_mqtt` 的镜像版本、配置和 `.env` 一致。

#### E 类：数据库与配置发布

适用范围：

1. `.env` 配置变更
2. 数据库结构变更
3. 连接参数、时区、端口、外部接口凭证变更

发布要求：

1. 必须提前备份。
2. 必须确认受影响服务的预构建镜像、镜像标签和 `docker-images.env` 已准备完成。
3. 必须准备回滚方案。

### 7.2 发布时间窗口

推荐窗口：

1. 常规发布：工作日 19:00 以后。
2. 高风险发布：22:00 以后，并安排值守。
3. 禁止窗口：工作日高峰、月底结算、重点保障时段。

## 8. 停机与恢复总体策略

### 8.1 总体原则

1. 不建议默认全栈停机发布。
2. 采集链路必须最后停、最先恢复。
3. 能通过重启完成的，不做全量重建。
4. 涉及配置构建变更时，优先缩小重建范围。
5. 若发布窗口超出预估，优先考虑回滚而不是持续延长停机。

### 8.2 推荐发布顺序

1. `web`
2. `admin`
3. `api`
4. `cleaning`
5. `normalization`
6. `aggregation`
7. `emqx`
8. `myems_mqtt`
9. `modbus_tcp`

### 8.3 推荐恢复顺序

1. MySQL
2. `api`
3. `web`
4. `admin`
5. `emqx`
6. `myems_mqtt`
7. `modbus_tcp`
8. `cleaning`
9. `normalization`
10. `aggregation`

### 8.4 预构建镜像发布策略

适用：生产环境使用 Docker Compose 启动，但不希望在生产机现场执行长时间镜像构建。

原则：

1. 在独立构建机、CI 或预发环境中提前异步构建镜像。
2. 构建完成后推送到企业镜像仓库，或导出离线镜像包。
3. 生产机只执行 `docker compose pull` 或 `docker load`，再执行 `docker compose up -d --no-build`。
4. 低内存生产环境不应在发布窗口现场构建镜像。
5. 如遇镜像仓库不可用，应使用离线镜像包而不是切回现场构建。

推荐流程：

1. 在构建环境打包 `api`、`admin`、`web`、`aggregation`、`cleaning`、`normalization`、`modbus_tcp`、`myems_mqtt` 镜像。
2. 为 `emqx` 明确固定镜像标签，或构建并推送自定义 EMQX 镜像。
3. 将镜像标签写入 `others/docker-images.env`，由生产模板 `others/docker-compose-on-linux.image.yml` 使用。
4. 若生产网段不能访问镜像仓库，额外输出离线镜像包，例如 `docker save -o myems-images-<release>.tar ...`。
5. 生产发布时执行 `docker compose --env-file docker-images.env -f docker-compose-on-linux.image.yml pull`，或先 `docker load` 再 `up -d --no-build`。

### 8.5 当前仓库 GitHub Actions 规则说明

当前仓库已存在工作流：

`/.github/workflows/prebuild-images.yml`

该工作流的实际行为为：

1. 支持手动触发 `workflow_dispatch`。
2. 也会在推送 tag 且 tag 名匹配 `v*` 或 `release-*` 时自动触发。
3. 默认镜像前缀为 `ghcr.io/<repository_owner_lower>/myems`。
4. 对当前仓库 owner `tian0605` 来说，默认镜像前缀即：`ghcr.io/tian0605/myems`。
5. 工作流会构建并推送以下镜像：`api`、`aggregation`、`cleaning`、`modbus-tcp`、`mqtt`、`normalization`、`admin`、`web`。
6. 工作流不会构建 EMQX 镜像，只会把 `emqx_image` 输入值写入 `docker-images.env`。
7. 若不显式传入 `emqx_image`，当前默认值是 `emqx/emqx:latest`。

执行要求：

1. 生产发布时不要依赖 `emqx/emqx:latest`，必须在触发 Actions 时显式指定固定版本，例如 `emqx/emqx:5.8.6`。
2. 生产发布优先使用 tag 触发，而不是直接依赖 SHA 默认 tag。
3. 推荐统一使用 release tag，例如 `v2026.05.08-prod.1`。

产物命名规则：

1. Actions artifact 名称为 `prebuild-metadata-<release_tag>`。
2. artifact 内包含：`docker-images.env` 与 `image-manifest.txt`。
3. `image-manifest.txt` 会记录每个镜像的完整引用，可直接作为发布核对单使用。

## 9. 外部计量数据接口专项策略

### 9.1 Modbus TCP 接口

特性：

1. 当前实现为实时轮询采集。
2. 停机窗口内默认不会自动补采。
3. 若现场设备不支持历史回读，则停机时段即潜在数据盲区。

发布要求：

1. 非必要不重启 `modbus_tcp`。
2. 若必须停机，必须记录停机开始时间、停机结束时间、关键点位最新采集时间。
3. 恢复后必须核对最新时间戳是否继续前进。

### 9.2 第三方 HTTP/API 接口

处理原则：

1. 如果对方支持补推、补拉、重放，则在恢复后执行补传和对账。
2. 如果对方不支持补传，则必须要求对方在发布窗口内暂停推送，或由本方提供缓冲机制。
3. 如果双方都不支持补传，则不允许执行长时间停机发布。

## 10. 标准发布 SOP

### 10.1 发布前 SOP

目的：

在正式执行前确认环境健康、窗口合规、镜像产物可用、回滚可用、外部接口已协调。

前提：

1. 发布说明、数据库脚本、镜像标签、回滚方案已准备完成。
2. 关键责任人已到位。
3. 发布通知已发送。

步骤：

1. 确认发布时间在批准窗口内。
2. 确认本次属于 A/B/C/D/E 哪一类发布。
3. 确认是否涉及 `modbus_tcp`、`emqx`、`myems_mqtt` 或外部接口。
4. 记录当前 Git 提交号。
5. 确认本次目标版本对应的 Git tag 或 release tag。
6. 记录容器状态、关键日志、关键时间戳。
7. 备份数据库或相关配置。
8. 确认 `.github/workflows/prebuild-images.yml` 已在远程仓库可见且本次需要的镜像都已预构建完成。
9. 从 Actions artifact 下载 `docker-images.env` 与 `image-manifest.txt`，或用 `scripts/render-docker-images-env.sh` 重新生成。
10. 预演回滚命令。

验证：

1. `docker compose ps` 状态正常。
2. Web、Admin、API 当前可访问。
3. 数据库连接正常。
4. 若涉及采集链路，最新采集时间在正常推进。
5. 若涉及 MQTT 链路，`emqx` Dashboard 与 `myems_mqtt` 最近日志无持续异常。
6. 目标镜像在 GHCR 或目标镜像仓库中可见。
7. `docker-images.env` 中的镜像标签与本次 release tag 一致。

失败处理：

1. 若基线环境已异常，禁止继续发布。
2. 若回滚方案未准备，禁止继续发布。
3. 若镜像产物未准备完成，禁止进入生产发布。

### 10.2 CI 预构建 SOP

目的：

在生产窗口前完成镜像构建、推送与标签文件生成，避免生产机现场构建。

前提：

1. 代码已合并到发布分支或主干。
2. 已确认本次 release tag。
3. 仓库 `Actions` 权限允许 `Read and write permissions`。

步骤：

1. 打发布 tag，例如 `v6.3.6-prod`，或手动触发 `Prebuild Release Images` 工作流。
2. 等待工作流完成 `prepare`、`build`、`package-metadata` 三个阶段。
3. 在 Packages 页面确认 `api`、`aggregation`、`cleaning`、`modbus-tcp`、`mqtt`、`normalization`、`admin`、`web` 镜像都已生成。
4. 下载 artifact：`prebuild-metadata-<release_tag>`，并解压得到 `docker-images.env` 与 `image-manifest.txt`。
5. 核对 `docker-images.env` 中的镜像前缀、release tag、EMQX 镜像是否正确。
6. 若本次通过 `workflow_dispatch` 触发，务必填写 `emqx_image`，不要让生产环境落到 `emqx/emqx:latest`。
7. 在网络较好的验证机或预发机执行至少一轮 `web`、`admin` 在线拉取验证。

验证：

1. Actions 工作流状态为成功。
2. `docker-images.env` 已生成且与 release tag 一致。
3. 至少一个验证环境已完成 `web` 和 `admin` 的 `HTTP 200` 检查。
4. `image-manifest.txt` 中各镜像引用与计划上线版本一致。

失败处理：

1. 若单个镜像构建失败，修复后重新触发工作流。
2. 若 artifact 与镜像标签不一致，禁止进入生产发布。

### 10.3 生产发布路径选择 SOP

目的：

根据生产机资源和网络状况，在“在线拉取”与“离线镜像包”之间选择正确路径。

决策原则：

1. 若生产机到 GHCR 或企业镜像仓库下载稳定且发布窗口宽裕，可使用在线拉取。
2. 若生产机低内存、低带宽、下载极慢，默认使用离线镜像包。
3. 不得因在线拉取过慢而临时切回生产机现场 `build`。

推荐结论：

1. GitHub Actions 负责预构建和生成 `docker-images.env`。
2. 正式生产发布优先使用离线镜像包。
3. 在线拉取主要用于预发验证、轻量服务验证或临时应急。

### 10.4 生产发布执行 SOP

目的：

按最小影响原则执行镜像上线，并把停机时间控制在可接受范围内。

步骤：

1. 将本次发布使用的 `docker-images.env` 放入生产机 `others/` 目录。
2. 若走在线拉取，先执行分批 `pull`。
3. 若走离线镜像包，先执行 `docker load`，确认本地镜像标签存在。
4. 按顺序分批上线：`web` -> `admin` -> `api` -> `cleaning normalization aggregation` -> `emqx myems_mqtt` -> `modbus_tcp`。
5. 每一批启动后立即执行状态、日志和 HTTP 检查，不要一次性重启全部服务。
6. 若本次只涉及 `api`、`admin`、`web` 和数据库脚本，禁止顺带重启 `modbus_tcp`。
7. 若涉及 `emqx`、`myems_mqtt` 或 `modbus_tcp`，必须记录停机前后的采集时间戳。

### 10.4.1 GitHub Actions 驱动的标准发布路径

适用：

1. 代码已经合并或已确认当前分支提交可发布。
2. 镜像构建在 GitHub Actions 完成。
3. 生产机只负责拉取或装载镜像并重启服务。

推荐路径：

1. 先把业务代码推送到远端分支。
2. 再创建并推送 release tag。
3. 等待 `Prebuild Release Images` 完成。
4. 下载 `prebuild-metadata-<release_tag>` artifact。
5. 将 artifact 中的 `docker-images.env` 放到生产机 `others/` 目录。
6. 按影响范围分批在生产机执行 `pull` / `up -d --no-build`。

不推荐路径：

1. 直接在生产机现场 build。
2. 使用未固定版本的 EMQX 镜像。
3. 在镜像尚未完成推送时提前执行生产升级。

验证：

1. 每一批服务 `up -d --no-build` 后状态正常。
2. `web` 返回 `HTTP 200`。
3. `admin` 返回 `HTTP 200`。
4. `api` `/version` 或健康接口可访问。

失败处理：

1. 若单批失败，先回滚当前批次，不扩大影响范围。
2. 若停机时长超出预设上限，立即停止后续批次并启动回滚。

### 10.5 发布后 SOP

目的：

确认服务恢复、采集恢复、报表恢复和数据完整性。

步骤：

1. 检查容器状态。
2. 检查 Web、Admin、API 可用性。
3. 检查 `modbus_tcp` 是否恢复采集。
4. 检查 `emqx` 与 `myems_mqtt` 是否恢复正常。
5. 检查 `cleaning`、`normalization`、`aggregation` 是否恢复运行。
6. 检查关键时间戳、关键点位、关键报表。
7. 完成数据对账记录。

验证：

1. 全部容器状态正常。
2. 登录与主要页面访问正常。
3. 采集时间继续推进。
4. MQTT Dashboard 与入库日志正常。
5. 归一化、聚合恢复追平。

失败处理：

1. 若用户访问异常，优先恢复 API 与前端。
2. 若采集未恢复，立即进入应急恢复流程。

## 11. 发布前检查表

执行方式：发布前逐项勾选，不得口头替代。

| 序号 | 检查项 | 结果 | 备注 |
| --- | --- | --- | --- |
| 1 | 发布时间在批准窗口内 | [ ] | |
| 2 | 已识别本次发布分级 | [ ] | |
| 3 | 已确认是否涉及采集链路 | [ ] | |
| 4 | 当前 `docker compose ps` 正常 | [ ] | |
| 5 | MySQL 运行正常 | [ ] | |
| 6 | Web 当前可访问 | [ ] | |
| 7 | Admin 当前可访问 | [ ] | |
| 8 | API 当前可访问 | [ ] | |
| 9 | 关键日志无持续性异常 | [ ] | |
| 10 | 已备份相关数据库/配置 | [ ] | |
| 11 | 已确认回滚版本可用 | [ ] | |
| 12 | 已通知相关业务与值班人员 | [ ] | |
| 13 | 若涉及外部接口，已完成窗口协调 | [ ] | |
| 14 | 若涉及采集链路，已记录最新采集时间 | [ ] | |
| 15 | 若涉及 MQTT，已确认 `myems-mqtt/.env`、Broker 配置和镜像标签 | [ ] | |
| 16 | 若走预构建方案，目标镜像已在仓库可拉取 | [ ] | |
| 17 | 已从 Actions 下载 `docker-images.env` 与 `image-manifest.txt` | [ ] | |
| 18 | 已确认在线拉取或离线镜像包发布路径 | [ ] | |
| 19 | 若走离线方案，镜像 tar 包已生成并可校验 | [ ] | |
| 20 | 若走在线方案，已在验证机完成 `web`、`admin` 拉取与访问检查 | [ ] | |

## 12. 发布操作命令清单

以下命令均在当前生产目录下执行，且默认使用纯镜像模板：

```bash
cd /home/ubuntu/myems-complete/others
# 把本次发布的 docker-images.env 放到当前目录
```

### 12.1 生成或刷新镜像标签文件

适用：需要根据 release tag 重建 `docker-images.env`，或验证 artifact 内容。

```bash
cd /home/ubuntu/myems-complete
bash scripts/render-docker-images-env.sh \
  v6.3.6-prod \
  ghcr.io/tian0605/myems \
  emqx/emqx:5.8.6 \
  others/docker-images.env

sed -n '1,20p' others/docker-images.env
```

### 12.1.1 推送分支并创建发布 tag

适用：当前版本已经在本地通过验收，需要推送远端并触发 GitHub Actions 预构建。

```bash
cd d:/VSCode/myems_development_enterprise-isolation-v2

# 1. 推送当前功能分支
git push origin feature/enterprise-isolation-v3

# 2. 创建发布 tag，建议使用带日期和序号的 tag
git tag v2026.05.08-prod.1

# 3. 推送 tag，自动触发 Prebuild Release Images
git push origin v2026.05.08-prod.1
```

说明：

1. 若 tag 推送后 Actions 自动触发，则无需手动再点一次 workflow。
2. 若希望手动指定 `emqx_image`，可不先推 tag，而是到 GitHub Actions 页面用 `workflow_dispatch` 触发，并填写：
  - `release_tag`: `v2026.05.08-prod.1`
  - `registry_prefix`: `ghcr.io/tian0605/myems`
  - `emqx_image`: `emqx/emqx:5.8.6`
3. 若选择手动触发，仍建议最终补一个同名 tag 以便版本追踪。

### 12.1.2 下载并核对 Actions artifact

```bash
# 在 GitHub Actions 页面下载：prebuild-metadata-v2026.05.08-prod.1
# 解压后应至少看到：
#   docker-images.env
#   image-manifest.txt
```

核对要求：

1. `docker-images.env` 中各镜像 tag 必须都是 `v2026.05.08-prod.1`。
2. `MYEMS_EMQX_IMAGE` 必须是固定版本，例如 `emqx/emqx:5.8.6`。
3. `image-manifest.txt` 中的 registry 前缀必须为 `ghcr.io/tian0605/myems`。

### 12.2 场景一：仅前端发布

适用：仅 `web` 或 `admin` 代码变更。

```bash
cd /home/ubuntu/myems-complete/others
docker compose --env-file docker-images.env -f docker-compose-on-linux.image.yml pull web admin
docker compose --env-file docker-images.env -f docker-compose-on-linux.image.yml up -d --no-build web
docker compose --env-file docker-images.env -f docker-compose-on-linux.image.yml ps web
curl -I --max-time 15 http://127.0.0.1/

docker compose --env-file docker-images.env -f docker-compose-on-linux.image.yml up -d --no-build admin
docker compose --env-file docker-images.env -f docker-compose-on-linux.image.yml ps admin
curl -I --max-time 15 http://127.0.0.1:8001/
```

### 12.3 场景二：API 与后台服务发布

适用：`api`、`cleaning`、`normalization`、`aggregation` 变更，不涉及采集链路。

```bash
cd /home/ubuntu/myems-complete/others
docker compose --env-file docker-images.env -f docker-compose-on-linux.image.yml pull api cleaning normalization aggregation
docker compose --env-file docker-images.env -f docker-compose-on-linux.image.yml up -d --no-build api
docker compose --env-file docker-images.env -f docker-compose-on-linux.image.yml ps api
curl -i --max-time 15 http://127.0.0.1:8000/version | sed -n '1,20p'

docker compose --env-file docker-images.env -f docker-compose-on-linux.image.yml up -d --no-build cleaning normalization aggregation
docker compose --env-file docker-images.env -f docker-compose-on-linux.image.yml ps cleaning normalization aggregation
```

### 12.4 场景三：MQTT 链路发布

适用：`emqx`、`myems_mqtt`、MQTT Topic/数据源/点位接入逻辑变更。

```bash
cd /home/ubuntu/myems-complete/others

# 1. 检查发布前日志
docker compose --env-file docker-images.env -f docker-compose-on-linux.image.yml logs -t --since=10m emqx
docker compose --env-file docker-images.env -f docker-compose-on-linux.image.yml logs -t --since=10m myems_mqtt

# 2. 若使用预构建镜像，先拉取
docker compose --env-file docker-images.env -f docker-compose-on-linux.image.yml pull emqx myems_mqtt

# 3. 重新部署 MQTT 链路
docker compose --env-file docker-images.env -f docker-compose-on-linux.image.yml up -d --no-build emqx myems_mqtt

# 4. 检查状态
docker compose --env-file docker-images.env -f docker-compose-on-linux.image.yml ps emqx myems_mqtt
docker compose --env-file docker-images.env -f docker-compose-on-linux.image.yml logs -t --since=5m emqx
docker compose --env-file docker-images.env -f docker-compose-on-linux.image.yml logs -t --since=5m myems_mqtt
```

### 12.5 场景四：配置变更但仍使用预构建镜像

适用：`.env`、`nginx.conf`、EMQX 参数、镜像标签变更，且新镜像已提前构建完成。

```bash
cd /home/ubuntu/myems-complete/others
docker compose --env-file docker-images.env -f docker-compose-on-linux.image.yml pull api admin web cleaning normalization aggregation emqx myems_mqtt modbus_tcp
docker compose --env-file docker-images.env -f docker-compose-on-linux.image.yml up -d --no-build api admin web cleaning normalization aggregation emqx myems_mqtt modbus_tcp
docker compose --env-file docker-images.env -f docker-compose-on-linux.image.yml ps
```

警告：该命令影响范围大，执行前必须确认本次是否真的需要重启全部服务。

### 12.6 场景五：采集链路发布

适用：`modbus_tcp`、点位采集逻辑、外部计量接入逻辑变更。

```bash
cd /home/ubuntu/myems-complete/others

# 1. 发布前记录最新日志
docker compose --env-file docker-images.env -f docker-compose-on-linux.image.yml logs -t --since=10m modbus_tcp

# 2. 拉取并恢复采集服务
docker compose --env-file docker-images.env -f docker-compose-on-linux.image.yml pull modbus_tcp
docker compose --env-file docker-images.env -f docker-compose-on-linux.image.yml up -d --no-build modbus_tcp

# 3. 发布后检查最新日志
docker compose --env-file docker-images.env -f docker-compose-on-linux.image.yml logs -t --since=5m modbus_tcp

# 4. 查看容器状态
docker compose --env-file docker-images.env -f docker-compose-on-linux.image.yml ps modbus_tcp
```

### 12.7 场景六：离线镜像包交付

适用：生产机下载外网镜像缓慢、发布窗口有限、低内存生产环境。

在网络较好的中转机或验证机执行：

优先使用仓库内脚本自动打包当前发布范围：

```bash
cd /home/ubuntu/myems-complete
bash scripts/package-release-offline-images.sh \
  v2026.05.08-prod.1 \
  ghcr.io/tian0605/myems \
  /home/ubuntu/offline-packages \
  emqx/emqx:latest
```

说明：

1. 该脚本会拉取当前发布范围镜像：`web`、`admin`、`api`、`aggregation`、`cleaning`、`normalization`。
2. 该脚本会同时生成离线 tar 包、manifest 和 `docker-images.env`。
3. 若本次发布不涉及 MQTT 或采集链路，仍然不要顺带打包或重启 `emqx`、`myems_mqtt`、`modbus_tcp`。

若需要手工打包，仍可执行以下命令：

```bash
docker login ghcr.io -u <github-user>

docker pull ghcr.io/tian0605/myems/web:v6.3.6-prod
docker pull ghcr.io/tian0605/myems/admin:v6.3.6-prod
docker pull ghcr.io/tian0605/myems/api:v6.3.6-prod
docker pull ghcr.io/tian0605/myems/aggregation:v6.3.6-prod
docker pull ghcr.io/tian0605/myems/cleaning:v6.3.6-prod
docker pull ghcr.io/tian0605/myems/normalization:v6.3.6-prod
docker pull ghcr.io/tian0605/myems/modbus-tcp:v6.3.6-prod
docker pull ghcr.io/tian0605/myems/mqtt:v6.3.6-prod
docker pull emqx/emqx:5.8.6

docker save -o myems-v6.3.6-prod-images.tar \
  ghcr.io/tian0605/myems/web:v6.3.6-prod \
  ghcr.io/tian0605/myems/admin:v6.3.6-prod \
  ghcr.io/tian0605/myems/api:v6.3.6-prod \
  ghcr.io/tian0605/myems/aggregation:v6.3.6-prod \
  ghcr.io/tian0605/myems/cleaning:v6.3.6-prod \
  ghcr.io/tian0605/myems/normalization:v6.3.6-prod \
  ghcr.io/tian0605/myems/modbus-tcp:v6.3.6-prod \
  ghcr.io/tian0605/myems/mqtt:v6.3.6-prod \
  emqx/emqx:5.8.6

gzip -1 myems-v6.3.6-prod-images.tar
```

在生产机执行：

```bash
cd /home/ubuntu
gunzip -f myems-v6.3.6-prod-images.tar.gz
docker load -i myems-v6.3.6-prod-images.tar

cd /home/ubuntu/myems-complete/others
docker compose --env-file docker-images.env -f docker-compose-on-linux.image.yml up -d --no-build web
docker compose --env-file docker-images.env -f docker-compose-on-linux.image.yml up -d --no-build admin
docker compose --env-file docker-images.env -f docker-compose-on-linux.image.yml up -d --no-build api
docker compose --env-file docker-images.env -f docker-compose-on-linux.image.yml up -d --no-build cleaning normalization aggregation
```

### 12.7.1 当前版本推荐上线命令模板

适用：本次版本以当前已验收提交发布，release tag 假定为 `v2026.05.08-prod.1`。

生产机上线前准备：

1. 从 GitHub Actions 下载 `prebuild-metadata-v2026.05.08-prod.1`。
2. 将其中的 `docker-images.env` 上传到生产机：`/home/ubuntu/myems-complete/others/docker-images.env`。
3. 确认生产机可访问 GHCR，或提前准备离线镜像包。

若生产机可在线拉取，执行：

```bash
cd /home/ubuntu/myems-complete/others

# 1. 先升级前端
docker compose --env-file docker-images.env -f docker-compose-on-linux.image.yml pull web admin
docker compose --env-file docker-images.env -f docker-compose-on-linux.image.yml up -d --no-build web admin
docker compose --env-file docker-images.env -f docker-compose-on-linux.image.yml ps web admin
curl -I --max-time 15 http://127.0.0.1/
curl -I --max-time 15 http://127.0.0.1:8001/

# 2. 再升级 API
docker compose --env-file docker-images.env -f docker-compose-on-linux.image.yml pull api
docker compose --env-file docker-images.env -f docker-compose-on-linux.image.yml up -d --no-build api
docker compose --env-file docker-images.env -f docker-compose-on-linux.image.yml ps api
curl -i --max-time 15 http://127.0.0.1:8000/version | sed -n '1,20p'

# 3. 最后升级后台计算服务
docker compose --env-file docker-images.env -f docker-compose-on-linux.image.yml pull cleaning normalization aggregation
docker compose --env-file docker-images.env -f docker-compose-on-linux.image.yml up -d --no-build cleaning normalization aggregation
docker compose --env-file docker-images.env -f docker-compose-on-linux.image.yml ps cleaning normalization aggregation
```

若本次不涉及 MQTT 或采集链路：

1. 不要重启 `emqx`。
2. 不要重启 `myems_mqtt`。
3. 不要重启 `modbus_tcp`。

若需要补发离线包到生产机，执行：

```bash
cd /home/ubuntu
docker load -i myems-v2026.05.08-prod.1-offline-images.tar

cd /home/ubuntu/myems-complete/others
docker compose --env-file docker-images.env -f docker-compose-on-linux.image.yml up -d --no-build web admin api cleaning normalization aggregation
docker compose --env-file docker-images.env -f docker-compose-on-linux.image.yml ps
```

### 12.8 场景七：全栈紧急维护

适用：重大配置变更、全栈重建、紧急恢复。

```bash
cd /home/ubuntu/myems-complete/others
docker compose --env-file docker-images.env -f docker-compose-on-linux.image.yml pull
docker compose --env-file docker-images.env -f docker-compose-on-linux.image.yml up -d --no-build
docker compose --env-file docker-images.env -f docker-compose-on-linux.image.yml ps
```

警告：

1. 此方案风险最高。
2. 默认不作为常规发布方式。
3. 若涉及 `modbus_tcp`、`emqx` 或 `myems_mqtt`，必须执行停机前后数据时点核对。

### 12.9 场景八：审批后现场重建

适用：镜像产物损坏且离线包不可用，或必须在预发/应急环境现场验证 Dockerfile 变更。

```bash
cd /home/ubuntu/myems-complete/others
sudo docker compose -f docker-compose-on-linux.yml up -d --build <service-name>
sudo docker compose -f docker-compose-on-linux.yml ps
```

若本次已经审批允许在生产机现场构建，且生产机内存紧张，应优先按“先停高内存后台服务，再逐个重建目标服务”的方式执行，而不是直接全量 `up -d --build`。

适用范围：

1. 本次主要变更服务为 `api`、`admin`、`web`。
2. 不涉及 `modbus_tcp`、`emqx`、`myems_mqtt`。
3. 已明确这是一次例外的现场构建发布。

推荐命令：

```bash
cd /home/ubuntu/myems-complete/others
chmod +x build-on-production-low-memory.sh
sudo ./build-on-production-low-memory.sh api admin web
```

脚本行为：

1. 先停止 `aggregation`、`cleaning`、`normalization` 以释放内存。
2. 逐个停止并重建 `api`、`admin`、`web`，避免并发 build 占满内存。
3. 每个服务启动后立即执行 `ps`、最近日志和 HTTP 检查。
4. 构建完成后恢复 `aggregation`、`cleaning`、`normalization`。
5. 默认拒绝操作 `modbus_tcp`、`emqx`、`myems_mqtt`。

限制：

1. 低内存生产环境默认禁止使用。
2. 必须经运维负责人审批。
3. 仅允许对受影响服务做最小范围重建。
4. 若本次涉及采集链路，不能直接复用该脚本，必须单独设计停机与恢复顺序。

## 13. 发布后验证命令清单

### 13.1 容器状态检查

```bash
cd /home/ubuntu/myems-complete/others
docker compose --env-file docker-images.env -f docker-compose-on-linux.image.yml ps
```

### 13.2 关键日志检查

```bash
cd /home/ubuntu/myems-complete/others
docker compose --env-file docker-images.env -f docker-compose-on-linux.image.yml logs -t --since=10m api
docker compose --env-file docker-images.env -f docker-compose-on-linux.image.yml logs -t --since=10m web
docker compose --env-file docker-images.env -f docker-compose-on-linux.image.yml logs -t --since=10m admin
docker compose --env-file docker-images.env -f docker-compose-on-linux.image.yml logs -t --since=10m cleaning
docker compose --env-file docker-images.env -f docker-compose-on-linux.image.yml logs -t --since=10m normalization
docker compose --env-file docker-images.env -f docker-compose-on-linux.image.yml logs -t --since=10m aggregation
docker compose --env-file docker-images.env -f docker-compose-on-linux.image.yml logs -t --since=10m emqx
docker compose --env-file docker-images.env -f docker-compose-on-linux.image.yml logs -t --since=10m myems_mqtt
docker compose --env-file docker-images.env -f docker-compose-on-linux.image.yml logs -t --since=10m modbus_tcp
```

### 13.3 前后台连通性检查

```bash
curl -I http://127.0.0.1/
curl -I http://127.0.0.1:8001/
curl -i http://127.0.0.1:8000/ | sed -n '1,20p'
```

### 13.4 API 登录验证

```bash
curl -sS -X PUT http://127.0.0.1:8000/users/login \
  -H 'Content-Type: application/json' \
  -d '{"data":{"account":"REPLACE_ADMIN_ACCOUNT","password":"REPLACE_ADMIN_PASSWORD"}}'
```

说明：

1. 生产账号密码不得写死在仓库中。
2. 应从密码库中读取后执行验证。

### 13.5 数据库可达性检查

```bash
mysql -h 127.0.0.1 -u root -p -e 'SELECT VERSION();'
```

### 13.6 采集恢复检查

```bash
cd /home/ubuntu/myems-complete/others
docker compose --env-file docker-images.env -f docker-compose-on-linux.image.yml logs -t --since=5m modbus_tcp
```

检查目标：

1. 不应持续出现数据库连接拒绝。
2. 不应持续出现网关不可用异常。
3. 若仍出现 `Data Source Not Found`，需核查后台配置是否完整。

### 13.7 MQTT 链路恢复检查

```bash
cd /home/ubuntu/myems-complete/others
docker compose --env-file docker-images.env -f docker-compose-on-linux.image.yml logs -t --since=5m emqx
docker compose --env-file docker-images.env -f docker-compose-on-linux.image.yml logs -t --since=5m myems_mqtt
```

检查目标：

1. `emqx` 不应持续出现监听失败、认证失败或集群异常。
2. `myems_mqtt` 不应持续出现数据库连接失败、订阅失败或 Topic 解析异常。
3. 若 MQTT 数据未继续入库，需核查 Broker 连通性、数据源配置、Topic 映射和 `.env` 中的连接参数。

## 14. 回滚操作模板

### 14.1 回滚触发条件

1. API 无法启动或无法登录。
2. Web 或 Admin 无法访问。
3. `modbus_tcp` 无法恢复采集。
4. `emqx` 或 `myems_mqtt` 无法恢复，导致 MQTT 数据持续无法入库。
5. 外部接口恢复失败且无法在窗口内修复。
6. 发布窗口超时，继续操作风险高于回滚风险。

### 14.2 应用回滚模板

前提：

必须已保存上一个可用版本代码或镜像版本。

模板：

```bash
# 1. 切换到上一版本代码或镜像标签
cd /home/ubuntu/myems-complete
# 按实际版本管理方式执行，例如 git checkout <last-good-commit>

# 2. 回到运行目录重新部署
cd /home/ubuntu/myems-complete/others
sudo docker compose --env-file docker-images.env -f docker-compose-on-linux.image.yml pull
sudo docker compose --env-file docker-images.env -f docker-compose-on-linux.image.yml up -d --no-build

# 3. 验证恢复情况
sudo docker compose --env-file docker-images.env -f docker-compose-on-linux.image.yml ps
```

若生产环境采用预构建镜像发布，回滚应优先切回上一个镜像标签并执行：

```bash
cd /home/ubuntu/myems-complete/others
sudo docker compose --env-file docker-images.env -f docker-compose-on-linux.image.yml pull
sudo docker compose --env-file docker-images.env -f docker-compose-on-linux.image.yml up -d --no-build
sudo docker compose --env-file docker-images.env -f docker-compose-on-linux.image.yml ps
```

### 14.3 配置回滚模板

适用：

1. `.env` 配置变更
2. `nginx.conf` 变更
3. Dockerfile 或依赖变更
4. EMQX 或 `myems_mqtt` 配置变更

模板：

```bash
# 1. 恢复配置备份
# 2. 使用已恢复的配置重新部署受影响服务
cd /home/ubuntu/myems-complete/others
sudo docker compose --env-file docker-images.env -f docker-compose-on-linux.image.yml pull api admin web cleaning normalization aggregation emqx myems_mqtt modbus_tcp
sudo docker compose --env-file docker-images.env -f docker-compose-on-linux.image.yml up -d --no-build api admin web cleaning normalization aggregation emqx myems_mqtt modbus_tcp

# 3. 验证服务状态
sudo docker compose --env-file docker-images.env -f docker-compose-on-linux.image.yml ps
```

### 14.4 数据库高风险变更回退说明

原则：

1. 数据库结构变更必须单独备份。
2. 若无验证通过的回退脚本，不得在常规发布窗口中直接执行高风险结构变更。
3. 数据库回退必须由数据库负责人确认后执行。

## 15. 数据对账模板

### 15.1 发布后数据对账表

| 项目 | 内容 |
| --- | --- |
| 发布编号 | |
| 发布日期 | |
| 发布开始时间 | |
| 发布结束时间 | |
| 停机开始时间 | |
| 停机结束时间 | |
| 影响服务 | |
| 是否涉及采集链路 | 是 / 否 |
| 是否涉及 MQTT 链路 | 是 / 否 |
| 是否涉及第三方接口 | 是 / 否 |
| 是否支持补传 | 是 / 否 |
| 对账责任人 | |
| 复核人 | |

### 15.2 关键点位对账表

| 数据源/接口 | 关键点位 | 停机前最新时间 | 停机后最新时间 | 停机前数值 | 停机后数值 | 是否连续 | 是否补传 | 处理结论 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  |  |  |  |
|  |  |  |  |  |  |  |  |  |

### 15.3 报表与聚合结果对账表

| 检查项 | 检查时间 | 结果 | 说明 |
| --- | --- | --- | --- |
| 前台首页可访问 |  | 正常 / 异常 |  |
| 后台首页可访问 |  | 正常 / 异常 |  |
| API 登录正常 |  | 正常 / 异常 |  |
| 采集时间继续推进 |  | 正常 / 异常 |  |
| MQTT Dashboard 正常 |  | 正常 / 异常 |  |
| MQTT 入库日志正常 |  | 正常 / 异常 |  |
| 归一化结果继续更新 |  | 正常 / 异常 |  |
| 聚合结果继续更新 |  | 正常 / 异常 |  |
| 关键报表无明显跳变 |  | 正常 / 异常 |  |

## 16. 常见告警与处理建议

### 16.1 `modbus_tcp` 停机风险告警

告警：

`modbus_tcp` 停机期间，实时轮询数据默认不可自动补采。若设备侧没有历史回读能力，则该时段存在永久性数据盲区风险。

处理建议：

1. 缩短停机时间。
2. 记录停机前后关键时间点。
3. 恢复后立即核对采集连续性。

### 16.2 API 发布风险告警

告警：

API 发布会直接影响前后台可用性和第三方接口调用，应避免与采集链路高风险变更同时执行。

处理建议：

1. API 发布与采集发布分开执行。
2. 必须提前通知接口调用方。

### 16.3 MQTT 链路发布风险告警

告警：

`emqx` 或 `myems_mqtt` 发布会直接影响 MQTT 入站与入库。若设备端不支持补发或 Broker 未配置保留/持久会话，停机窗口内可能出现数据丢失。

处理建议：

1. 优先采用预构建镜像，缩短停机时间。
2. 发布前记录关键 Topic 的最新上送时间和 `myems_mqtt` 最近日志。
3. 恢复后立即验证 Broker 监听、订阅成功和数据库落点是否继续推进。

### 16.4 配置变更风险告警

告警：

当前 Compose 结构中，部分配置在构建阶段生效。仅重启容器可能无法应用新配置。

处理建议：

1. 先确认是否必须 rebuild。
2. 尽量缩小重建范围。

## 17. 当前环境执行要求

1. 任何常规发布默认在工作时间后执行。
2. 不涉及采集链路的发布，禁止顺带重启 `modbus_tcp`。
3. 不涉及 MQTT 链路的发布，禁止顺带重启 `emqx` 和 `myems_mqtt`。
4. 涉及外部计量数据接口的变更，必须先定义停机策略和恢复策略，再批准发布。
5. 任何包含数据库结构变更的发布，必须有单独备份和回退方案。
6. 本文档中的命令模板默认由具备 `sudo docker` 权限的运维人员执行。

## 18. 后续建议

建议在正式制度中再补充以下内容：

1. 发布审批人和值班人名单。
2. 发布通知模板。
3. 发布失败升级路径。
4. 数据对账结果归档规范。

## 19. 当前版本发布指引

本节用于指导当前已验收版本从本地仓库发布到 GitHub，并再由 GitHub Actions 进入生产升级。

### 19.1 当前版本源码基线

当前本地已确认提交：

`6b0e93e Refine product dashboard and date-only report behavior`

建议：

1. 先推送当前分支 `feature/enterprise-isolation-v3`。
2. 再创建 release tag `v2026.05.08-prod.1`。
3. 由 Actions 构建镜像并生成 metadata artifact。

### 19.2 当前版本推荐发布分类

本次版本建议按以下发布分级处理：

1. 前端：A 类。
2. API：B 类。
3. 后台计算服务：C 类。
4. 采集链路：本次默认不涉及，不应重启 `modbus_tcp`、`emqx`、`myems_mqtt`。

### 19.3 当前版本推荐生产升级顺序

1. 升级 `web`。
2. 升级 `admin`。
3. 升级 `api`。
4. 升级 `cleaning`、`normalization`、`aggregation`。
5. 完成登录、总览、产量能耗分析、节能分析的页面回归。

### 19.4 当前版本重点验收点

上线后至少回归以下页面：

1. 总览页面：多产品“产量”“产品单位综合能耗”“单位产品二氧化碳排放”卡片显示正常。
2. 节能分析页面：饼图恢复显示，颜色与列表顺序一致。
3. 产量能耗分析页面：详细数据列表在“自由比”和“不比”下均符合预期。
4. 日期查询页面：结束日期已按整日 `23:59:59` 生效。
