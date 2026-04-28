# EMQX 与 myems-mqtt 生产环境初始化指南

## 1. 文档目标

本文档用于指导生产环境首次启用 `EMQX + myems-mqtt + MyEMS` MQTT 入库链路，目标是：

1. 不在生产机现场构建镜像。
2. 让生产机拿到升级包后可以直接 `docker load` 或 `docker compose pull` 并启动。
3. 明确 EMQX、`myems-mqtt`、MyEMS 配置之间的依赖关系和初始化顺序。

适用目录：

`/home/ubuntu/myems-complete`

## 2. 交付物清单

首次上线前，发布包至少应包含以下内容：

1. `others/docker-compose-on-linux.image.yml`
2. `others/docker-images.env`，由 `others/docker-images.env.example` 复制并替换为实际镜像标签
3. `myems-mqtt/.env`，填入生产数据库、网关和 Broker 参数
4. 镜像获取方式二选一：
   - 镜像仓库地址和可拉取标签
   - 离线镜像包，例如 `myems-images-<release>.tar`
5. 点位、数据源、网关初始化清单或导入脚本

## 3. 前置条件

1. 宿主机已安装 Docker Engine 与 Docker Compose 插件。
2. 宿主机可以访问 MySQL，或 MySQL 已部署在本机。
3. 已规划 MQTT 设备接入网络、端口暴露策略和防火墙规则。
4. 已准备生产数据库账号，禁止使用 `root`。
5. 已确认是否通过镜像仓库拉取，还是通过离线镜像包导入。

## 4. 初始化顺序总览

首次初始化建议按以下顺序执行：

1. 准备目录与配置文件。
2. 导入或拉取镜像。
3. 启动 EMQX。
4. 完成 EMQX 首次安全初始化。
5. 在 MyEMS Admin 中创建网关、数据源、点位和绑定关系。
6. 配置 `myems-mqtt/.env`。
7. 启动 `myems_mqtt`。
8. 发布一条测试消息并完成入库核验。

## 5. 宿主机目录准备

```bash
sudo mkdir -p /home/ubuntu/myems-complete/others
sudo mkdir -p /home/ubuntu/myems-complete/myems-mqtt
sudo mkdir -p /myems-emqx/data
sudo mkdir -p /myems-emqx/log
sudo mkdir -p /myems-upload
```

若目录已存在，仅需确认权限和磁盘空间足够。

## 6. 镜像准备

### 6.1 方案一：通过镜像仓库拉取

1. 将 `others/docker-images.env.example` 复制为 `others/docker-images.env`。
2. 将其中的镜像标签替换为本次发布批准版本。
3. 登录镜像仓库。

```bash
cd /home/ubuntu/myems-complete/others
cp docker-images.env.example docker-images.env
sudo docker login <your-registry>
sudo docker compose --env-file docker-images.env -f docker-compose-on-linux.image.yml pull emqx myems_mqtt
```

### 6.2 方案二：通过离线镜像包导入

若生产网段不允许访问镜像仓库，发布包中应提供离线镜像包。

```bash
cd /home/ubuntu/myems-complete
sudo docker load -i myems-images-<release>.tar
cd others
cp docker-images.env.example docker-images.env
```

要求：

1. `docker-images.env` 中的标签必须与离线导入后的镜像标签一致。
2. 离线包应至少包含 `emqx` 与 `myems/mqtt`，若本次全栈升级则同时包含其余服务镜像。

## 7. EMQX 首次启动与初始化

### 7.1 启动 EMQX

```bash
cd /home/ubuntu/myems-complete/others
sudo docker compose --env-file docker-images.env -f docker-compose-on-linux.image.yml up -d --no-build emqx
sudo docker compose --env-file docker-images.env -f docker-compose-on-linux.image.yml ps
sudo docker compose --env-file docker-images.env -f docker-compose-on-linux.image.yml logs -t --since=5m emqx
```

### 7.2 EMQX 初始化检查

初始化时至少完成以下动作：

1. 登录 Dashboard `http://<host>:18083`。
2. 使用当前镜像版本的默认管理账号首次登录后，立即修改默认密码。
3. 关闭匿名接入，改为账号认证、客户端认证或网关白名单策略。
4. 按需限制 Dashboard 访问来源，仅允许运维网段访问。
5. 根据设备量设置连接数、会话、保留消息和离线消息策略。
6. 确认 `1883` 只暴露给可信网络；若需要公网或跨网段访问，优先启用 TLS。

