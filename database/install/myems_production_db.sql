-- MyEMS Production Database

-- ---------------------------------------------------------------------------------------------------------------------
-- Schema myems_production_db
-- ---------------------------------------------------------------------------------------------------------------------
DROP DATABASE IF EXISTS `myems_production_db` ;
CREATE DATABASE IF NOT EXISTS `myems_production_db` CHARACTER SET 'utf8mb4' COLLATE 'utf8mb4_unicode_ci' ;
USE `myems_production_db` ;

-- ---------------------------------------------------------------------------------------------------------------------
-- Table `myems_production_db`.`tbl_products`
-- ---------------------------------------------------------------------------------------------------------------------
DROP TABLE IF EXISTS `myems_production_db`.`tbl_products` ;

CREATE TABLE IF NOT EXISTS `myems_production_db`.`tbl_products` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(128) NOT NULL,
  `uuid` CHAR(36) NOT NULL,
  `unit_of_measure` VARCHAR(32) NOT NULL,
  `tag` VARCHAR(128) NOT NULL,
  `standard_product_coefficient` DECIMAL(21, 6) NOT NULL DEFAULT 1.0,
  PRIMARY KEY (`id`));
CREATE INDEX `tbl_products_index_1` ON `myems_production_db`.`tbl_products` (`name`);

INSERT INTO `myems_production_db`.`tbl_products`
  (`name`, `uuid`, `unit_of_measure`, `tag`, `standard_product_coefficient`)
VALUES
  ('单丝', UUID(), '吨', '废旧涤纶布料再生利用产品', 1.000000);

-- --------------------------------------------------------------------------------------------------------------------------------------------------------
-- Table `myems_production_db`.`tbl_shifts`
-- ---------------------------------------------------------------------------------------------------------------------
DROP TABLE IF EXISTS `myems_production_db`.`tbl_shifts` ;

CREATE TABLE IF NOT EXISTS `myems_production_db`.`tbl_shifts` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `shopfloor_id` BIGINT NOT NULL,
  `team_id` BIGINT NOT NULL,
  `product_id` BIGINT NOT NULL,
  `product_count` INT NOT NULL,
  `start_datetime_utc` DATETIME NOT NULL,
  `end_datetime_utc` DATETIME NOT NULL,
  `reference_timestamp` DATETIME NOT NULL,
  PRIMARY KEY (`id`));
CREATE INDEX `tbl_shifts_index_1`
ON `myems_production_db`.`tbl_shifts` (`shopfloor_id`, `product_id`, `end_datetime_utc`);
CREATE INDEX `tbl_shifts_index_2`
ON `myems_production_db`.`tbl_shifts` (`shopfloor_id`, `product_id`, `start_datetime_utc`, `end_datetime_utc` );
CREATE INDEX `tbl_shifts_index_3` ON `myems_production_db`.`tbl_shifts` (`shopfloor_id`, `reference_timestamp`);
CREATE INDEX `tbl_shifts_index_4` ON `myems_production_db`.`tbl_shifts` (`shopfloor_id`, `team_id`);

-- ---------------------------------------------------------------------------------------------------------------------
-- Table `myems_production_db`.`tbl_shopfloor_hourly`
-- ---------------------------------------------------------------------------------------------------------------------
DROP TABLE IF EXISTS `myems_production_db`.`tbl_shopfloor_hourly` ;

CREATE TABLE IF NOT EXISTS `myems_production_db`.`tbl_shopfloor_hourly` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `shopfloor_id` BIGINT NOT NULL,
  `start_datetime_utc` DATETIME NOT NULL,
  `product_id` BIGINT NOT NULL,
  `product_count` DECIMAL(21, 6) NOT NULL,
  PRIMARY KEY (`id`));
CREATE INDEX `tbl_shopfloor_hourly_index_1`
ON `myems_production_db`.`tbl_shopfloor_hourly` (`shopfloor_id`, `product_id`, `start_datetime_utc`);

-- ---------------------------------------------------------------------------------------------------------------------
-- Table `myems_production_db`.`tbl_shopfloors_products`
-- ---------------------------------------------------------------------------------------------------------------------
DROP TABLE IF EXISTS `myems_production_db`.`tbl_shopfloors_products` ;

CREATE TABLE IF NOT EXISTS `myems_production_db`.`tbl_shopfloors_products` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `shopfloor_id` BIGINT NOT NULL,
  `product_id` BIGINT NOT NULL,
  PRIMARY KEY (`id`));

-- ---------------------------------------------------------------------------------------------------------------------
-- Table `myems_production_db`.`tbl_shopfloors_teams`
-- ---------------------------------------------------------------------------------------------------------------------
DROP TABLE IF EXISTS `myems_production_db`.`tbl_shopfloors_teams` ;

CREATE TABLE IF NOT EXISTS `myems_production_db`.`tbl_shopfloors_teams` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `shopfloor_id` BIGINT NOT NULL,
  `team_id` BIGINT NOT NULL,
  PRIMARY KEY (`id`));

-- ---------------------------------------------------------------------------------------------------------------------
-- Table `myems_production_db`.`tbl_space_hourly`
-- ---------------------------------------------------------------------------------------------------------------------
DROP TABLE IF EXISTS `myems_production_db`.`tbl_space_hourly` ;

CREATE TABLE IF NOT EXISTS `myems_production_db`.`tbl_space_hourly` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `space_id` BIGINT NOT NULL,
  `start_datetime_utc` DATETIME NOT NULL,
  `product_id` BIGINT NOT NULL,
  `product_count` DECIMAL(21, 6) NOT NULL,
  PRIMARY KEY (`id`));
