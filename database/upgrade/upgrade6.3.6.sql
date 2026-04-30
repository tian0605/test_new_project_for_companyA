ALTER TABLE `myems_system_db`.`tbl_meters`
ADD COLUMN `product_id` BIGINT AFTER `energy_item_id`;

CREATE INDEX `tbl_meters_index_4`
ON `myems_system_db`.`tbl_meters` (`product_id`);

CREATE TABLE IF NOT EXISTS `myems_system_db`.`tbl_spaces_products` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `space_id` BIGINT NOT NULL,
  `product_id` BIGINT NOT NULL,
  PRIMARY KEY (`id`));

CREATE INDEX `tbl_spaces_products_index_1`
ON `myems_system_db`.`tbl_spaces_products` (`space_id`);

CREATE INDEX `tbl_spaces_products_index_2`
ON `myems_system_db`.`tbl_spaces_products` (`product_id`);