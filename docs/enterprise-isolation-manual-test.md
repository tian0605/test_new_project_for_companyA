# 企业隔离改动人工验收用例

## 1. 目标

本用例用于人工验证本轮企业隔离改动是否生效，覆盖以下改动面：

- 用户列表、搜索、详情、编辑、删除、重置密码、解锁、待审批用户审批
- Cost Center 列表与编辑范围
- Space 树、详情、导出、导入、克隆
- Menu 树与菜单详情范围
- Tenant / Store / Shopfloor Dashboard 报表边界

本用例默认在开发环境执行，建议同时打开浏览器开发者工具的 Network 面板，以便观察接口状态码和响应体。

## 2. 测试前准备

### 2.1 账号准备

至少准备以下账号：

- 平台管理员：`platform_admin`
- 企业 A 管理员：`companyA_admin`
- 企业 B 管理员：`companyB_admin`
- 企业 A 普通用户：`companyA_user`
- 企业 B 普通用户：`companyB_user`
- 企业 A 锁定用户：`companyA_locked_user`
- 企业 B 锁定用户：`companyB_locked_user`
- 待审批新用户 1 条：建议至少准备一条属于企业 A 的待审批记录

### 2.2 基础数据准备

至少准备以下对象：

- 企业 A 根空间：`A_Enterprise`
- 企业 A 子空间：`A_Building_1`
- 企业 B 根空间：`B_Enterprise`
- 企业 B 子空间：`B_Building_1`
- 企业 A 成本中心：`CC_A`
- 企业 B 成本中心：`CC_B`
- 企业 A 菜单可见范围数据
- 企业 B 菜单可见范围数据
- 企业 A 下至少 1 个 Tenant、1 个 Store、1 个 Shopfloor，并且有报表数据
- 企业 B 下至少 1 个 Tenant、1 个 Store、1 个 Shopfloor，并且有报表数据

### 2.3 浏览器准备

建议使用 3 个独立浏览器会话：

- 浏览器 1：平台管理员
- 浏览器 2：企业 A 管理员
- 浏览器 3：企业 B 管理员

这样可以避免 Cookie 和 Local Storage 相互污染。

## 3. 页面入口

### 3.1 Admin 端页面

- 用户管理页：`/#/users/user`
- Space 管理页：`/#/settings/space`
- Cost Center 管理页：`/#/settings/costcenter`
- Menu 管理页：`/#/settings/menu`

### 3.2 Web 报表页

- Tenant Dashboard：`/tenant`
- Store Dashboard：`/store`
- Shopfloor Dashboard：`/shopfloor`

如需扩展验证，可继续访问这些子路由：

- Tenant：`/tenant/energycategory`、`/tenant/energyitem`、`/tenant/cost`、`/tenant/bill`、`/tenant/comparison`
- Store：`/store/energycategory`、`/store/energyitem`、`/store/cost`、`/store/comparison`
- Shopfloor：`/shopfloor/energycategory`、`/shopfloor/energyitem`、`/shopfloor/cost`、`/shopfloor/comparison`

## 4. 验收原则

本轮改动的统一验收口径：

- 本企业数据：能看见、能操作、操作成功
- 非本企业数据：前端应无法正常展示或无法完成操作
- 如果通过手工篡改请求访问非本企业对象，接口应优先返回 `404`
- 常见响应描述包括：`API.USER_NOT_FOUND`、`API.SPACE_NOT_FOUND`、`API.COST_CENTER_NOT_FOUND`
- 前端常见表现包括：列表为空、详情加载失败、操作 toaster 提示失败

## 5. 详细测试用例

### TC-01 用户列表范围隔离

- 页面：Admin 端 `/#/users/user`
- 账号：企业 A 管理员
- 前置条件：企业 A、企业 B 都至少有 1 个普通用户
- 操作步骤：
  1. 使用企业 A 管理员登录 Admin
  2. 进入“用户管理 > 用户”页
  3. 观察“用户列表”标签页中的用户数据
