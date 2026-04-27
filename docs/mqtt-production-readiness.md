# MQTT Production Readiness

This checklist captures the remaining preparation work for moving the current `EMQX + myems-mqtt + MyEMS` pipeline from local validation to a production rollout.

## Scope

The validated local path is:

- external publisher or gateway
- EMQX broker
- `myems-mqtt` adapter service
- MyEMS system and historical MySQL databases
- MyEMS API/Web/Admin for configuration and display

## Already Validated Locally

- EMQX listens on `1883` and `18083`
- `myems-mqtt` consumes datasource `10001`
- point `10001` is persisted into `myems_historical_db.tbl_analog_value_latest`
- Web page `Space -> Environment Monitor` shows the latest value and trend for the MQTT point
- Admin datasource page shows datasource `10001`

## Production Decisions To Freeze

Before release, freeze these values explicitly instead of keeping local defaults:

- broker host, port, dashboard port, and listener exposure policy
- broker authentication mode: anonymous disabled or enabled by exception only
- TLS policy for MQTT clients and dashboard access
- topic naming convention
- payload contract version and timezone policy
- datasource and point ID allocation policy
- production gateway ID and token used by `myems-mqtt`
- process supervision model for EMQX and `myems-mqtt`

## Infrastructure Checklist

- Run EMQX on a Linux filesystem with proper FIFO and service-manager support. Do not rely on the local WSL `/mnt/d` daemon workaround in production.
- Provision EMQX as a managed service, container, or VM unit with restart policy, log rotation, and health checks.
- Run `myems-mqtt` under a service manager with restart policy and dedicated logs.
- Confirm MySQL connectivity from the `myems-mqtt` host to both `myems_system_db` and `myems_historical_db`.
- Open only the required firewall ports.

Recommended minimum:

- MQTT TCP `1883` only on trusted internal networks unless TLS is enabled
- EMQX dashboard `18083` restricted to ops/admin access only
- MySQL access restricted to application hosts only

## Configuration Checklist

### EMQX

- replace local test settings with production listener bindings
- disable anonymous access unless business approval exists
- create broker users or client-auth policy for external gateways
- enable retained-message, inflight, session, and connection limits appropriate to expected device volume
- configure log retention and metrics export

### myems-mqtt

- create a production `.env` from `myems-mqtt/example.env`
- replace root database credentials with least-privilege service accounts
- replace local gateway token with the production gateway token from MyEMS Admin
- set log level to `INFO` or `WARNING` unless active troubleshooting is needed

### MyEMS Data Model

- create production datasources instead of reusing local demo datasource `10001`
- create production points with stable IDs or an agreed allocation process
- bind points to the real production sensor/equipment/space objects that will surface them in UI pages
- verify units, object type, trend flag, and address/topic metadata are correct for each point

## Security Checklist

- rotate the local default password `!MyEMS1` out of all production environments
- store broker, database, and gateway secrets outside source control
- restrict Admin UI exposure and require strong administrator passwords
- enable TLS for MQTT and HTTPS/reverse-proxy TLS for API/Web/Admin where required
- audit who can create or edit datasource, point, sensor, and gateway bindings

## Release Smoke Tests

Run these after deploying to the target environment:

1. Confirm EMQX is healthy and listening on the intended ports.
2. Publish a known test payload to the production test topic.
3. Confirm `myems-mqtt` logs show the datasource subscription and successful point persistence.
4. Query `myems_historical_db.tbl_analog_value_latest` or the matching object table for the target point.
5. Open the target Web page and confirm latest value and trend render.
6. Open Admin and confirm the datasource and point metadata are visible and correct.

## Rollback Readiness

- keep a rollback plan for EMQX config, `myems-mqtt` `.env`, and MyEMS datasource/point bindings
- define how to disable only the new datasource or topic mapping without stopping the rest of the platform
- confirm database backup or point-level cleanup procedure for bad telemetry imports

## Known Local-Only Assumptions Not To Carry Into Production

- WSL foreground-only EMQX startup
- demo `space 1` and `sensor 1` UI bindings
- root MySQL account usage
- local plaintext MQTT listener with no authentication hardening

## Suggested Production Artifacts

Keep these in the deployment package before go-live:

- EMQX deployment manifest or service unit
- `myems-mqtt` `.env` file managed by ops
- datasource and point import SQL or API automation
- smoke-test payload and verification commands
- rollback steps owned by the release operator