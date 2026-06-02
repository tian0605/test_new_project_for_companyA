-- ---------------------------------------------------------------------------------------------------------------------
-- WARNING: BACKUP YOUR DATABASE BEFORE UPGRADING
-- THIS SCRIPT IS ONLY FOR UPGRADING 6.3.8 TO 6.3.9
-- THE CURRENT VERSION CAN BE FOUND AT `myems_system_db`.`tbl_versions`
-- ---------------------------------------------------------------------------------------------------------------------

START TRANSACTION;

CREATE TABLE IF NOT EXISTS `myems_production_db`.`tbl_carbon_assets` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `uuid` CHAR(36) NOT NULL,
  `enterprise_space_id` BIGINT NOT NULL DEFAULT 0,
  `space_id` BIGINT NOT NULL,
  `accounting_year` INT NOT NULL,
  `government_quota` DECIMAL(21, 6) NOT NULL DEFAULT 0,
  `previous_year_quota` DECIMAL(21, 6) NOT NULL DEFAULT 0,
  `purchased_quota` DECIMAL(21, 6) NOT NULL DEFAULT 0,
  `sold_quota` DECIMAL(21, 6) NOT NULL DEFAULT 0,
  `own_ccer` DECIMAL(21, 6) NOT NULL DEFAULT 0,
  `purchased_ccer` DECIMAL(21, 6) NOT NULL DEFAULT 0,
  `sold_ccer` DECIMAL(21, 6) NOT NULL DEFAULT 0,
  `purchased_green_certificate` DECIMAL(21, 6) NOT NULL DEFAULT 0,
  `sold_green_certificate` DECIMAL(21, 6) NOT NULL DEFAULT 0,
  `retired_green_certificate` DECIMAL(21, 6) NOT NULL DEFAULT 0,
  `quota_total` DECIMAL(21, 6) NOT NULL DEFAULT 0,
  `ccer_total` DECIMAL(21, 6) NOT NULL DEFAULT 0,
  `green_certificate_total` DECIMAL(21, 6) NOT NULL DEFAULT 0,
  `data_status` VARCHAR(32) NOT NULL DEFAULT 'active',
  `remark` VARCHAR(255) NOT NULL DEFAULT '',
  `created_datetime_utc` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_datetime_utc` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`));
CREATE INDEX `tbl_carbon_assets_index_1` ON `myems_production_db`.`tbl_carbon_assets` (`enterprise_space_id`, `space_id`, `accounting_year`);

CREATE TABLE IF NOT EXISTS `myems_production_db`.`tbl_carbon_asset_monthly_quotas` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `carbon_asset_id` BIGINT NOT NULL,
  `month_of_year` TINYINT NOT NULL,
  `quota_amount` DECIMAL(21, 6) NOT NULL DEFAULT 0,
  `remark` VARCHAR(255) NOT NULL DEFAULT '',
  PRIMARY KEY (`id`));
CREATE UNIQUE INDEX `tbl_carbon_asset_monthly_quotas_index_1` ON `myems_production_db`.`tbl_carbon_asset_monthly_quotas` (`carbon_asset_id`, `month_of_year`);

CREATE TABLE IF NOT EXISTS `myems_production_db`.`tbl_carbon_market_histories` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `uuid` CHAR(36) NOT NULL,
  `trade_date` DATE NOT NULL,
  `market_code` VARCHAR(32) NOT NULL,
  `variety_code` VARCHAR(32) NOT NULL,
  `open_price` DECIMAL(21, 6) NOT NULL DEFAULT 0,
  `close_price` DECIMAL(21, 6) NOT NULL DEFAULT 0,
  `high_price` DECIMAL(21, 6) NOT NULL DEFAULT 0,
  `low_price` DECIMAL(21, 6) NOT NULL DEFAULT 0,
  `change_value` DECIMAL(21, 6) NOT NULL DEFAULT 0,
  `change_rate` DECIMAL(21, 6) NOT NULL DEFAULT 0,
  `trading_volume` DECIMAL(21, 6) NOT NULL DEFAULT 0,
  `trading_amount` DECIMAL(21, 6) NOT NULL DEFAULT 0,
  `source_name` VARCHAR(128) NOT NULL DEFAULT '广州碳排放权交易中心',
  `source_file_name` VARCHAR(255) NOT NULL DEFAULT '',
  `import_batch_id` CHAR(36) NOT NULL DEFAULT '',
  `import_datetime_utc` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`));
CREATE UNIQUE INDEX `tbl_carbon_market_histories_index_1` ON `myems_production_db`.`tbl_carbon_market_histories` (`trade_date`, `market_code`, `variety_code`);

INSERT INTO `myems_system_db`.`tbl_menus` (`id`, `name`, `route`, `parent_menu_id`, `is_hidden`)
SELECT 1304, 'Carbon Asset Management', '/carbon/asset', 1300, 0
WHERE NOT EXISTS (
  SELECT 1 FROM `myems_system_db`.`tbl_menus` WHERE `id` = 1304 OR `route` = '/carbon/asset'
);

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
END
WHERE `id` IN (1, 2, 3);

UPDATE `myems_user_db`.`tbl_menu_templates`
SET `data` = JSON_SET(
  `data`,
  '$.web_routes',
  JSON_ARRAY_APPEND(IFNULL(JSON_EXTRACT(`data`, '$.web_routes'), JSON_ARRAY()), '$', '/carbon/asset')
)
WHERE `id` IN (1, 2, 3)
  AND JSON_SEARCH(IFNULL(JSON_EXTRACT(`data`, '$.web_routes'), JSON_ARRAY()), 'one', '/carbon/asset') IS NULL;

UPDATE `myems_system_db`.`tbl_versions`
SET version='6.3.9', release_date='2026-06-01'
WHERE id=1;

COMMIT;