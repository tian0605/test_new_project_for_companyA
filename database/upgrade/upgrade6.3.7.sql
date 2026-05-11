-- ---------------------------------------------------------------------------------------------------------------------
-- WARNING: BACKUP YOUR DATABASE BEFORE UPGRADING
-- THIS SCRIPT IS ONLY FOR UPGRADING 6.3.6 TO 6.3.7
-- THE CURRENT VERSION CAN BE FOUND AT `myems_system_db`.`tbl_versions`
-- ---------------------------------------------------------------------------------------------------------------------

START TRANSACTION;

INSERT INTO `myems_system_db`.`tbl_menus` (`id`, `name`, `route`, `parent_menu_id`, `is_hidden`)
SELECT 327, 'Baseline Meter Input', '/meter/baselinemeterinput', 300, 0
WHERE NOT EXISTS (
  SELECT 1
  FROM `myems_system_db`.`tbl_menus`
  WHERE `id` = 327 OR `route` = '/meter/baselinemeterinput'
);

UPDATE `myems_system_db`.`tbl_versions`
SET version='6.3.7', release_date='2026-05-10'
WHERE id=1;

COMMIT;