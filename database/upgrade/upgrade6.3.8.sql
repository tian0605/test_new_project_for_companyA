-- ---------------------------------------------------------------------------------------------------------------------
-- WARNING: BACKUP YOUR DATABASE BEFORE UPGRADING
-- THIS SCRIPT IS ONLY FOR UPGRADING 6.3.7 TO 6.3.8
-- THE CURRENT VERSION CAN BE FOUND AT `myems_system_db`.`tbl_versions`
-- ---------------------------------------------------------------------------------------------------------------------

START TRANSACTION;

CREATE TABLE IF NOT EXISTS `myems_production_db`.`tbl_product_carbon_dictionaries` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `uuid` CHAR(36) NOT NULL,
  `enterprise_space_id` BIGINT NOT NULL DEFAULT 0,
  `dict_type` VARCHAR(64) NOT NULL,
  `name` VARCHAR(64) NOT NULL,
  `sort_order` INT NOT NULL DEFAULT 0,
  `is_active` BOOL NOT NULL DEFAULT TRUE,
  `remark` VARCHAR(255) NOT NULL DEFAULT '',
  PRIMARY KEY (`id`));
CREATE INDEX `tbl_product_carbon_dictionaries_index_1` ON `myems_production_db`.`tbl_product_carbon_dictionaries` (`enterprise_space_id`, `dict_type`, `is_active`, `sort_order`);

INSERT INTO `myems_production_db`.`tbl_product_carbon_dictionaries` (`uuid`, `enterprise_space_id`, `dict_type`, `name`, `sort_order`, `is_active`, `remark`)
SELECT UUID(), 0, 'supply_category', '运输类', 1, TRUE, ''
WHERE NOT EXISTS (
  SELECT 1 FROM `myems_production_db`.`tbl_product_carbon_dictionaries` WHERE `enterprise_space_id` = 0 AND `dict_type` = 'supply_category' AND `name` = '运输类'
);

INSERT INTO `myems_production_db`.`tbl_product_carbon_dictionaries` (`uuid`, `enterprise_space_id`, `dict_type`, `name`, `sort_order`, `is_active`, `remark`)
SELECT UUID(), 0, 'supply_category', '物料类', 2, TRUE, ''
WHERE NOT EXISTS (
  SELECT 1 FROM `myems_production_db`.`tbl_product_carbon_dictionaries` WHERE `enterprise_space_id` = 0 AND `dict_type` = 'supply_category' AND `name` = '物料类'
);

CREATE TABLE IF NOT EXISTS `myems_production_db`.`tbl_product_carbon_supplies` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `uuid` CHAR(36) NOT NULL,
  `enterprise_space_id` BIGINT NOT NULL DEFAULT 0,
  `category` VARCHAR(64) NOT NULL,
  `supplier_name` VARCHAR(128) NOT NULL,
  `supplier_address` VARCHAR(255) NOT NULL DEFAULT '',
  `material_name` VARCHAR(128) NOT NULL,
  `specification` VARCHAR(128) NOT NULL DEFAULT '',
  `boundary` VARCHAR(128) NOT NULL DEFAULT '',
  `carbon_footprint_value` DECIMAL(21, 6) NOT NULL,
  `carbon_footprint_unit` VARCHAR(32) NOT NULL,
  `contact_name` VARCHAR(128) NOT NULL DEFAULT '',
  `contact_phone` VARCHAR(32) NOT NULL DEFAULT '',
  `contact_email` VARCHAR(128) NOT NULL DEFAULT '',
  `remark` VARCHAR(255) NOT NULL DEFAULT '',
  PRIMARY KEY (`id`));
CREATE INDEX `tbl_product_carbon_supplies_index_1` ON `myems_production_db`.`tbl_product_carbon_supplies` (`enterprise_space_id`, `category`);
CREATE INDEX `tbl_product_carbon_supplies_index_2` ON `myems_production_db`.`tbl_product_carbon_supplies` (`enterprise_space_id`, `supplier_name`, `material_name`, `specification`);

CREATE TABLE IF NOT EXISTS `myems_production_db`.`tbl_product_carbon_footprints` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `uuid` CHAR(36) NOT NULL,
  `enterprise_space_id` BIGINT NOT NULL DEFAULT 0,
  `product_id` BIGINT NOT NULL,
  `accounting_year` INT NOT NULL,
  `name` VARCHAR(128) NOT NULL,
  `unit` VARCHAR(32) NOT NULL DEFAULT '',
  `accounting_date` DATE NOT NULL,
  `system_boundary` VARCHAR(128) NOT NULL DEFAULT '',
  `start_date` DATE NOT NULL,
  `end_date` DATE NOT NULL,
  `production_quantity` DECIMAL(21, 6) NOT NULL,
  `functional_unit` VARCHAR(64) NOT NULL,
  `total_carbon_footprint` DECIMAL(21, 6) NOT NULL DEFAULT 0,
  `data_status` VARCHAR(32) NOT NULL DEFAULT 'active',
  `remark` VARCHAR(255) NOT NULL DEFAULT '',
  PRIMARY KEY (`id`));
