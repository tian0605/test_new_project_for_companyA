# 产品碳足迹功能生产升级说明（6.3.8）

## 1. 适用范围

本说明适用于将 MyEMS 从 `6.3.7` 升级到 `6.3.8`，上线以下能力：

1. 产品碳足迹基础数据维护、核算、生命周期明细展示。
2. 产品碳足迹菜单、前端页面、用户端核算页面与 PDF 报告导出。
3. 产品与空间绑定后的数据隔离控制。
4. 产品碳足迹相关数据库对象与菜单初始化。

## 2. 升级前准备

1. 备份 `myems_system_db` 与 `myems_production_db`。
2. 确认生产库当前版本为 `6.3.7`：

```sql
SELECT version, release_date
FROM myems_system_db.tbl_versions
WHERE id = 1;
```

3. 确认本次发布分支代码已经完成验收，并已在当前发布分支完成提交。
4. 确认生产环境具备前端、后台管理、API 与后台计算服务的升级窗口。

## 3. 数据库升级

执行升级脚本：

`database/upgrade/upgrade6.3.8.sql`

该脚本会完成以下内容：

1. 创建产品碳足迹字典表、物料表、核算表、活动表。
2. 初始化默认供应类别字典数据。
3. 初始化产品碳足迹菜单：
   `Product Carbon Footprint`
   `Supply Material Maintenance`
   `Product Carbon Footprint Accounting`
   `Product Carbon Dictionary`
4. 将系统版本更新为 `6.3.8`。

升级完成后，执行以下检查：

```sql
SELECT version, release_date
FROM myems_system_db.tbl_versions
WHERE id = 1;

SELECT id, name, route
FROM myems_system_db.tbl_menus
WHERE id IN (1300, 1301, 1302, 1303)
ORDER BY id;
```

## 4. 应用升级顺序

建议按以下顺序升级：

1. `myems-web`
2. `myems-admin`
3. `myems-api`
4. `myems-cleaning`
5. `myems-normalization`
6. `myems-aggregation`

本次默认不涉及以下链路，不应作为常规升级动作重启：

1. `myems-modbus-tcp`
2. `myems-mqtt`
3. `emqx`

## 5. 升级后验证

### 5.1 菜单与权限

1. 后台管理端可见产品碳足迹相关菜单模板配置。
2. 用户端可见：
   `碳足迹 > 产品碳足迹核算`
3. 空间未绑定产品时，用户端新增核算不应出现无授权产品。

### 5.2 核算功能

1. 年度核算列表可展示“系统边界”。
2. 同一空间下只能看到已绑定产品的核算数据。
3. 生命周期五阶段可正常新增、编辑、删除活动数据。
4. 排放量按 `活动水平 * 因子` 计算。
5. 碳足迹贡献按 `排放量 / 产量` 计算。
6. 总碳足迹等于全部活动“碳足迹贡献”的求和。
7. 阶段占比按各阶段内占比计算。

### 5.3 报告导出

1. 用户端“生成报告”可下载当前核算行对应的 PDF。
2. PDF 内容应包含：
   产品、年份、起止日期、系统边界、产量、功能单位、总碳足迹、各阶段活动明细。
3. PDF 不应包含界面操作按钮。

## 6. 回滚建议

若升级后发现严重问题，按以下顺序回滚：

1. 停止新版本 `web/admin/api` 服务。
2. 回滚应用镜像或代码到升级前版本。
3. 如数据库对象已上线且需完全回退，优先使用升级前数据库备份恢复，而不是手工逐表删除。
4. 恢复完成后重新核验登录、菜单与核心报表页面。

## 7. 推送与发布建议

1. 先将当前分支推送到远程：`feature/enterprise-isolation-v3`。
2. 推送后在 GitHub 发起合并请求或创建发布标签。
3. 由 CI/CD 构建前端、后台管理、API 与后台服务镜像。
4. 生产升级执行时，仍以 `docs/OPERATIONS-RELEASE-RUNBOOK-CN.md` 为总流程主文档，本说明用于补充本次产品碳足迹版本的专项步骤。