"""
MyEMS Aggregation Service - Baseline Space Energy Input Category Wrapper

This module reuses the existing space energy aggregation logic but runs it against
the baseline energy database. The result is a parallel bridge that keeps
myems_energy_baseline_db.tbl_space_input_category_hourly populated without
changing the existing report logic.
"""

import config
import space_energy_input_category


def _run_with_baseline_energy_db(target, *args, **kwargs):
    original_energy_db = config.myems_energy_db
    config.myems_energy_db = config.myems_energy_baseline_db
    try:
        return target(*args, **kwargs)
    finally:
        config.myems_energy_db = original_energy_db


def main(logger):
    return _run_with_baseline_energy_db(space_energy_input_category.main, logger)


def worker(space):
    return _run_with_baseline_energy_db(space_energy_input_category.worker, space)