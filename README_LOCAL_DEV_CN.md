# MyEMS 本地开发指南

本文档记录了该工作区在 Windows 环境下已经验证通过的本地开发配置。

## 适用范围

这套配置用于功能开发和本地测试，目标是以最小必需服务让环境可用：

- 本地 MySQL 兼容数据库
- MyEMS API
- MyEMS Web
- MyEMS Admin

以下服务已经安装和配置，但不是基础登录和页面验证所必需：

- myems-aggregation
- myems-cleaning
- myems-normalization
- myems-modbus-tcp

## 已验证环境

- 操作系统：Windows
- Python：3.10.11
- 项目虚拟环境：.venv
- Node.js：已加入 PATH
- MySQL：本机已安装 Oracle MySQL 8.4

## 一次性初始化

在仓库根目录执行：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\bootstrap-dev.ps1
```

该脚本会执行以下操作：

- 在 `.local/mysql` 下初始化本地 MySQL 数据目录
- 在 `127.0.0.1:3306` 启动本地 MySQL 实例
- 导入 MyEMS 安装库和演示数据
- 为各本地服务生成 `.env` 文件
- 创建 `myems-admin/upload` 上传目录

初始化完成后的默认登录账号：

- 用户名：administrator
- 密码：!MyEMS1

## Python 环境

使用 Python 3.10 重建本地虚拟环境：

```powershell
Remove-Item .venv -Recurse -Force
& "C:\Users\zhizh\AppData\Local\Programs\Python\Python310\python.exe" -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip setuptools wheel
```

安装所需 Python 依赖：

```powershell
.\.venv\Scripts\python.exe -m pip install anytree==2.13.0 simplejson==3.19.2 mysql-connector-python==9.6.0 falcon==4.2.0 falcon_cors==1.1.7 falcon-multipart==0.2.0 gunicorn==23.0.0 et_xmlfile==2.0.0 jdcal==1.4.1 openpyxl==3.1.5 pillow==11.0.0 python-decouple==3.8 paho-mqtt==2.1.0 plotly==5.24.0 kaleido==0.2.1 requests==2.33.0 redis==5.2.1 waitress modbus_tk schedule telnetlib3 sympy
```

## 前端依赖

安装 Web 前端依赖：

```powershell
npm --prefix .\myems-web install --legacy-peer-deps
```

## 启动命令

请在仓库根目录分别打开独立终端执行。

### 1. 启动 API

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-api-dev.ps1
```

该脚本在 Windows 下使用 Waitress，监听地址为：

- http://127.0.0.1:8000

### 2. 启动 Web 端

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-web-dev.ps1
```

该脚本会启动 React 开发服务器，监听地址为：

- http://127.0.0.1:3000

### 3. 启动管理端

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-admin-dev.ps1
```

该脚本会启动静态管理端页面服务，监听地址为：

- http://127.0.0.1:8001

## 已验证的本地访问地址

- Web 端：http://127.0.0.1:3000
- 管理端：http://127.0.0.1:8001
- API：http://127.0.0.1:8000

注意：

- `http://127.0.0.1:8000/` 返回 `404` 是正常现象。
- API 健康状态应通过真实业务路由验证，而不是访问根路径。

## 已验证的连通性检查

以下检查已在该工作区验证通过：

### 管理端可访问

- GET http://127.0.0.1:8001 返回 200

### Web 端可访问

- GET http://127.0.0.1:3000 返回 200

### API 可访问

- 未登录访问 GET http://127.0.0.1:8000/menus/web 返回 400

### 登录流程已验证

前端登录使用以下接口：

- PUT http://127.0.0.1:8000/users/login
- 请求体：

```json
{
  "data": {
    "account": "administrator",
    "password": "!MyEMS1"
  }
}
```

已验证结果：

- 登录返回 200
- 成功签发 token
- 携带认证信息后访问 GET http://127.0.0.1:8000/menus/web 返回 200

这说明以下最小业务链路是正常的：

- 数据库
- 身份认证
- 会话创建
- 已认证业务接口访问
- 前端与管理端启动

## 重要本地文件

- scripts/bootstrap-dev.ps1
- scripts/start-api-dev.ps1
- scripts/start-web-dev.ps1
- scripts/start-admin-dev.ps1
- myems-api/.env
- myems-web/src/config.js
- myems-admin/app/api.js

## 故障排查

### 使用 app.py 启动时 API 登录卡住

在 Windows 本地验证时，不要使用 `python app.py`。

请改用：

```powershell
.\.venv\Scripts\waitress-serve.exe --listen=0.0.0.0:8000 app:api
```

### 3000 端口不会立刻响应

首次 React 编译可能需要一点时间。如果 `react-scripts` 仍在运行，且 3000 端口稍后才可访问，这是正常现象。

### 3306 端口已被占用

请停止占用该端口的 MySQL 实例，或者修改 bootstrap 脚本使用其他端口。

### VS Code 选择了错误的 Python 解释器

请使用项目解释器：

- d:/VSCode/myems_development/.venv/Scripts/python.exe

## 推荐的日常使用流程

1. 只有在需要重建本地数据库或重新生成环境文件时，才运行 `bootstrap-dev.ps1`。
2. 使用 `start-api-dev.ps1` 启动 API。
3. 如果需要配置界面，使用 `start-admin-dev.ps1` 启动管理端。
4. 使用 `start-web-dev.ps1` 启动 Web 端。
5. 使用 `administrator / !MyEMS1` 登录。