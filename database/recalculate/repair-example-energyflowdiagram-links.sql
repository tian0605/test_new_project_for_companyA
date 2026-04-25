-- Repair the built-in example energy flow diagram so every demo link points to
-- an existing source UUID.
--
-- Root cause:
-- The demo system database seeds `tbl_energy_flow_diagrams_links` with seven
-- orphaned meter UUIDs that do not exist in tbl_meters / tbl_offline_meters /
-- tbl_virtual_meters. The reporting API then resolves only one link and leaves
-- the others as NULL.
--
-- This repair rebinds the example diagram (id = 1) to demo offline meters that
-- are present in the sample database and have hourly data in local demo setups.

START TRANSACTION;

UPDATE `myems_system_db`.`tbl_energy_flow_diagrams_links`
SET `meter_uuid` = '5ca47bc5-22c2-47fc-b906-33222191ea40'
WHERE `energy_flow_diagram_id` = 1 AND `id` IN (1, 6);

UPDATE `myems_system_db`.`tbl_energy_flow_diagrams_links`
SET `meter_uuid` = 'd6f3f56b-10ee-4d22-ad47-5acc1353a6f4'
WHERE `energy_flow_diagram_id` = 1 AND `id` IN (2, 7);

UPDATE `myems_system_db`.`tbl_energy_flow_diagrams_links`
SET `meter_uuid` = '6db58cd6-33d3-58ed-a095-22333202fb51'
WHERE `energy_flow_diagram_id` = 1 AND `id` IN (3, 8);

UPDATE `myems_system_db`.`tbl_energy_flow_diagrams_links`
SET `meter_uuid` = '3fff2cfb-f755-44c8-a919-6135205a8573'
WHERE `energy_flow_diagram_id` = 1 AND `id` = 4;

UPDATE `myems_system_db`.`tbl_energy_flow_diagrams_links`
SET `meter_uuid` = '62f473e0-1a35-41f3-9c30-8110d75d65bb'
WHERE `energy_flow_diagram_id` = 1 AND `id` = 5;

COMMIT;