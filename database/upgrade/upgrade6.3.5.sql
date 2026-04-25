-- ---------------------------------------------------------------------------------------------------------------------
-- WARNING: BACKUP YOUR DATABASE BEFORE UPGRADING
-- THIS SCRIPT IS ONLY FOR UPGRADING 6.3.4 TO 6.3.5
-- THE CURRENT VERSION CAN BE FOUND AT `myems_system_db`.`tbl_versions`
-- ---------------------------------------------------------------------------------------------------------------------

START TRANSACTION;

UPDATE `myems_system_db`.`tbl_energy_flow_diagrams_links`
SET `meter_uuid` = '5ca47bc5-22c2-47fc-b906-33222191ea40'
WHERE `energy_flow_diagram_id` = 1
  AND `id` IN (1, 6)
  AND `meter_uuid` IN (
    '5ca47bc5-22c2-47fc-b906-33222191ea40',
    '831cbc8c-1429-4840-946e-f0b389b2253e'
  );

UPDATE `myems_system_db`.`tbl_energy_flow_diagrams_links`
SET `meter_uuid` = 'd6f3f56b-10ee-4d22-ad47-5acc1353a6f4'
WHERE `energy_flow_diagram_id` = 1
  AND `id` IN (2, 7)
  AND `meter_uuid` IN (
    '5d4d2f06-6200-4671-b182-4cf32cd9228f',
    'd2fc8464-3f13-42a9-8a57-63f95f677f0f'
  );

UPDATE `myems_system_db`.`tbl_energy_flow_diagrams_links`
SET `meter_uuid` = '6db58cd6-33d3-58ed-a095-22333202fb51'
WHERE `energy_flow_diagram_id` = 1
  AND `id` IN (3, 8)
  AND `meter_uuid` IN (
    '7897665b-66ac-481d-9c31-2ab2ecbda16c',
    '7e4b3831-887b-40e2-b7f8-4d77c6f206a9'
  );

UPDATE `myems_system_db`.`tbl_energy_flow_diagrams_links`
SET `meter_uuid` = '3fff2cfb-f755-44c8-a919-6135205a8573'
WHERE `energy_flow_diagram_id` = 1
  AND `id` = 4
  AND `meter_uuid` = 'f0c278ec-eb32-4c5e-a35f-88643b00c367';

UPDATE `myems_system_db`.`tbl_energy_flow_diagrams_links`
SET `meter_uuid` = '62f473e0-1a35-41f3-9c30-8110d75d65bb'
WHERE `energy_flow_diagram_id` = 1
  AND `id` = 5
  AND `meter_uuid` = '9918aa6c-79e9-4579-8f2e-a76eb9fe4e3e';

UPDATE `myems_system_db`.`tbl_versions`
SET version='6.3.5', release_date='2026-04-24'
WHERE id=1;

COMMIT;