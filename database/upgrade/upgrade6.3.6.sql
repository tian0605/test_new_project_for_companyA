ALTER TABLE `myems_system_db`.`tbl_meters`
ADD COLUMN `product_id` BIGINT AFTER `energy_item_id`;

CREATE INDEX `tbl_meters_index_4`
ON `myems_system_db`.`tbl_meters` (`product_id`);

ALTER TABLE `myems_system_db`.`tbl_offline_meters`
ADD COLUMN `product_id` BIGINT AFTER `energy_category_id`;

CREATE INDEX `tbl_offline_meters_index_4`
ON `myems_system_db`.`tbl_offline_meters` (`product_id`);

ALTER TABLE `myems_energy_baseline_db`.`tbl_space_input_category_hourly`
ADD COLUMN `product_id` BIGINT AFTER `energy_category_id`;

CREATE INDEX `tbl_space_input_category_hourly_index_2`
ON `myems_energy_baseline_db`.`tbl_space_input_category_hourly` (`product_id`);

ALTER TABLE `myems_energy_plan_db`.`tbl_space_input_category_hourly`
ADD COLUMN `product_id` BIGINT AFTER `energy_category_id`;

CREATE INDEX `tbl_space_input_category_hourly_index_2`
ON `myems_energy_plan_db`.`tbl_space_input_category_hourly` (`product_id`);

ALTER TABLE `myems_energy_prediction_db`.`tbl_space_input_category_hourly`
ADD COLUMN `product_id` BIGINT AFTER `energy_category_id`;

CREATE INDEX `tbl_space_input_category_hourly_index_2`
ON `myems_energy_prediction_db`.`tbl_space_input_category_hourly` (`product_id`);

CREATE TABLE IF NOT EXISTS `myems_system_db`.`tbl_spaces_products` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `space_id` BIGINT NOT NULL,
  `product_id` BIGINT NOT NULL,
  PRIMARY KEY (`id`));

CREATE INDEX `tbl_spaces_products_index_1`
ON `myems_system_db`.`tbl_spaces_products` (`space_id`);

CREATE INDEX `tbl_spaces_products_index_2`
ON `myems_system_db`.`tbl_spaces_products` (`product_id`);