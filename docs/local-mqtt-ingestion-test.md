# Local MQTT Ingestion Test

This document describes the minimum local MQTT ingestion workflow for this workspace.

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

## Steps

1. Run the standard local bootstrap if needed.
2. Start EMQX locally. One Docker example is:

```powershell
docker run -d --name emqx-local -p 1883:1883 -p 18083:18083 emqx/emqx:latest
```

3. Provision the local datasource and point:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-mqtt-dev.ps1
```

4. Start the MQTT adapter:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-mqtt-dev.ps1
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