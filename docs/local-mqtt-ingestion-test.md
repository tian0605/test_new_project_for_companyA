# Local MQTT Ingestion Test

This document describes the minimum local MQTT ingestion workflow for this workspace, including the existing UI path that shows the latest value and trend for the demo MQTT point.

## Components

- local MySQL from the standard bootstrap
- MyEMS API/Admin/Web
- local MQTT broker such as EMQX on `127.0.0.1:1883`
- `myems-mqtt` adapter service
- `myems-mqtt/test_publisher.py` publisher simulator

## Vendored EMQX Source

The EMQX open-source codebase has been copied into this workspace under `others/emqx` from:

- https://github.com/emqx/emqx/

This gives the project a local copy of the broker source tree for reference and future packaging work. It does not automatically install or start an EMQX broker on Windows.

For this workspace, the broker has been validated locally in WSL from the vendored source tree under `others/emqx/_build/emqx-enterprise/rel/emqx`.

- Working local mode: `foreground`
- Verified listeners: `1883` for MQTT and `18083` for the dashboard
- Current limitation on Windows + WSL DrvFS: daemon mode is not reliable because `run_erl` pipe creation depends on FIFO semantics that `/mnt/d` does not provide consistently

## Steps

1. Run the standard local bootstrap if needed.
2. Start EMQX locally.

One Docker example is:

```powershell
docker run -d --name emqx-local -p 1883:1883 -p 18083:18083 emqx/emqx:latest
```

For the vendored WSL build already prepared in this workspace, use:

```powershell
wsl -d Ubuntu-22.04 -u root -e bash -lc "cd /mnt/d/VSCode/myems_development_enterprise-isolation-v2/others/emqx/_build/emqx-enterprise/rel/emqx && ./bin/emqx foreground"
```

3. Provision the local datasource and point:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-mqtt-dev.ps1
```

This script now does all of the following idempotently:

- provisions datasource `10001`
- provisions point `10001`
- binds point `10001` to demo `sensor 1` when that sensor exists
- ensures demo `space 1` is bound to `sensor 1` when both demo records exist

That binding is what makes the point show up on the existing Web page `Space -> Environment Monitor`.

4. Start the MQTT adapter:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-mqtt-dev.ps1
```

If the API, Web, and Admin are not already running, start them too:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-api-dev.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\start-web-dev.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\start-admin-dev.ps1
```

5. Start the test publisher:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-mqtt-test-publisher.ps1
```

6. Verify historical data with SQL:

```sql
SELECT point_id, utc_date_time, actual_value
FROM myems_historical_db.tbl_analog_value_latest
WHERE point_id = 10001;
```

7. Verify the existing UI pages:

- Web realtime/trend page: `http://127.0.0.1:3000/space/environmentmonitor`
- Admin datasource page: `http://127.0.0.1:8001/#!/settings/data-source`

Expected Web result:

- card title includes `Example Sensor`
- card body includes `Local MQTT Test Point (kWh)`
- the latest value updates over time
- the card renders a small trend chart under the latest value

Expected Admin result:

- datasource list includes `10001 Local MQTT Test Data Source`
- protocol column shows `mqtt`

8. Verify the report API directly when needed:

```powershell
$body = @{ username = 'administrator'; password = '!MyEMS1' } | ConvertTo-Json
$login = Invoke-RestMethod -Uri 'http://127.0.0.1:8000/users/login' -Method Put -ContentType 'application/json' -Body $body
$headers = @{ 'User-UUID' = $login.uuid; 'Token' = $login.token }
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/reports/spaceenvironmentmonitor?sensorid=1&timerange=24h' -Headers $headers
```

## Payload Contract

```json
{
  "data_source_id": 10001,
  "point_id": 10001,
  "utc_date_time": "2026-04-26T12:00:00",
  "value": 42.5
}
```

## Notes

- The adapter accepts either a single JSON object or a JSON array.
- `point_id` must exist in `tbl_points` for the configured datasource.
- The initial implementation routes by `tbl_points.object_type` into analog, energy, or digital tables.
- The current demo UI path depends on the demo records `space 1` and `sensor 1`. In production, bind the MQTT point to the real sensor/space objects instead of relying on demo IDs.