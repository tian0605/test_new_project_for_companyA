# pyright: reportUnknownVariableType=false, reportUnknownMemberType=false, reportUnknownArgumentType=false, reportUnknownParameterType=false, reportAssignmentType=false, reportAttributeAccessIssue=false

import time
from datetime import datetime

import mysql.connector
import schedule

import config


def job(logger):
    cnx_system_db = None
    cursor_system_db = None
    try:
        cnx_system_db = mysql.connector.connect(**config.myems_system_db)
        cursor_system_db = cnx_system_db.cursor()
        cursor_system_db.execute(
            ' SELECT name FROM tbl_gateways WHERE id = %s AND token = %s ',
            (config.gateway['id'], config.gateway['token']),
        )
        row = cursor_system_db.fetchone()
        if row is None:
            logger.error('Gateway not found for id=%s', config.gateway['id'])
            return

        current_datetime_utc = datetime.utcnow().isoformat()
        cursor_system_db.execute(
            ' UPDATE tbl_gateways SET last_seen_datetime_utc = %s WHERE id = %s ',
            (current_datetime_utc, config.gateway['id']),
        )
        cnx_system_db.commit()
    except Exception as exc:
        logger.error('Error in gateway process: %s', exc)
    finally:
        if cursor_system_db:
            cursor_system_db.close()
        if cnx_system_db:
            cnx_system_db.close()


def process(logger):
    schedule.every(3).minutes.do(job, logger)
    while True:
        schedule.run_pending()
        time.sleep(60)