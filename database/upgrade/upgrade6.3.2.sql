-- ---------------------------------------------------------------------------------------------------------------------
-- WARNING: BACKUP YOUR DATABASE BEFORE UPGRADING
-- THIS SCRIPT IS ONLY FOR UPGRADING 6.3.1 TO 6.3.2
-- THE CURRENT VERSION CAN BE FOUND AT `myems_system_db`.`tbl_versions`
-- ---------------------------------------------------------------------------------------------------------------------

START TRANSACTION;

SET @menu_template_column_exists = (
  SELECT COUNT(*)
  FROM `INFORMATION_SCHEMA`.`COLUMNS`
  WHERE `TABLE_SCHEMA` = 'myems_user_db'
    AND `TABLE_NAME` = 'tbl_users'
    AND `COLUMN_NAME` = 'menu_template_id'
);
SET @menu_template_column_sql = IF(
  @menu_template_column_exists = 0,
  'ALTER TABLE `myems_user_db`.`tbl_users` ADD COLUMN `menu_template_id` BIGINT NULL AFTER `privilege_id`',
  'SELECT 1'
);
PREPARE menu_template_column_stmt FROM @menu_template_column_sql;
EXECUTE menu_template_column_stmt;
DEALLOCATE PREPARE menu_template_column_stmt;

CREATE TABLE IF NOT EXISTS `myems_user_db`.`tbl_menu_templates` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(45) NOT NULL,
  `data` LONGTEXT NOT NULL COMMENT 'MUST be in JSON format',
  PRIMARY KEY (`id`)
);

INSERT INTO `myems_user_db`.`tbl_menu_templates` (`id`, `name`, `data`)
VALUES
(1, '平台管理员菜单', JSON_OBJECT('admin_routes', JSON_ARRAY('settings.category','settings.tariff','settings.costcenter','settings.contact','settings.gateway','settings.protocol','settings.datasource','settings.meter','settings.sensor','settings.equipment','settings.combinedequipment','settings.space','settings.tenant','settings.store','settings.shopfloor','settings.energyflowdiagram','settings.svg','settings.distributionsystem','settings.menu','settings.knowledgefile','settings.workingcalendar','users.user','users.privilege','users.menutemplate','users.apikey','users.log','settings.command','settings.controlmode','settings.iotsimcard','settings.microgrid','settings.virtualpowerplant','settings.energystoragecontainer','settings.energystoragepowerstation','settings.photovoltaicpowerstation','settings.windfarm','settings.emailserver','settings.advancedreport','settings.energyplanfile','fdd.rule','fdd.textmessage','fdd.emailmessage','fdd.webmessage','fdd.wechatmessage'))),
(2, '企业管理员菜单', JSON_OBJECT('admin_routes', JSON_ARRAY('settings.category','settings.tariff','settings.costcenter','settings.contact','settings.gateway','settings.protocol','settings.datasource','settings.meter','settings.sensor','settings.equipment','settings.combinedequipment','settings.space','settings.tenant','settings.store','settings.shopfloor','settings.energyflowdiagram','settings.svg','settings.distributionsystem','settings.workingcalendar','users.user','users.privilege','settings.command','settings.microgrid','settings.virtualpowerplant','settings.energystoragecontainer','settings.energystoragepowerstation','settings.photovoltaicpowerstation','settings.windfarm','fdd.rule','fdd.textmessage','fdd.emailmessage','fdd.webmessage','fdd.wechatmessage'))),
(3, '企业操作员菜单', JSON_OBJECT('admin_routes', JSON_ARRAY('settings.costcenter','settings.meter','settings.sensor','settings.equipment','settings.combinedequipment','settings.space','settings.tenant','settings.store','settings.shopfloor','settings.command','fdd.rule','fdd.textmessage','fdd.emailmessage','fdd.webmessage','fdd.wechatmessage')))
ON DUPLICATE KEY UPDATE
`name` = VALUES(`name`),
`data` = VALUES(`data`);

UPDATE `myems_user_db`.`tbl_users`
SET `menu_template_id` = 1
WHERE `is_admin` = 1 AND `enterprise_space_id` IS NULL AND `menu_template_id` IS NULL;

UPDATE `myems_user_db`.`tbl_users`
SET `menu_template_id` = 2
WHERE `is_admin` = 1 AND `enterprise_space_id` IS NOT NULL AND `menu_template_id` IS NULL;

UPDATE `myems_system_db`.`tbl_versions`
SET version='6.3.2', release_date='2026-04-20'
WHERE id=1;

COMMIT;