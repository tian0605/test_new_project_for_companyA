# MyEMS Local Development Guide

This guide documents the verified Windows local development setup for this workspace.

## Scope

This setup is intended for feature development and local testing with the minimum services required to make the environment usable:

- local MySQL-compatible database
- MyEMS API
- MyEMS Web
- MyEMS Admin

The following services are installed and configured but are not required for basic login and UI verification:

- myems-aggregation
- myems-cleaning
- myems-normalization
- myems-modbus-tcp
- myems-mqtt

## Verified Environment

- OS: Windows
- Python: 3.10.11
- Project virtual environment: .venv
- Node.js: available in PATH
- MySQL: Oracle MySQL 8.4 installed locally

## One-Time Bootstrap

Run this from the repository root:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\bootstrap-dev.ps1
```

What it does:

- initializes a local MySQL data directory under .local/mysql
- starts a local MySQL instance on 127.0.0.1:3306
- imports the MyEMS install databases and demo data
- generates .env files for local services
- creates the upload directory under myems-admin/upload

Default login after bootstrap:

- username: administrator
- password: !MyEMS1

## Python Environment

Rebuild the local virtual environment with Python 3.10:

```powershell
Remove-Item .venv -Recurse -Force
& "C:\Users\zhizh\AppData\Local\Programs\Python\Python310\python.exe" -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip setuptools wheel
```

Install the required Python packages:

```powershell
.\.venv\Scripts\python.exe -m pip install anytree==2.13.0 simplejson==3.19.2 mysql-connector-python==9.6.0 falcon==4.2.0 falcon_cors==1.1.7 falcon-multipart==0.2.0 gunicorn==23.0.0 et_xmlfile==2.0.0 jdcal==1.4.1 openpyxl==3.1.5 pillow==11.0.0 python-decouple==3.8 paho-mqtt==2.1.0 plotly==5.24.0 kaleido==0.2.1 requests==2.33.0 redis==5.2.1 waitress modbus_tk schedule telnetlib3 sympy
```

## Frontend Dependencies

Install the web frontend dependencies:

```powershell
npm --prefix .\myems-web install --legacy-peer-deps
```

## Start Commands

Open separate terminals from the repository root.

### 1. Start API

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-api-dev.ps1
```

This uses Waitress on Windows and listens on:

- http://127.0.0.1:8000

### 2. Start Web UI

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-web-dev.ps1
```

This starts the React development server on:

- http://127.0.0.1:3000

### 3. Start Admin UI

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-admin-dev.ps1
```

This serves the static admin UI on:

- http://127.0.0.1:8001

## Verified Local URLs

- Web UI: http://127.0.0.1:3000
- Admin UI: http://127.0.0.1:8001
- API: http://127.0.0.1:8000

## Optional Local MQTT Ingestion Experiment

This workspace now includes a local MQTT ingestion service under `myems-mqtt`.

Recommended local experiment flow:

1. Start a local EMQX node or another MQTT broker bound to `127.0.0.1:1883`.
2. Run `powershell -ExecutionPolicy Bypass -File .\scripts\setup-mqtt-dev.ps1` to provision datasource `10001` and point `10001`.
3. Start the adapter with `powershell -ExecutionPolicy Bypass -File .\scripts\start-mqtt-dev.ps1`.
4. Start the test publisher with `powershell -ExecutionPolicy Bypass -File .\scripts\start-mqtt-test-publisher.ps1`.
5. Verify inserts in `myems_historical_db.tbl_analog_value` and `myems_historical_db.tbl_analog_value_latest` for point `10001`.

Expected local payload:

```json
{
  "data_source_id": 10001,
  "point_id": 10001,
  "utc_date_time": "2026-04-26T12:00:00",
  "value": 42.5
}
```

Note:

- `http://127.0.0.1:8000/` returning 404 is expected.
- API health should be verified using real routes, not the root path.

## Verified Connectivity Checks

The following checks have been verified successfully in this workspace:

### Admin UI reachable

- GET http://127.0.0.1:8001 returned 200

### Web UI reachable

- GET http://127.0.0.1:3000 returned 200

### API reachable

- GET http://127.0.0.1:8000/menus/web without auth returned 400

### Login flow verified

The frontend login uses:

- PUT http://127.0.0.1:8000/users/login
- request body:

```json
{
  "data": {
    "account": "administrator",
    "password": "!MyEMS1"
  }
}
```

Verified result:

- login returned 200
- token was issued
- authenticated GET http://127.0.0.1:8000/menus/web returned 200

This confirms the minimum business path is working:

- database
- authentication
- session creation
- authenticated business API access
- frontend and admin UI startup

## Important Local Files

- scripts/bootstrap-dev.ps1
- scripts/start-api-dev.ps1
- scripts/start-web-dev.ps1
- scripts/start-admin-dev.ps1
- myems-api/.env
- myems-web/src/config.js
- myems-admin/app/api.js

## Troubleshooting

### API login hangs when started with app.py

Do not use `python app.py` on Windows for local validation.

Use:

```powershell
.\.venv\Scripts\waitress-serve.exe --listen=0.0.0.0:8000 app:api
```

### Port 3000 does not respond immediately

The first React compile can take time. If `react-scripts` is still running and port 3000 appears later, this is normal.

### Port 3306 already in use

Stop the conflicting MySQL instance or adjust the bootstrap script if another local database is already bound.

### VS Code selects the wrong Python interpreter

Use the project interpreter:

- d:/VSCode/myems_development/.venv/Scripts/python.exe

## Recommended Daily Workflow

1. Run `bootstrap-dev.ps1` only when the local database or env files need rebuilding.
2. Start API with `start-api-dev.ps1`.
3. Start Admin with `start-admin-dev.ps1` if configuration UI is needed.
4. Start Web with `start-web-dev.ps1`.
5. Log in with `administrator / !MyEMS1`.