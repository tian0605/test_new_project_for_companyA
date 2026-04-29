# MyEMS 生产运维与发布手册

## 1. 文档信息

| 项目 | 内容 |
| --- | --- |
| 文档名称 | MyEMS 生产运维与发布手册 |
| 文档版本 | v1.1 |
| 生效日期 | 2026-04-28 |
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

在正式执行前确认环境健康、窗口合规、回滚可用、外部接口已协调。

前提：

1. 发布包、发布说明、回滚方案已准备完成。
2. 关键责任人已到位。
3. 发布通知已发送。

步骤：

1. 确认发布时间在批准窗口内。
2. 确认本次属于 A/B/C/D/E 哪一类发布。
3. 确认是否涉及 `modbus_tcp`、`emqx`、`myems_mqtt` 或外部接口。
4. 记录当前 Git 提交号。
5. 记录容器状态、关键日志、关键时间戳。
6. 备份数据库或相关配置。
7. 预演回滚命令。

验证：

1. `docker compose ps` 状态正常。
2. Web、Admin、API 当前可访问。
3. 数据库连接正常。
4. 若涉及采集链路，最新采集时间在正常推进。
5. 若涉及 MQTT 链路，`emqx` Dashboard 与 `myems_mqtt` 最近日志无持续异常。

失败处理：

1. 若基线环境已异常，禁止继续发布。
2. 若回滚方案未准备，禁止继续发布。

### 10.2 发布中 SOP

目的：

按最小影响原则执行版本上线。

前提：

1. 已完成发布前检查。
2. 已确认具体命令和影响范围。

步骤：

1. 若仅前端发布，优先单独处理 `web` 或 `admin`。
2. 若涉及 API，先处理 `api`，再恢复前端。
3. 若涉及后台计算服务，优先恢复 `api` 后再恢复后台服务。
4. 若涉及采集链路，必须在最后一步短暂停止 `modbus_tcp` 或同步处理 `emqx` / `myems_mqtt`，并在变更完成后第一时间恢复。
5. 若生产已经准备好预构建镜像，优先执行 `pull + up -d --no-build`。
6. 若涉及 `.env` 变更，更新配置后仍应优先使用预构建镜像并执行 `up -d --no-build`，不得把现场构建作为默认方案。

验证：

1. 关键容器重新启动完成。
2. API 可达。
3. 前后台页面可访问。

失败处理：

1. 若单个服务无法恢复，优先回滚该服务。
2. 若停机时长超出预设上限，立即升级处理并评估回滚。

### 10.3 发布后 SOP

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

## 12. 发布操作命令清单

以下命令均在当前生产目录下执行，且默认使用纯镜像模板：

```bash
cd /home/ubuntu/myems-complete/others
cp docker-images.env.example docker-images.env
```

### 12.1 场景一：仅前端发布

适用：仅 `web` 或 `admin` 代码变更。

```bash
cd /home/ubuntu/myems-complete/others
sudo docker compose --env-file docker-images.env -f docker-compose-on-linux.image.yml pull web admin
sudo docker compose --env-file docker-images.env -f docker-compose-on-linux.image.yml up -d --no-build web admin
sudo docker compose --env-file docker-images.env -f docker-compose-on-linux.image.yml ps
```

### 12.2 场景二：API 与后台服务发布

适用：`api`、`cleaning`、`normalization`、`aggregation` 变更，不涉及采集链路。

```bash
cd /home/ubuntu/myems-complete/others
sudo docker compose --env-file docker-images.env -f docker-compose-on-linux.image.yml pull api cleaning normalization aggregation
sudo docker compose --env-file docker-images.env -f docker-compose-on-linux.image.yml up -d --no-build api cleaning normalization aggregation
sudo docker compose --env-file docker-images.env -f docker-compose-on-linux.image.yml ps
```

### 12.3 场景三：MQTT 链路发布

适用：`emqx`、`myems_mqtt`、MQTT Topic/数据源/点位接入逻辑变更。

```bash
cd /home/ubuntu/myems-complete/others

# 1. 检查发布前日志
sudo docker compose --env-file docker-images.env -f docker-compose-on-linux.image.yml logs -t --since=10m emqx
sudo docker compose --env-file docker-images.env -f docker-compose-on-linux.image.yml logs -t --since=10m myems_mqtt

# 2. 若使用预构建镜像，先拉取
sudo docker compose --env-file docker-images.env -f docker-compose-on-linux.image.yml pull emqx myems_mqtt

# 3. 重新部署 MQTT 链路
sudo docker compose --env-file docker-images.env -f docker-compose-on-linux.image.yml up -d --no-build emqx myems_mqtt

# 4. 检查状态
sudo docker compose --env-file docker-images.env -f docker-compose-on-linux.image.yml ps
sudo docker compose --env-file docker-images.env -f docker-compose-on-linux.image.yml logs -t --since=5m emqx
sudo docker compose --env-file docker-images.env -f docker-compose-on-linux.image.yml logs -t --since=5m myems_mqtt
```

