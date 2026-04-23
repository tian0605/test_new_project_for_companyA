-- ---------------------------------------------------------------------------------------------------------------------
-- WARNING: BACKUP YOUR DATABASE BEFORE UPGRADING
-- THIS SCRIPT IS ONLY FOR UPGRADING 6.3.3 TO 6.3.4
-- THE CURRENT VERSION CAN BE FOUND AT `myems_system_db`.`tbl_versions`
-- ---------------------------------------------------------------------------------------------------------------------

START TRANSACTION;

UPDATE `myems_system_db`.`tbl_menus`
SET `is_hidden` = 0
WHERE `route` IN ('/space/production', '/space/enterproduction');

UPDATE `myems_system_db`.`tbl_versions`
SET version='6.3.4', release_date='2026-04-23'
WHERE id=1;

COMMIT;