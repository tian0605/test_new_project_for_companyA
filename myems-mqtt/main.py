# pyright: reportUnknownVariableType=false, reportUnknownMemberType=false, reportUnknownArgumentType=false, reportUnknownParameterType=false, reportAssignmentType=false, reportAttributeAccessIssue=false

import json
import logging
import time
from logging.handlers import RotatingFileHandler
from multiprocessing import Process

import mysql.connector

import acquisition
import config
import gateway


SUPPORTED_PROTOCOL_FILTER = (
    " (ds.protocol = 'mqtt' OR ds.protocol = 'dtu-mqtt' OR ds.protocol LIKE 'mqtt-%') "
)


def main():
    logger = logging.getLogger('myems-mqtt')
    logger.setLevel(getattr(logging, config.service['log_level'].upper(), logging.INFO))

    file_handler = RotatingFileHandler('myems-mqtt.log', maxBytes=1024 * 1024, backupCount=1)
    formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
    file_handler.setFormatter(formatter)
    logger.addHandler(file_handler)
    logger.addHandler(logging.StreamHandler())

    Process(target=gateway.process, args=(logger,)).start()

    data_source_list = _load_data_sources(logger)
    for data_source in data_source_list:
        logger.info('MQTT data source discovered: id=%s name=%s', data_source['id'], data_source['name'])
        Process(target=acquisition.process, args=(logger, data_source['id'], data_source['broker_config'])).start()


def _load_data_sources(logger):
    while True:
        cnx_system_db = None
        cursor_system_db = None
        try:
            cnx_system_db = mysql.connector.connect(**config.myems_system_db)
            cursor_system_db = cnx_system_db.cursor()
            query = (
                ' SELECT ds.id, ds.name, ds.connection '
                ' FROM tbl_data_sources ds, tbl_gateways g '
                ' WHERE ' + SUPPORTED_PROTOCOL_FILTER + ' AND ds.gateway_id = g.id AND g.id = %s AND g.token = %s '
                ' ORDER BY ds.id '
            )
            cursor_system_db.execute(query, (config.gateway['id'], config.gateway['token']))
            rows_data_source = cursor_system_db.fetchall()

            cursor_system_db.execute(
                ' UPDATE tbl_data_sources ds, tbl_gateways g '
                ' SET ds.process_id = NULL '
                ' WHERE ' + SUPPORTED_PROTOCOL_FILTER + ' AND ds.gateway_id = g.id AND g.id = %s AND g.token = %s ',
                (config.gateway['id'], config.gateway['token']),
            )
            cnx_system_db.commit()
        except Exception as exc:
            logger.error('Error in main process %s', exc)
            time.sleep(60)
            continue
        finally:
            if cursor_system_db:
                cursor_system_db.close()
            if cnx_system_db:
                cnx_system_db.close()

        if not rows_data_source:
            logger.error('MQTT data source not found, wait for minutes to retry.')
            time.sleep(60)
            continue

        valid_data_sources = []
        for row in rows_data_source:
            try:
                broker_config = _parse_connection(row[2])
            except Exception as exc:
                logger.error('Invalid connection JSON for data source %s: %s', row[0], exc)
                continue
            valid_data_sources.append({'id': row[0], 'name': row[1], 'broker_config': broker_config})
        if valid_data_sources:
            return valid_data_sources


def _parse_connection(connection):
    if connection is None or len(connection) == 0:
        raise ValueError('Data source connection not found')

    broker_config = json.loads(connection)
    if 'host' not in broker_config or not broker_config['host']:
        raise ValueError('host is required')
    if 'port' not in broker_config or not isinstance(broker_config['port'], int):
        raise ValueError('port must be an integer')
    if broker_config['port'] < 1 or broker_config['port'] > 65535:
        raise ValueError('port is out of range')
    if 'topic' not in broker_config and 'topics' not in broker_config:
        raise ValueError('topic or topics is required')
    return broker_config


if __name__ == '__main__':
    main()