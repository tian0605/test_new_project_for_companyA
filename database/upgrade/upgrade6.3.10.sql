-- ---------------------------------------------------------------------------------------------------------------------
-- WARNING: BACKUP YOUR DATABASE BEFORE UPGRADING
-- THIS SCRIPT IS ONLY FOR UPGRADING 6.3.9 TO 6.3.10
-- THE CURRENT VERSION CAN BE FOUND AT `myems_system_db`.`tbl_versions`
-- ---------------------------------------------------------------------------------------------------------------------

START TRANSACTION;

DROP PROCEDURE IF EXISTS `myems_system_db`.`create_index_if_not_exists`;
DELIMITER $$
CREATE PROCEDURE `myems_system_db`.`create_index_if_not_exists`(
  IN p_schema_name VARCHAR(64),
  IN p_table_name VARCHAR(64),
  IN p_index_name VARCHAR(64),
  IN p_create_sql TEXT
)
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM `information_schema`.`statistics`
    WHERE `table_schema` = p_schema_name
      AND `table_name` = p_table_name
      AND `index_name` = p_index_name
  ) THEN
    SET @create_index_sql = p_create_sql;
    PREPARE stmt FROM @create_index_sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END$$
DELIMITER ;

CREATE TABLE IF NOT EXISTS `myems_production_db`.`tbl_evaluation_rule_sets` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `uuid` CHAR(36) NOT NULL,
  `enterprise_space_id` BIGINT NOT NULL DEFAULT 0,
  `space_id` BIGINT NULL,
  `product_id` BIGINT NULL,
  `rule_set_code` VARCHAR(64) NOT NULL,
  `name` VARCHAR(128) NOT NULL,
  `metric_code` VARCHAR(64) NOT NULL,
  `metric_unit` VARCHAR(32) NOT NULL,
  `benchmark_source` VARCHAR(32) NOT NULL DEFAULT 'fixed',
  `benchmark_value` DECIMAL(21, 6) NOT NULL,
  `benchmark_display_name` VARCHAR(128) NOT NULL DEFAULT '',
  `scope_level` VARCHAR(32) NOT NULL DEFAULT 'platform_default',
  `sort_order` INT NOT NULL DEFAULT 0,
  `is_active` BOOL NOT NULL DEFAULT TRUE,
  `effective_date` DATE NULL,
  `expiry_date` DATE NULL,
  `expression` JSON NULL,
  `remark` VARCHAR(255) NOT NULL DEFAULT '',
  `created_datetime_utc` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_datetime_utc` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`));
CALL `myems_system_db`.`create_index_if_not_exists`('myems_production_db', 'tbl_evaluation_rule_sets', 'tbl_evaluation_rule_sets_index_1', 'CREATE INDEX `tbl_evaluation_rule_sets_index_1` ON `myems_production_db`.`tbl_evaluation_rule_sets` (`enterprise_space_id`, `metric_code`, `is_active`)');
CALL `myems_system_db`.`create_index_if_not_exists`('myems_production_db', 'tbl_evaluation_rule_sets', 'tbl_evaluation_rule_sets_index_2', 'CREATE INDEX `tbl_evaluation_rule_sets_index_2` ON `myems_production_db`.`tbl_evaluation_rule_sets` (`enterprise_space_id`, `product_id`, `space_id`, `metric_code`)');

CREATE TABLE IF NOT EXISTS `myems_production_db`.`tbl_evaluation_rule_details` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `rule_set_id` BIGINT NOT NULL,
  `display_order` INT NOT NULL DEFAULT 0,
  `min_value` DECIMAL(21, 6) NULL,
  `max_value` DECIMAL(21, 6) NULL,
  `min_inclusive` BOOL NOT NULL DEFAULT FALSE,
  `max_inclusive` BOOL NOT NULL DEFAULT FALSE,
  `comparison_side` VARCHAR(32) NOT NULL DEFAULT 'actual',
  `grade_code` VARCHAR(64) NOT NULL,
  `grade_label` VARCHAR(128) NOT NULL DEFAULT '',
  `is_compliant` BOOL NOT NULL,
  `status_text` VARCHAR(32) NOT NULL DEFAULT '',
  `highlight_style` VARCHAR(32) NOT NULL DEFAULT 'normal',
  `evaluation_text` TEXT NOT NULL,
  `advice_text` LONGTEXT NOT NULL,
  `remark` VARCHAR(255) NOT NULL DEFAULT '',
  PRIMARY KEY (`id`));