### 12.4 场景四：配置变更但仍使用预构建镜像

适用：`.env`、`nginx.conf`、EMQX 参数、镜像标签变更，且新镜像已提前构建完成。

```bash
cd /home/ubuntu/myems-complete/others
sudo docker compose --env-file docker-images.env -f docker-compose-on-linux.image.yml pull api admin web cleaning normalization aggregation emqx myems_mqtt modbus_tcp
sudo docker compose --env-file docker-images.env -f docker-compose-on-linux.image.yml up -d --no-build api admin web cleaning normalization aggregation emqx myems_mqtt modbus_tcp
sudo docker compose --env-file docker-images.env -f docker-compose-on-linux.image.yml ps
```

警告：该命令影响范围大，执行前必须确认本次是否真的需要重启全部服务。

### 12.5 场景五：采集链路发布

适用：`modbus_tcp`、点位采集逻辑、外部计量接入逻辑变更。

```bash
cd /home/ubuntu/myems-complete/others

# 1. 发布前记录最新日志
sudo docker compose --env-file docker-images.env -f docker-compose-on-linux.image.yml logs -t --since=10m modbus_tcp

# 2. 拉取并恢复采集服务
sudo docker compose --env-file docker-images.env -f docker-compose-on-linux.image.yml pull modbus_tcp
sudo docker compose --env-file docker-images.env -f docker-compose-on-linux.image.yml up -d --no-build modbus_tcp

# 3. 发布后检查最新日志
sudo docker compose --env-file docker-images.env -f docker-compose-on-linux.image.yml logs -t --since=5m modbus_tcp

# 4. 查看容器状态
sudo docker compose --env-file docker-images.env -f docker-compose-on-linux.image.yml ps
```

### 12.6 场景六：全栈紧急维护

适用：重大配置变更、全栈重建、紧急恢复。

```bash
cd /home/ubuntu/myems-complete/others
sudo docker compose --env-file docker-images.env -f docker-compose-on-linux.image.yml pull
sudo docker compose --env-file docker-images.env -f docker-compose-on-linux.image.yml up -d --no-build
sudo docker compose --env-file docker-images.env -f docker-compose-on-linux.image.yml ps
```

警告：

1. 此方案风险最高。
2. 默认不作为常规发布方式。
3. 若涉及 `modbus_tcp`、`emqx` 或 `myems_mqtt`，必须执行停机前后数据时点核对。

### 12.7 场景七：审批后现场重建

适用：镜像产物损坏且离线包不可用，或必须在预发/应急环境现场验证 Dockerfile 变更。

```bash
cd /home/ubuntu/myems-complete/others
sudo docker compose -f docker-compose-on-linux.yml up -d --build <service-name>
sudo docker compose -f docker-compose-on-linux.yml ps
```

限制：

1. 低内存生产环境默认禁止使用。
2. 必须经运维负责人审批。
3. 仅允许对受影响服务做最小范围重建。

## 13. 发布后验证命令清单

### 13.1 容器状态检查

```bash
cd /home/ubuntu/myems-complete/others
sudo docker compose -f docker-compose-on-linux.yml ps
```

### 13.2 关键日志检查

```bash
cd /home/ubuntu/myems-complete/others
sudo docker compose -f docker-compose-on-linux.yml logs -t --since=10m api
sudo docker compose -f docker-compose-on-linux.yml logs -t --since=10m web
sudo docker compose -f docker-compose-on-linux.yml logs -t --since=10m admin
sudo docker compose -f docker-compose-on-linux.yml logs -t --since=10m cleaning
sudo docker compose -f docker-compose-on-linux.yml logs -t --since=10m normalization
sudo docker compose -f docker-compose-on-linux.yml logs -t --since=10m aggregation
sudo docker compose -f docker-compose-on-linux.yml logs -t --since=10m emqx
sudo docker compose -f docker-compose-on-linux.yml logs -t --since=10m myems_mqtt
sudo docker compose -f docker-compose-on-linux.yml logs -t --since=10m modbus_tcp
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
sudo docker compose -f docker-compose-on-linux.yml logs -t --since=5m modbus_tcp
```

检查目标：

1. 不应持续出现数据库连接拒绝。
2. 不应持续出现网关不可用异常。
3. 若仍出现 `Data Source Not Found`，需核查后台配置是否完整。

### 13.7 MQTT 链路恢复检查

```bash
cd /home/ubuntu/myems-complete/others
sudo docker compose -f docker-compose-on-linux.yml logs -t --since=5m emqx
sudo docker compose -f docker-compose-on-linux.yml logs -t --since=5m myems_mqtt
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