- 预期结果：
  - 只能看到企业 A 用户
  - 看不到企业 B 用户
  - 不应出现企业 B 的用户名、邮箱、手机号、权限信息

### TC-02 用户搜索范围隔离

- 页面：Admin 端 `/#/users/user`
- 账号：企业 A 管理员
- 操作步骤：
  1. 在“用户列表”页顶部搜索框输入企业 B 用户名关键字
  2. 等待搜索结果刷新
- 预期结果：
  - 搜索结果为空，或仅返回企业 A 范围内匹配数据
  - 不返回企业 B 用户

### TC-03 用户编辑仅限本企业

- 页面：Admin 端 `/#/users/user`
- 账号：企业 A 管理员
- 操作步骤：
  1. 在企业 A 用户行点击“编辑”
  2. 修改显示名或邮箱并保存
- 预期结果：
  - 保存成功
  - 页面提示更新成功
  - 刷新列表后能看到变更生效

### TC-04 用户删除仅限本企业

- 页面：Admin 端 `/#/users/user`
- 账号：企业 A 管理员
- 操作步骤：
  1. 选择一个企业 A 的测试用户
  2. 点击“删除”并确认
- 预期结果：
  - 删除成功
  - 页面提示删除成功
  - 列表刷新后该用户消失

### TC-05 重置密码仅限本企业

- 页面：Admin 端 `/#/users/user`
- 账号：企业 A 管理员
- 操作步骤：
  1. 在企业 A 用户行点击“重置密码”
  2. 输入新密码并提交
  3. 使用该用户新密码重新登录验证
- 预期结果：
  - 页面提示更新成功
  - 使用新密码可以登录
  - 旧密码失效

### TC-06 解锁仅限本企业

- 页面：Admin 端 `/#/users/user`
- 账号：企业 A 管理员
- 前置条件：企业 A 存在一个被锁定用户，列表中显示“解锁”按钮
- 操作步骤：
  1. 在该锁定用户行点击“解锁”
  2. 确认弹窗
  3. 使用该用户重新登录
- 预期结果：
  - 页面提示解锁成功
  - 用户可重新登录
  - 列表刷新后该用户不再是锁定状态

### TC-07 待审批用户审核写入企业归属

- 页面：Admin 端 `/#/users/user` 的“新用户列表”标签页
- 账号：平台管理员或具备审批权限的管理员
- 操作步骤：
  1. 进入“新用户列表”标签页
  2. 选择 1 条待审批用户记录，点击“审核用户”
  3. 填写管理员属性、权限、过期时间，并明确选择/提交企业归属
  4. 审批完成后切到“用户列表”标签页
- 预期结果：
  - 审批成功
  - 新用户从“新用户列表”消失，出现在“用户列表”中
  - 该用户只会出现在所属企业管理员的用户列表内
  - 不会同时出现在其他企业管理员的列表中

### TC-08 用户跨企业越权验证

- 页面：Admin 端 `/#/users/user` + 浏览器 DevTools Network
- 账号：企业 A 管理员
- 操作步骤：
  1. 先用平台管理员获取一个企业 B 用户的 `id` 或 `name`
  2. 切回企业 A 管理员页面
  3. 在 DevTools 中重放以下任一请求，并把目标替换成企业 B 用户：
     - 编辑用户
     - 删除用户
     - 重置密码
     - 解锁
  4. 发送请求
- 预期结果：
  - 接口返回 `404`
  - 响应描述优先为 `API.USER_NOT_FOUND`
  - 前端表现为操作失败，不应出现成功提示

### TC-09 Cost Center 列表范围隔离

- 页面：Admin 端 `/#/settings/costcenter`
- 账号：企业 A 管理员
- 操作步骤：
  1. 登录企业 A 管理员
  2. 进入“设置 > 成本中心”
  3. 观察“成本中心”标签页列表
- 预期结果：
  - 只能看到企业 A 的 Cost Center
  - 看不到企业 B 的 Cost Center