CALL `myems_system_db`.`create_index_if_not_exists`('myems_production_db', 'tbl_evaluation_rule_details', 'tbl_evaluation_rule_details_index_1', 'CREATE INDEX `tbl_evaluation_rule_details_index_1` ON `myems_production_db`.`tbl_evaluation_rule_details` (`rule_set_id`, `display_order`)');

INSERT INTO `myems_production_db`.`tbl_evaluation_rule_sets`
(`uuid`, `enterprise_space_id`, `space_id`, `product_id`, `rule_set_code`, `name`, `metric_code`, `metric_unit`,
 `benchmark_source`, `benchmark_value`, `benchmark_display_name`, `scope_level`, `sort_order`, `is_active`,
 `effective_date`, `expiry_date`, `expression`, `remark`)
SELECT UUID(), 0, NULL, NULL, 'longyue_recycled_polyester_energy_v20260607', '泷跃废旧涤纶再生项目单位综合能耗评价模板',
       'unit_comprehensive_energy_tce_per_t', 'tce/t', 'fixed', 0.060000, '单位废旧涤纶布料处理量综合能耗基准值',
  'platform_default', 10, TRUE, NULL, NULL, NULL, '平台默认模板，可复制到企业后调整'
WHERE NOT EXISTS (
  SELECT 1 FROM `myems_production_db`.`tbl_evaluation_rule_sets`
  WHERE `enterprise_space_id` = 0 AND `rule_set_code` = 'longyue_recycled_polyester_energy_v20260607'
);

INSERT INTO `myems_production_db`.`tbl_evaluation_rule_sets`
(`uuid`, `enterprise_space_id`, `space_id`, `product_id`, `rule_set_code`, `name`, `metric_code`, `metric_unit`,
 `benchmark_source`, `benchmark_value`, `benchmark_display_name`, `scope_level`, `sort_order`, `is_active`,
 `effective_date`, `expiry_date`, `expression`, `remark`)
SELECT UUID(), 0, NULL, NULL, 'longyue_recycled_polyester_carbon_v20260607', '泷跃废旧涤纶再生项目单位碳排放评价模板',
       'unit_carbon_tco2_per_t', 'tCO2/t', 'fixed', 0.290000, '单位废旧涤纶布料处理量二氧化碳排放量基准值',
  'platform_default', 20, TRUE, NULL, NULL, NULL, '平台默认模板，可复制到企业后调整'
WHERE NOT EXISTS (
  SELECT 1 FROM `myems_production_db`.`tbl_evaluation_rule_sets`
  WHERE `enterprise_space_id` = 0 AND `rule_set_code` = 'longyue_recycled_polyester_carbon_v20260607'
);

UPDATE `myems_production_db`.`tbl_evaluation_rule_sets`
SET `effective_date` = NULL
WHERE `enterprise_space_id` = 0
  AND `scope_level` = 'platform_default'
  AND `rule_set_code` IN ('longyue_recycled_polyester_energy_v20260607',
                          'longyue_recycled_polyester_carbon_v20260607');

SET @energy_rule_set_id = (
  SELECT `id` FROM `myems_production_db`.`tbl_evaluation_rule_sets`
  WHERE `enterprise_space_id` = 0 AND `rule_set_code` = 'longyue_recycled_polyester_energy_v20260607'
  LIMIT 1
);