建议最小验收：

1. Dashboard 可正常登录。
2. 非授权客户端不能匿名接入。
3. EMQX 日志无持续告警。

## 8. MyEMS 侧初始化

### 8.1 创建网关

在 MyEMS Admin 中创建或确认一个生产网关，记录以下信息：

1. `gateway_id`
2. `gateway_token`

这两个值稍后用于 `myems-mqtt/.env`。

### 8.2 创建 MQTT 数据源

在 MyEMS Admin 中创建 MQTT 数据源，连接 JSON 建议形态如下：

```json
{
  "host": "emqx",
  "port": 1883,
  "topic": "factory/site-a/energy/#",
  "qos": 1,
  "username": "mqtt_ingest",
  "password": "change-me"
}
```

要求：

1. `topic` 使用生产约定命名，不复用本地测试 `testtopic`。
2. `qos`、认证方式和 Topic 规则需与现场网关一致。
3. 每个生产数据源都要明确归属网关和点位范围。

### 8.3 创建点位与业务绑定

至少完成以下配置：

1. 创建生产点位，不复用本地测试 `10001`。
2. 填写正确的对象类型、单位、统计属性和显示属性。
3. 将点位绑定到实际的传感器、设备、空间或业务对象。
4. 若页面要直接展示，确认对应关系已经在 Admin 中建立。

## 9. myems-mqtt 配置

将 `myems-mqtt/example.env` 复制为 `myems-mqtt/.env`，并替换为生产值。建议重点检查以下字段：

```env
MYEMS_SYSTEM_DB_HOST=<prod-db-host>
MYEMS_SYSTEM_DB_PORT=3306
MYEMS_SYSTEM_DB_DATABASE=myems_system_db
MYEMS_SYSTEM_DB_USER=<service-user>
MYEMS_SYSTEM_DB_PASSWORD=<service-password>

MYEMS_HISTORICAL_DB_HOST=<prod-db-host>
MYEMS_HISTORICAL_DB_PORT=3306
MYEMS_HISTORICAL_DB_DATABASE=myems_historical_db
MYEMS_HISTORICAL_DB_USER=<service-user>
MYEMS_HISTORICAL_DB_PASSWORD=<service-password>

GATEWAY_ID=<gateway-id>
GATEWAY_TOKEN=<gateway-token>
MYEMS_MQTT_LOG_LEVEL=INFO
```

要求：

1. 使用最小权限数据库账号。
2. 不保留本地测试账号、密码、Topic 或点位 ID。
3. `.env` 不提交到仓库，由运维单独保管。

## 10. 启动 myems-mqtt

```bash
cd /home/ubuntu/myems-complete/others
sudo docker compose --env-file docker-images.env -f docker-compose-on-linux.image.yml up -d --no-build myems_mqtt
sudo docker compose --env-file docker-images.env -f docker-compose-on-linux.image.yml ps
sudo docker compose --env-file docker-images.env -f docker-compose-on-linux.image.yml logs -t --since=5m myems_mqtt
```

验收点：

1. `myems_mqtt` 容器正常运行。
2. 日志中已加载目标数据源。
3. 日志中没有持续数据库连接错误或 Topic 订阅错误。

## 11. 联调与验收

### 11.1 发布测试消息

使用现场网关或测试客户端向生产测试 Topic 发布一条可识别消息。

推荐验证字段：

```json
{
  "data_source_id": 20001,
  "point_id": 30001,
  "utc_date_time": "2026-04-28T12:00:00",
  "value": 42.5
}
```

### 11.2 验证 EMQX

1. Dashboard 中可看到客户端连接和消息流量。
2. Topic 命中预期订阅。

### 11.3 验证 myems-mqtt

1. 日志中出现成功入库记录。
2. 没有 point/data_source 不匹配错误。

### 11.4 验证数据库与页面

1. 查询 `myems_historical_db` 最新值表，确认目标点位值已更新。
2. 打开对应 MyEMS 页面，确认最新值与趋势正常显示。

## 12. 运行后建议

1. 将 EMQX Dashboard 密码、MQTT 客户端凭证、数据库账号统一纳入密码库管理。
2. 为 EMQX 和 `myems_mqtt` 配置日志轮转和监控告警。
3. 每次升级只更换镜像标签，不在生产机执行 `docker compose build`。
4. 升级时优先参考 `docs/OPERATIONS-RELEASE-RUNBOOK-CN.md` 执行标准发布流程。