CREATE INDEX `tbl_space_hourly_index_1`
ON `myems_production_db`.`tbl_space_hourly` (`space_id`, `product_id`, `start_datetime_utc`);

-- ---------------------------------------------------------------------------------------------------------------------
-- Table `myems_production_db`.`tbl_product_carbon_dictionaries`
-- ---------------------------------------------------------------------------------------------------------------------
DROP TABLE IF EXISTS `myems_production_db`.`tbl_product_carbon_dictionaries` ;

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
CREATE INDEX `tbl_product_carbon_dictionaries_index_1`
ON `myems_production_db`.`tbl_product_carbon_dictionaries` (`enterprise_space_id`, `dict_type`, `is_active`, `sort_order`);

INSERT INTO `myems_production_db`.`tbl_product_carbon_dictionaries` (`uuid`, `enterprise_space_id`, `dict_type`, `name`, `sort_order`, `is_active`, `remark`)
VALUES (UUID(), 0, 'supply_category', '运输类', 1, TRUE, ''),
       (UUID(), 0, 'supply_category', '物料类', 2, TRUE, '');

-- ---------------------------------------------------------------------------------------------------------------------
-- Table `myems_production_db`.`tbl_product_carbon_supplies`
-- ---------------------------------------------------------------------------------------------------------------------
DROP TABLE IF EXISTS `myems_production_db`.`tbl_product_carbon_supplies` ;

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
CREATE INDEX `tbl_product_carbon_supplies_index_1`
ON `myems_production_db`.`tbl_product_carbon_supplies` (`enterprise_space_id`, `category`);
CREATE INDEX `tbl_product_carbon_supplies_index_2`
ON `myems_production_db`.`tbl_product_carbon_supplies` (`enterprise_space_id`, `supplier_name`, `material_name`, `specification`);

-- ---------------------------------------------------------------------------------------------------------------------
-- Table `myems_production_db`.`tbl_product_carbon_footprints`
-- ---------------------------------------------------------------------------------------------------------------------
DROP TABLE IF EXISTS `myems_production_db`.`tbl_product_carbon_footprints` ;

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
CREATE INDEX `tbl_product_carbon_footprints_index_1`
ON `myems_production_db`.`tbl_product_carbon_footprints` (`enterprise_space_id`, `product_id`, `accounting_year`, `data_status`);
CREATE INDEX `tbl_product_carbon_footprints_index_2`
ON `myems_production_db`.`tbl_product_carbon_footprints` (`enterprise_space_id`, `accounting_year`);

-- ---------------------------------------------------------------------------------------------------------------------
-- Table `myems_production_db`.`tbl_product_carbon_activities`
-- ---------------------------------------------------------------------------------------------------------------------
DROP TABLE IF EXISTS `myems_production_db`.`tbl_product_carbon_activities` ;

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
CREATE INDEX `tbl_product_carbon_activities_index_1`
ON `myems_production_db`.`tbl_product_carbon_activities` (`enterprise_space_id`, `footprint_id`, `stage`);
CREATE INDEX `tbl_product_carbon_activities_index_2`
ON `myems_production_db`.`tbl_product_carbon_activities` (`supply_id`);

-- ---------------------------------------------------------------------------------------------------------------------
-- Table `myems_production_db`.`tbl_carbon_assets`
-- ---------------------------------------------------------------------------------------------------------------------
DROP TABLE IF EXISTS `myems_production_db`.`tbl_carbon_assets` ;

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
CREATE INDEX `tbl_carbon_assets_index_1`
ON `myems_production_db`.`tbl_carbon_assets` (`enterprise_space_id`, `space_id`, `accounting_year`);

-- ---------------------------------------------------------------------------------------------------------------------
-- Table `myems_production_db`.`tbl_carbon_asset_monthly_quotas`
-- ---------------------------------------------------------------------------------------------------------------------
DROP TABLE IF EXISTS `myems_production_db`.`tbl_carbon_asset_monthly_quotas` ;

CREATE TABLE IF NOT EXISTS `myems_production_db`.`tbl_carbon_asset_monthly_quotas` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `carbon_asset_id` BIGINT NOT NULL,
  `month_of_year` TINYINT NOT NULL,
  `quota_amount` DECIMAL(21, 6) NOT NULL DEFAULT 0,
  `remark` VARCHAR(255) NOT NULL DEFAULT '',
  PRIMARY KEY (`id`));
CREATE UNIQUE INDEX `tbl_carbon_asset_monthly_quotas_index_1`
ON `myems_production_db`.`tbl_carbon_asset_monthly_quotas` (`carbon_asset_id`, `month_of_year`);

-- ---------------------------------------------------------------------------------------------------------------------
-- Table `myems_production_db`.`tbl_carbon_market_histories`
-- ---------------------------------------------------------------------------------------------------------------------
DROP TABLE IF EXISTS `myems_production_db`.`tbl_carbon_market_histories` ;

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
CREATE UNIQUE INDEX `tbl_carbon_market_histories_index_1`
ON `myems_production_db`.`tbl_carbon_market_histories` (`trade_date`, `market_code`, `variety_code`);


-- ---------------------------------------------------------------------------------------------------------------------
-- Table `myems_production_db`.`tbl_teams`
-- ---------------------------------------------------------------------------------------------------------------------
DROP TABLE IF EXISTS `myems_production_db`.`tbl_teams` ;

CREATE TABLE IF NOT EXISTS `myems_production_db`.`tbl_teams` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(128) NOT NULL,
  `uuid` CHAR(36) NOT NULL,
  `description` VARCHAR(255),
  PRIMARY KEY (`id`));
CREATE INDEX `tbl_teams_index_1` ON `myems_production_db`.`tbl_teams`   (`name`);