INSERT INTO `myems_production_db`.`tbl_evaluation_rule_details`
(`rule_set_id`, `display_order`, `min_value`, `max_value`, `min_inclusive`, `max_inclusive`, `comparison_side`,
 `grade_code`, `grade_label`, `is_compliant`, `status_text`, `highlight_style`, `evaluation_text`, `advice_text`, `remark`)
SELECT @energy_rule_set_id, `display_order`, `min_value`, `max_value`, `min_inclusive`, `max_inclusive`, 'actual',
       `grade_code`, `grade_label`, `is_compliant`, `status_text`, `highlight_style`, `evaluation_text`, `advice_text`, ''
FROM (
  SELECT 10 AS `display_order`, NULL AS `min_value`, 0.030000 AS `max_value`, FALSE AS `min_inclusive`, FALSE AS `max_inclusive`, 'below_50_plus' AS `grade_code`, '低于基准50%以上' AS `grade_label`, TRUE AS `is_compliant`, '达标' AS `status_text`, 'success' AS `highlight_style`, '单位废旧涤纶布料处理量综合能耗达标，属于极致领先行业水平，用电效率达到国际先进' AS `evaluation_text`, '1. 总结节能技术与管理经验，向行业输出\n2. 参与废旧涤纶再生行业能耗标准制定\n3. 开展低温熔融再生工艺试验，从源头降低挤出机电加热能耗\n4. 探索光伏+储能微电网建设，实现部分时段零外购电' AS `advice_text`
  UNION ALL SELECT 20, 0.030000, 0.048000, TRUE, FALSE, 'below_20_50', '低于基准20%-50%', TRUE, '达标', 'success', '单位废旧涤纶布料处理量综合能耗达标，属于行业顶尖用电水平，工艺与设备配置先进', '1. 建立节能管理标准化体系，申报省级绿色工厂\n2. 建设厂区分布式光伏项目，优先自发自用，降低外购电量\n3. 全面排查压缩空气、循环水管网跑冒滴漏，减少无效用电'
  UNION ALL SELECT 30, 0.048000, 0.054000, TRUE, FALSE, 'below_10_20', '低于基准10%-20%', TRUE, '达标', 'success', '单位废旧涤纶布料处理量综合能耗达标，属于显著领先行业标杆水平，节能管理体系运行有效', '1. 全生产线推广挤出机分段精准温控技术，避免超温空烧\n2. 回收挤出机冷却水余热用于原料预烘干，替代电加热烘干\n3. 车间照明全部更换为LED并加装人体感应与分时控制'
  UNION ALL SELECT 40, 0.054000, 0.057000, TRUE, FALSE, 'below_5_10', '低于基准5%-10%', TRUE, '达标', 'success', '单位废旧涤纶布料处理量综合能耗达标，属于中等领先行业标杆水平，核心工序用电效率较高', '1. 固化现有先进用电操作流程，形成标准化作业指导书\n2. 对摩擦聚粒机、挤出机进行月度预防性维保，更换磨损轴承\n3. 稳定原料含水率在3%-5%最优区间，减少电加热能耗波动'
  UNION ALL SELECT 50, 0.057000, 0.060000, TRUE, FALSE, 'below_0_5', '低于基准5%以内', TRUE, '达标', 'success', '单位废旧涤纶布料处理量综合能耗达标，属于小幅领先行业标杆水平，整体用电管控良好，无明显浪费', '1. 维持现有生产调度与设备运行参数，每日监控单台设备用电波动\n2. 排查设备空载、保温层微小破损等临时高耗点\n3. 建立班组日用电比对机制，及时纠正微小用电偏差'
  UNION ALL SELECT 60, 0.060000, 0.060000, TRUE, TRUE, 'equal_benchmark', '等于基准', TRUE, '达标', 'normal', '单位废旧涤纶布料处理量综合能耗达标，能源利用率处于行业一般水平，存在精细化节能空间', '1. 安装分工序用电计量装置，拆分破碎、摩擦聚粒、熔融挤出、公用工程单耗\n2. 定位高耗设备，制定技改计划\n3. 优化生产排班，增加谷段电价生产时长，降低用电成本'
  UNION ALL SELECT 70, 0.060000, 0.063000, FALSE, TRUE, 'above_0_5', '高于基准5%以内', FALSE, '不达标', 'danger', '单位废旧涤纶布料处理量综合能耗不达标，属于轻微超标，多为临时因素导致', '1. 立即排查临时高耗原因（设备带病运行、原料杂质突增、频繁启停）\n2. 加强班组用电考核，杜绝设备空转、长明灯等浪费行为\n3. 调整生产计划，避免小批量零散生产'
  UNION ALL SELECT 80, 0.063000, 0.066000, FALSE, TRUE, 'above_5_10', '高于基准5%-10%', FALSE, '不达标', 'danger', '单位废旧涤纶布料处理量综合能耗不达标，属于轻度超标，设备或工艺参数存在偏差', '1. 校准摩擦聚粒机辊间隙、转速，优化挤出机各加热段温度设定\n2. 更换老化的设备密封件、轴承，减少机械摩擦损耗\n3. 修补设备保温层破损部位，降低筒体热量散失'
  UNION ALL SELECT 90, 0.066000, 0.072000, FALSE, TRUE, 'above_10_20', '高于基准10%-20%', FALSE, '不达标', 'danger', '单位废旧涤纶布料处理量综合能耗不达标，属于中度超标，局部工序或公用工程存在明显浪费', '1. 将挤出机老式电阻圈加热更换为电磁感应加热，节电率20%-30%\n2. 空压机、循环水泵加装变频控制系统，根据负荷自动调节功率\n3. 增设原料风选筛分装置，提前剔除杂质，减少无效摩擦用电'
  UNION ALL SELECT 100, 0.072000, 0.090000, FALSE, TRUE, 'above_20_50', '高于基准20%-50%', FALSE, '不达标', 'danger', '单位废旧涤纶布料处理量综合能耗不达标，属于重度超标，核心设备存在系统性问题', '1. 更换老旧高能耗摩擦聚粒机、挤出机，选用节能型专用设备\n2. 建设挤出机机头废气余热回收系统，用于原料预烘干\n3. 实现连续化规模化生产，减少设备启停次数'
  UNION ALL SELECT 110, 0.090000, NULL, FALSE, FALSE, 'above_50_plus', '高于基准50%以上', FALSE, '不达标', 'danger', '单位废旧涤纶布料处理量综合能耗不达标，属于严重超标，生产工艺与装备整体落后', '1. 立即停产整改，全面排查所有用电环节\n2. 淘汰全部落后产能，采用行业先进的废旧涤纶连续再生工艺\n3. 委托专业节能服务机构开展能源审计，制定系统性技改方案\n4. 建立严格的用电管控体系，明确各岗位节能责任'
) seed
WHERE NOT EXISTS (
  SELECT 1 FROM `myems_production_db`.`tbl_evaluation_rule_details`
  WHERE `rule_set_id` = @energy_rule_set_id AND `grade_code` = seed.`grade_code`
);

