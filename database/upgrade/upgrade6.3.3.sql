-- ---------------------------------------------------------------------------------------------------------------------
-- WARNING: BACKUP YOUR DATABASE BEFORE UPGRADING
-- THIS SCRIPT IS ONLY FOR UPGRADING 6.3.2 TO 6.3.3
-- THE CURRENT VERSION CAN BE FOUND AT `myems_system_db`.`tbl_versions`
-- ---------------------------------------------------------------------------------------------------------------------

START TRANSACTION;

UPDATE `myems_user_db`.`tbl_menu_templates`
SET `data` = CASE
  WHEN JSON_VALID(`data`) THEN JSON_OBJECT(
    'template_type', IFNULL(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(`data`, '$.template_type')), ''), 'admin'),
    'admin_routes', IFNULL(JSON_EXTRACT(`data`, '$.admin_routes'), JSON_ARRAY()),
    'web_routes', IFNULL(JSON_EXTRACT(`data`, '$.web_routes'), JSON_ARRAY())
  )
  ELSE JSON_OBJECT(
    'template_type', 'admin',
    'admin_routes', JSON_ARRAY(),
    'web_routes', JSON_ARRAY()
  )
END;

UPDATE `myems_system_db`.`tbl_versions`
SET version='6.3.3', release_date='2026-04-23'
WHERE id=1;

COMMIT;