CREATE INDEX `tbl_product_carbon_footprints_index_1` ON `myems_production_db`.`tbl_product_carbon_footprints` (`enterprise_space_id`, `product_id`, `accounting_year`, `data_status`);
CREATE INDEX `tbl_product_carbon_footprints_index_2` ON `myems_production_db`.`tbl_product_carbon_footprints` (`enterprise_space_id`, `accounting_year`);

CREATE TABLE IF NOT EXISTS `myems_production_db`.`tbl_product_carbon_activities` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `uuid` CHAR(36) NOT NULL,
  `enterprise_space_id` BIGINT NOT NULL DEFAULT 0,
  `footprint_id` BIGINT NOT NULL,
  `supply_id` BIGINT,
  `stage` VARCHAR(64) NOT NULL,
  `category` VARCHAR(64) NOT NULL,
  `activity_name` VARCHAR(128) NOT NULL,
  `activity_level` DECIMAL(21, 6) NOT NULL,
  `unit` VARCHAR(32) NOT NULL,
  `factor` DECIMAL(21, 6) NOT NULL,
  `emission_amount` DECIMAL(21, 6) NOT NULL,
  `factor_source` VARCHAR(128) NOT NULL DEFAULT '',
  `carbon_footprint_value` DECIMAL(21, 6) NOT NULL,
  `remark` VARCHAR(255) NOT NULL DEFAULT '',
  PRIMARY KEY (`id`));
CREATE INDEX `tbl_product_carbon_activities_index_1` ON `myems_production_db`.`tbl_product_carbon_activities` (`enterprise_space_id`, `footprint_id`, `stage`);
CREATE INDEX `tbl_product_carbon_activities_index_2` ON `myems_production_db`.`tbl_product_carbon_activities` (`supply_id`);

UPDATE `myems_production_db`.`tbl_product_carbon_activities` a
INNER JOIN `myems_production_db`.`tbl_product_carbon_footprints` f
  ON a.`enterprise_space_id` = f.`enterprise_space_id` AND a.`footprint_id` = f.`id`
SET a.`carbon_footprint_value` = a.`emission_amount` / f.`production_quantity`
WHERE f.`production_quantity` > 0;

UPDATE `myems_production_db`.`tbl_product_carbon_footprints` f
LEFT JOIN (
  SELECT `enterprise_space_id`, `footprint_id`, SUM(`carbon_footprint_value`) AS `total_carbon_footprint`
  FROM `myems_production_db`.`tbl_product_carbon_activities`
  GROUP BY `enterprise_space_id`, `footprint_id`
) a ON f.`enterprise_space_id` = a.`enterprise_space_id` AND f.`id` = a.`footprint_id`
SET f.`total_carbon_footprint` = COALESCE(a.`total_carbon_footprint`, 0);

INSERT INTO `myems_system_db`.`tbl_menus` (`id`, `name`, `route`, `parent_menu_id`, `is_hidden`)
SELECT 1300, 'Product Carbon Footprint', '/carbon', NULL, 0
WHERE NOT EXISTS (
  SELECT 1 FROM `myems_system_db`.`tbl_menus` WHERE `id` = 1300 OR `route` = '/carbon'
);

INSERT INTO `myems_system_db`.`tbl_menus` (`id`, `name`, `route`, `parent_menu_id`, `is_hidden`)
SELECT 1301, 'Supply Material Maintenance', '/carbon/supply', 1300, 0
WHERE NOT EXISTS (
  SELECT 1 FROM `myems_system_db`.`tbl_menus` WHERE `id` = 1301 OR `route` = '/carbon/supply'
);

INSERT INTO `myems_system_db`.`tbl_menus` (`id`, `name`, `route`, `parent_menu_id`, `is_hidden`)
SELECT 1303, 'Product Carbon Dictionary', '/carbon/dictionary', 1300, 0
WHERE NOT EXISTS (
  SELECT 1 FROM `myems_system_db`.`tbl_menus` WHERE `id` = 1303 OR `route` = '/carbon/dictionary'
);

INSERT INTO `myems_system_db`.`tbl_menus` (`id`, `name`, `route`, `parent_menu_id`, `is_hidden`)
SELECT 1302, 'Product Carbon Footprint Accounting', '/carbon/footprint', 1300, 0
WHERE NOT EXISTS (
  SELECT 1 FROM `myems_system_db`.`tbl_menus` WHERE `id` = 1302 OR `route` = '/carbon/footprint'
);

UPDATE `myems_system_db`.`tbl_versions`
SET version='6.3.8', release_date='2026-05-13'
WHERE id=1;

COMMIT;