SET @carbon_rule_set_id = (
  SELECT `id` FROM `myems_production_db`.`tbl_evaluation_rule_sets`
  WHERE `enterprise_space_id` = 0 AND `rule_set_code` = 'longyue_recycled_polyester_carbon_v20260607'
  LIMIT 1
);

INSERT INTO `myems_production_db`.`tbl_evaluation_rule_details`
(`rule_set_id`, `display_order`, `min_value`, `max_value`, `min_inclusive`, `max_inclusive`, `comparison_side`,
 `grade_code`, `grade_label`, `is_compliant`, `status_text`, `highlight_style`, `evaluation_text`, `advice_text`, `remark`)
SELECT @carbon_rule_set_id, `display_order`, `min_value`, `max_value`, `min_inclusive`, `max_inclusive`, 'actual',
       `grade_code`, `grade_label`, `is_compliant`, `status_text`, `highlight_style`, `evaluation_text`, `advice_text`, ''
FROM (
  SELECT 10 AS `display_order`, NULL AS `min_value`, 0.145000 AS `max_value`, FALSE AS `min_inclusive`, FALSE AS `max_inclusive`, 'below_50_plus' AS `grade_code`, '低于基准50%以上' AS `grade_label`, TRUE AS `is_compliant`, '达标' AS `status_text`, 'success' AS `highlight_style`, '单位废旧涤纶布料处理量二氧化碳排放量达标，属于极致领先行业水平，接近零碳生产' AS `evaluation_text`, '1. 总结低碳技术与管理经验，参与行业碳排放标准制定\n2. 建设光伏+储能微电网，实现生产用电100%清洁能源\n3. 打造全链条低碳供应链，要求上游回收商采用低碳运输方式\n4. 探索虚拟电厂参与电网调峰，获取额外碳减排量' AS `advice_text`
  UNION ALL SELECT 20, 0.145000, 0.232000, TRUE, FALSE, 'below_20_50', '低于基准20%-50%', TRUE, '达标', 'success', '单位废旧涤纶布料处理量二氧化碳排放量达标，属于行业顶尖低碳水平', '1. 建设厂区分布式光伏项目，实现自发自用比例不低于50%\n2. 申报绿色再生产品认证，提升产品低碳附加值\n3. 购买绿证抵消剩余火电碳排放'
  UNION ALL SELECT 30, 0.232000, 0.261000, TRUE, FALSE, 'below_10_20', '低于基准10%-20%', TRUE, '达标', 'success', '单位废旧涤纶布料处理量二氧化碳排放量达标，属于显著领先行业标杆水平', '1. 建立分环节碳足迹台账，识别高碳用电设备\n2. 提高涤纶边角料内部循环回用率，减少外购新料隐含碳排放\n3. 大功率设备优先安排在绿电时段运行'
  UNION ALL SELECT 40, 0.261000, 0.275500, TRUE, FALSE, 'below_5_10', '低于基准5%-10%', TRUE, '达标', 'success', '单位废旧涤纶布料处理量二氧化碳排放量达标，属于中等领先行业标杆水平', '1. 固化现有低碳操作流程，减少不必要的能源消耗\n2. 逐年提升绿电采购比例5%-10%\n3. 筛选低碳型加工助剂，替代部分高碳基润滑剂'
  UNION ALL SELECT 50, 0.275500, 0.290000, TRUE, FALSE, 'below_0_5', '低于基准5%以内', TRUE, '达标', 'success', '单位废旧涤纶布料处理量二氧化碳排放量达标，属于小幅领先行业标杆水平，整体碳管控良好', '1. 维持现有用电模式与绿电采购比例\n2. 排查临时高碳环节（如备用柴油发电机启用）\n3. 优化原料运输路线，降低运输隐含碳排放'
  UNION ALL SELECT 60, 0.290000, 0.290000, TRUE, TRUE, 'equal_benchmark', '等于基准', TRUE, '达标', 'normal', '单位废旧涤纶布料处理量二氧化碳排放量达标，碳排强度处于行业一般水平', '1. 建立分设备碳排放核算体系，重点监控大功率挤出机组\n2. 开始小批量采购绿电，逐步降低火电用电占比\n3. 同步开展工艺节能技改，从源头减少用电量'
  UNION ALL SELECT 70, 0.290000, 0.304500, FALSE, TRUE, 'above_0_5', '高于基准5%以内', FALSE, '不达标', 'danger', '单位废旧涤纶布料处理量二氧化碳排放量不达标，属于轻微超标，多为临时因素导致', '1. 立即排查临时高碳原因（绿电采购中断、设备异常高耗）\n2. 减少非必要的高耗能设备运行时间\n3. 临时增加绿电采购量抵消超标排放'
  UNION ALL SELECT 80, 0.304500, 0.319000, FALSE, TRUE, 'above_5_10', '高于基准5%-10%', FALSE, '不达标', 'danger', '单位废旧涤纶布料处理量二氧化碳排放量不达标，属于轻度超标', '1. 优化挤出机、摩擦聚粒机运行参数，降低单位产品用电量\n2. 将火电用电占比降低10%，增加绿电采购量\n3. 更换部分高碳辅料，选用低碳型替代品'
  UNION ALL SELECT 90, 0.319000, 0.348000, FALSE, TRUE, 'above_10_20', '高于基准10%-20%', FALSE, '不达标', 'danger', '单位废旧涤纶布料处理量二氧化碳排放量不达标，属于中度超标', '1. 实施挤出机电磁感应加热改造，节电20%以上\n2. 将绿电采购占比提升至30%以上\n3. 空压机、循环水泵加装变频控制系统，降低公用工程用电'
  UNION ALL SELECT 100, 0.348000, 0.435000, FALSE, TRUE, 'above_20_50', '高于基准20%-50%', FALSE, '不达标', 'danger', '单位废旧涤纶布料处理量二氧化碳排放量不达标，属于重度超标', '1. 更换全部老旧高能耗设备，选用一级能效产品\n2. 将绿电采购占比提升至50%以上\n3. 建立碳减排目标责任制，将降碳指标分解到各班组'
  UNION ALL SELECT 110, 0.435000, NULL, FALSE, FALSE, 'above_50_plus', '高于基准50%以上', FALSE, '不达标', 'danger', '单位废旧涤纶布料处理量二氧化碳排放量不达标，属于严重超标', '1. 立即停产整改，全面排查碳排放全链条\n2. 实施系统性节能技改，将单位产品用电量降低50%以上\n3. 委托专业机构开展碳足迹核查，制定三年零碳转型方案\n4. 全部生产用电改为绿电直供，彻底消除火电间接排放'
) seed
WHERE NOT EXISTS (
  SELECT 1 FROM `myems_production_db`.`tbl_evaluation_rule_details`
  WHERE `rule_set_id` = @carbon_rule_set_id AND `grade_code` = seed.`grade_code`
);