### TC-10 Cost Center 新增与编辑归属正确

- 页面：Admin 端 `/#/settings/costcenter`
- 账号：企业 A 管理员
- 操作步骤：
  1. 点击“添加成本中心”新增 `CC_A_TEST`
  2. 再编辑该记录，修改名称或 external_id
  3. 刷新页面
- 预期结果：
  - 新增成功、编辑成功
  - 企业 A 管理员可以持续看见该记录
  - 企业 B 管理员看不到该记录

### TC-11 Space 树只展示本企业空间

- 页面：Admin 端 `/#/settings/space`
- 账号：企业 A 管理员
- 操作步骤：
  1. 登录企业 A 管理员
  2. 进入“设置 > 空间”
  3. 查看左侧空间树和右侧当前空间、子空间表格
- 预期结果：
  - 空间树中只能看到企业 A 的空间节点
  - 看不到企业 B 的空间节点
  - 右侧当前空间和子空间明细均只属于企业 A

### TC-12 Space 编辑仅允许绑定本企业 Cost Center

- 页面：Admin 端 `/#/settings/space`
- 账号：企业 A 管理员
- 操作步骤：
  1. 选中企业 A 的一个空间
  2. 点击“编辑”
  3. 查看 Cost Center 下拉框
  4. 保存为企业 A 的 Cost Center
- 预期结果：
  - 下拉框中只出现企业 A 可见的 Cost Center
  - 保存成功
  - 不应出现企业 B 的 Cost Center

### TC-13 Space 导出仅限本企业

- 页面：Admin 端 `/#/settings/space`
- 账号：企业 A 管理员
- 操作步骤：
  1. 在企业 A 子空间行点击“导出”
  2. 观察导出弹窗中的 JSON
  3. 检查 JSON 中引用的 Cost Center、父空间信息
- 预期结果：
  - 导出成功
  - 导出的 JSON 只包含企业 A 范围内允许的数据
  - 不应夹带企业 B 的 Cost Center 或空间引用

### TC-14 Space 克隆仅限本企业

- 页面：Admin 端 `/#/settings/space`
- 账号：企业 A 管理员
- 操作步骤：
  1. 在企业 A 子空间行点击“克隆”
  2. 等待返回结果
  3. 刷新空间树
- 预期结果：
  - 克隆成功
  - 新克隆空间出现在企业 A 的空间树内
  - 企业 B 管理员看不到该克隆结果

### TC-15 Space 导入仅允许导入到本企业边界内

- 页面：Admin 端 `/#/settings/space`
- 账号：企业 A 管理员
- 操作步骤：
  1. 点击“导入”
  2. 先导入一份企业 A 自己导出的合法 JSON
  3. 再手工修改 JSON，把 `parent_space_id` 或 `cost_center_id` 改成企业 B 的对象 ID
  4. 再次导入
- 预期结果：
  - 合法 JSON 导入成功
  - 篡改后的 JSON 导入失败
  - 接口应返回 `404`
  - 常见描述应为 `API.SPACE_NOT_FOUND` 或 `API.COST_CENTER_NOT_FOUND`
  - 前端应显示导入失败提示

### TC-16 Space 跨企业越权验证

- 页面：Admin 端 `/#/settings/space` + DevTools Network
- 账号：企业 A 管理员
- 操作步骤：
  1. 先用平台管理员记录企业 B 的 `space_id`、`parent_space_id`、`cost_center_id`
  2. 切回企业 A 管理员
  3. 在 DevTools 中重放以下任一请求并篡改目标 ID：
     - 导出 Space
     - 克隆 Space
     - 导入 Space
     - 编辑 Space
  4. 发送请求
- 预期结果：
  - 请求失败
  - 返回 `404`
  - 常见描述为 `API.SPACE_NOT_FOUND` 或 `API.COST_CENTER_NOT_FOUND`

### TC-17 Menu 树只展示本企业授权菜单

