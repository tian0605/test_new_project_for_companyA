-- ---------------------------------------------------------------------------------------------------------------------
-- 警告：升级前备份数据库
-- WARNING: BACKUP YOUR DATABASE BEFORE UPGRADING
-- 此脚本仅用于将6.3.0升级到6.3.1
-- THIS SCRIPT IS ONLY FOR UPGRADING 6.3.0 TO 6.3.1
-- 当前版本号在`myems_system_db`.`tbl_versions`中查看
-- THE CURRENT VERSION CAN BE FOUND AT `myems_system_db`.`tbl_versions`
-- ---------------------------------------------------------------------------------------------------------------------

START TRANSACTION;

ALTER TABLE `myems_user_db`.`tbl_users`
ADD COLUMN `enterprise_space_id` BIGINT NULL AFTER `privilege_id`;

ALTER TABLE `myems_system_db`.`tbl_cost_centers`
ADD COLUMN `enterprise_space_id` BIGINT NULL AFTER `external_id`;

CREATE INDEX `tbl_cost_centers_index_2`
ON `myems_system_db`.`tbl_cost_centers` (`enterprise_space_id`);

WITH RECURSIVE `space_enterprise_map` AS (
	SELECT `id`, `id` AS `enterprise_space_id`
	FROM `myems_system_db`.`tbl_spaces`
	WHERE `parent_space_id` = 1

	UNION ALL

	SELECT `child`.`id`, `parent`.`enterprise_space_id`
	FROM `myems_system_db`.`tbl_spaces` AS `child`
	INNER JOIN `space_enterprise_map` AS `parent` ON `child`.`parent_space_id` = `parent`.`id`
),
`cost_center_enterprise_candidates` AS (
	SELECT `s`.`cost_center_id`, `m`.`enterprise_space_id`
	FROM `myems_system_db`.`tbl_spaces` AS `s`
	INNER JOIN `space_enterprise_map` AS `m` ON `s`.`id` = `m`.`id`
	WHERE `s`.`cost_center_id` IS NOT NULL
	GROUP BY `s`.`cost_center_id`, `m`.`enterprise_space_id`
),
`cost_center_enterprise_backfill` AS (
	SELECT `cost_center_id`, MIN(`enterprise_space_id`) AS `enterprise_space_id`
	FROM `cost_center_enterprise_candidates`
	GROUP BY `cost_center_id`
	HAVING COUNT(*) = 1
)
UPDATE `myems_system_db`.`tbl_cost_centers` AS `cc`
INNER JOIN `cost_center_enterprise_backfill` AS `backfill` ON `backfill`.`cost_center_id` = `cc`.`id`
SET `cc`.`enterprise_space_id` = `backfill`.`enterprise_space_id`
WHERE `cc`.`enterprise_space_id` IS NULL;

UPDATE `myems_system_db`.`tbl_versions` SET version='6.3.1', release_date='2026-04-18' WHERE id=1;

COMMIT;