INSERT INTO `myems_system_db`.`tbl_menus` (`id`, `name`, `route`, `parent_menu_id`, `is_hidden`)
SELECT 117, 'Space Evaluation', '/space/evaluation', 100, 0
WHERE NOT EXISTS (
  SELECT 1 FROM `myems_system_db`.`tbl_menus` WHERE `id` = 117 OR `route` = '/space/evaluation'
);

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
  '$.admin_routes',
  JSON_ARRAY_APPEND(IFNULL(JSON_EXTRACT(`data`, '$.admin_routes'), JSON_ARRAY()), '$', 'settings.evaluationrule')
)
WHERE `id` IN (1, 2)
  AND JSON_SEARCH(IFNULL(JSON_EXTRACT(`data`, '$.admin_routes'), JSON_ARRAY()), 'one', 'settings.evaluationrule') IS NULL;

UPDATE `myems_user_db`.`tbl_menu_templates`
SET `data` = JSON_SET(
  `data`,
  '$.web_routes',
  JSON_ARRAY_APPEND(IFNULL(JSON_EXTRACT(`data`, '$.web_routes'), JSON_ARRAY()), '$', '/space/evaluation')
)
WHERE `id` IN (1, 2, 3)
  AND JSON_SEARCH(IFNULL(JSON_EXTRACT(`data`, '$.web_routes'), JSON_ARRAY()), 'one', '/space/evaluation') IS NULL;

UPDATE `myems_system_db`.`tbl_versions`
SET version='6.3.10', release_date='2026-06-10'
WHERE id=1;

DROP PROCEDURE IF EXISTS `myems_system_db`.`create_index_if_not_exists`;

COMMIT;