- 页面：Admin 端 `/#/settings/menu`
- 账号：企业 A 管理员
- 操作步骤：
  1. 登录企业 A 管理员
  2. 进入“设置 > 菜单”
  3. 观察左侧菜单树和右侧当前菜单、子菜单区域
- 预期结果：
  - 菜单树只展示企业 A 当前权限可见菜单
  - 不应出现企业 B 或无权菜单
  - 选中节点后右侧详情能够正常显示

### TC-18 Menu 越权编辑验证

- 页面：Admin 端 `/#/settings/menu` + DevTools Network
- 账号：企业 A 管理员
- 操作步骤：
  1. 先通过平台管理员记下一个企业 A 无权菜单的 `menu_id`
  2. 切回企业 A 管理员
  3. 通过重放菜单编辑请求，手工替换 `menu_id`
- 预期结果：
  - 请求失败
  - 不应成功修改越权菜单
  - 前端显示失败提示

### TC-19 Tenant Dashboard 报表边界

- 页面：Web 端 `/tenant`
- 账号：企业 A 管理员或企业 A Web 用户
- 操作步骤：
  1. 登录 Web
  2. 进入 Tenant Dashboard
  3. 观察页面卡片、趋势图、子空间表格、地图等数据
  4. 切换到 `/tenant/energycategory`、`/tenant/cost`、`/tenant/bill`
- 预期结果：
  - 页面可以正常加载企业 A 的租户报表
  - 不会混入企业 B 的租户数据
  - 图表汇总值、子空间表格、明细表均只属于企业 A

### TC-20 Store Dashboard 报表边界

- 页面：Web 端 `/store`
- 账号：企业 A 管理员或企业 A Web 用户
- 操作步骤：
  1. 登录 Web
  2. 进入 Store Dashboard
  3. 再访问 `/store/energycategory`、`/store/cost`、`/store/comparison`
- 预期结果：
  - 页面能正常加载企业 A 门店数据
  - 不应出现企业 B 门店数据
  - 图表、统计卡片、明细表与企业 A 实际数据一致

### TC-21 Shopfloor Dashboard 报表边界

- 页面：Web 端 `/shopfloor`
- 账号：企业 A 管理员或企业 A Web 用户
- 操作步骤：
  1. 登录 Web
  2. 进入 Shopfloor Dashboard
  3. 再访问 `/shopfloor/energycategory`、`/shopfloor/cost`、`/shopfloor/comparison`
- 预期结果：
  - 页面能正常加载企业 A 车间数据
  - 不应出现企业 B 车间数据
  - 图表、统计卡片、明细表与企业 A 实际数据一致

### TC-22 报表接口越权验证

- 页面：Web 端 `/tenant`、`/store`、`/shopfloor` + DevTools Network
- 账号：企业 A 管理员或企业 A Web 用户
- 操作步骤：
  1. 打开 Network，找到以下请求：
     - `/reports/tenantdashboard`
     - `/reports/storedashboard`
     - `/reports/shopfloordashboard`
  2. 重放请求，保留企业 A 的登录态
  3. 尝试篡改查询参数中的对象范围或相关 ID
- 预期结果：
  - 接口不能返回企业 B 数据
  - 非法对象请求应失败或返回空结果
  - 不应出现跨企业数据串读

## 6. 建议记录格式

每条用例建议记录以下字段：

- 用例编号
- 执行账号
- 执行时间
- 实际结果
- 是否通过
- 失败截图
- 失败请求 URL
- 失败响应状态码
- 失败响应体

## 7. 本轮优先关注失败信号

执行时如果出现以下现象，应直接判定为高优先级问题：

- 企业 A 管理员能在列表中直接看到企业 B 用户、Space、Cost Center、Menu
- 企业 A 管理员通过正常页面操作成功编辑、删除、重置、解锁企业 B 用户
- 篡改导入 JSON 后仍能把 Space 导入到企业 B 的父空间或绑定企业 B 的 Cost Center
- Web Dashboard 混入其他企业的 Tenant、Store、Shopfloor 数据
- 越权请求返回 `200` 或 `201`
