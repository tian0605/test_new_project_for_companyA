$ErrorActionPreference = 'Stop'

$mysqlBaseDirCandidates = @(
  'C:\Program Files\MySQL\MySQL Server 8.4',
  'C:\Program Files\MySQL\MySQL Server 8.3',
  'C:\Program Files\MySQL\MySQL Server 8.0'
)

$mysqlBaseDir = $mysqlBaseDirCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $mysqlBaseDir) {
  throw 'MySQL Server was not found. Install Oracle.MySQL first.'
}

$mysqlExe = Join-Path (Join-Path $mysqlBaseDir 'bin') 'mysql.exe'
$dbPort = 3306
$dbPassword = '!MyEMS1'

$sql = @"
INSERT INTO myems_system_db.tbl_data_sources (id, name, uuid, gateway_id, protocol, connection)
VALUES (
  10001,
  'Local MQTT Test Data Source',
  '6e918493-e22a-4f94-a8c6-998e6def1001',
  1,
  'mqtt',
  '{"host":"127.0.0.1","port":1883,"topic":"testtopic","qos":0}'
)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  gateway_id = VALUES(gateway_id),
  protocol = VALUES(protocol),
  connection = VALUES(connection);

INSERT INTO myems_system_db.tbl_points
  (id, name, data_source_id, object_type, units, high_limit, low_limit, ratio, offset_constant, is_trend, is_virtual, address, description)
VALUES
  (10001, 'Local MQTT Test Point', 10001, 'ANALOG_VALUE', 'kWh', 99999999999, 0, 1.000000, 0.000000, 1, 0, '{"topic":"testtopic"}', 'Local MQTT ingestion test point')
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  data_source_id = VALUES(data_source_id),
  object_type = VALUES(object_type),
  units = VALUES(units),
  high_limit = VALUES(high_limit),
  low_limit = VALUES(low_limit),
  ratio = VALUES(ratio),
  offset_constant = VALUES(offset_constant),
  is_trend = VALUES(is_trend),
  is_virtual = VALUES(is_virtual),
  address = VALUES(address),
  description = VALUES(description);
"@

& $mysqlExe --protocol=tcp --host=127.0.0.1 --port=$dbPort --default-character-set=utf8mb4 -u root --password=$dbPassword -e $sql

if ($LASTEXITCODE -ne 0) {
  throw 'Failed to provision local MQTT datasource and point.'
}

Write-Host 'Provisioned local MQTT datasource 10001 and point 10001.'
Write-Host 'Topic: testtopic'
Write-Host 'Payload: {"data_source_id":10001,"point_id":10001,"utc_date_time":"2026-04-26T12:00:00","value":42.5}'