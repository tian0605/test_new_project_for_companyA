from datetime import datetime, timedelta, timezone
from decimal import Decimal

import falcon
import mysql.connector
import simplejson as json

import config
import excelexporters.spaceevaluation
from core import utilities
from core.evaluationengine import evaluate_metric
from core.useractivity import access_control, api_key_control, get_request_context_value
from reports.productreporting import (
    ensure_request_space_visible,
    ensure_space_product_bound,
    get_dimension_hourly_rows,
    get_energy_category_ids_for_sources,
    get_space_product_energy_sources,
)


METRIC_DEFINITIONS = {
    'unit_comprehensive_energy_tce_per_t': {
        'name': 'Per Unit Product Energy Consumption',
        'unit': 'TCE/T',
    },
    'unit_carbon_tco2_per_t': {
        'name': 'Per Unit Product Carbon Dioxide Emissions',
        'unit': 'TCO2E/T',
    },
}


class Reporting:
    @staticmethod
    def on_options(req, resp):
        _ = req
        resp.status = falcon.HTTP_200

    @staticmethod
    def on_get(req, resp):
        if 'API-KEY' not in req.headers or \
                not isinstance(req.headers['API-KEY'], str) or \
                len(str.strip(req.headers['API-KEY'])) == 0:
            access_control(req)
        else:
            api_key_control(req)

        space_id = _positive_int(req.params.get('spaceid'), 'API.INVALID_SPACE_ID')
        product_id = _positive_int(req.params.get('productid'), 'API.INVALID_PRODUCT_ID')
        period_type = req.params.get('periodtype') or 'daily'
        if period_type not in ('hourly', 'daily', 'weekly', 'monthly', 'yearly'):
            raise falcon.HTTPError(status=falcon.HTTP_400, title='API.BAD_REQUEST',
                                   description='API.INVALID_PERIOD_TYPE')
        language = req.params.get('language')
        reporting_period_start_datetime_local = req.params.get('reportingperiodstartdatetime')
        reporting_period_end_datetime_local = req.params.get('reportingperiodenddatetime')

        ensure_request_space_visible(req, space_id)
        timezone_offset = _timezone_offset_minutes()
        reporting_start_datetime_utc = _parse_local_datetime(reporting_period_start_datetime_local,
                                                             timezone_offset,
                                                             'API.INVALID_REPORTING_PERIOD_START_DATETIME')
        reporting_end_datetime_utc = _parse_local_datetime(reporting_period_end_datetime_local,
                                                           timezone_offset,
                                                           'API.INVALID_REPORTING_PERIOD_END_DATETIME')
        if reporting_start_datetime_utc >= reporting_end_datetime_utc:
            raise falcon.HTTPError(status=falcon.HTTP_400, title='API.BAD_REQUEST',
                                   description='API.INVALID_REPORTING_PERIOD')

        report = _build_report(req,
                               space_id,
                               product_id,
                               period_type,
                               reporting_start_datetime_utc,
                               reporting_end_datetime_utc,
                               timezone_offset)
        report['excel_bytes_base64'] = excelexporters.spaceevaluation.export(
            report,
            report['space']['name'],
            reporting_period_start_datetime_local,
            reporting_period_end_datetime_local,
            period_type,
            language,
        )
        resp.text = json.dumps(report)


def _positive_int(value, error):
    if value is None:
        raise falcon.HTTPError(status=falcon.HTTP_400, title='API.BAD_REQUEST', description=error)
    value = str.strip(value)
    if not value.isdigit() or int(value) <= 0:
        raise falcon.HTTPError(status=falcon.HTTP_400, title='API.BAD_REQUEST', description=error)
    return int(value)


def _timezone_offset_minutes():
    timezone_offset = int(config.utc_offset[1:3]) * 60 + int(config.utc_offset[4:6])
    if config.utc_offset[0] == '-':
        timezone_offset = -timezone_offset
    return timezone_offset


def _parse_local_datetime(value, timezone_offset, error):
    if value is None or len(str.strip(value)) == 0:
        raise falcon.HTTPError(status=falcon.HTTP_400, title='API.BAD_REQUEST', description=error)
    try:
        result = datetime.strptime(str.strip(value), '%Y-%m-%dT%H:%M:%S')
    except ValueError:
        raise falcon.HTTPError(status=falcon.HTTP_400, title='API.BAD_REQUEST', description=error)
    result = result.replace(tzinfo=timezone.utc) - timedelta(minutes=timezone_offset)
    if config.minutes_to_count == 30 and result.minute >= 30:
        return result.replace(minute=30, second=0, microsecond=0)
    return result.replace(minute=0, second=0, microsecond=0)


def _build_report(req,
                  space_id,
                  product_id,
                  period_type,
                  reporting_start_datetime_utc,
                  reporting_end_datetime_utc,
                  timezone_offset):
    cnx_system = None
    cnx_production = None
    cnx_energy = None
    cursor_system = None
    cursor_production = None
    cursor_energy = None
    try:
        cnx_system = mysql.connector.connect(**config.myems_system_db)
        cnx_production = mysql.connector.connect(**config.myems_production_db)
        cnx_energy = mysql.connector.connect(**config.myems_energy_db)
        cursor_system = cnx_system.cursor()
        cursor_production = cnx_production.cursor()
        cursor_energy = cnx_energy.cursor()

        space = _query_space(cursor_system, space_id)
        product = _query_product(cursor_production, product_id)
        ensure_space_product_bound(cursor_system, space_id, product_id)
        energy_sources = get_space_product_energy_sources(cursor_system, space_id, product_id)
        energy_category_ids = get_energy_category_ids_for_sources(energy_sources)
        energy_categories = _query_energy_categories(cursor_system, energy_category_ids)

        production_rows = _query_production_hourly(cursor_production,
                                                   space_id,
                                                   product_id,
                                                   reporting_start_datetime_utc,
                                                   reporting_end_datetime_utc)
        production_period_rows = utilities.aggregate_hourly_data_by_period(production_rows,
                                                                           reporting_start_datetime_utc,
                                                                           reporting_end_datetime_utc,
                                                                           period_type)
        energy_rows_by_category = get_dimension_hourly_rows(cursor_energy,
                                                            energy_sources,
                                                            reporting_start_datetime_utc,
                                                            reporting_end_datetime_utc)
        category_period_values = _aggregate_energy_by_category(energy_rows_by_category,
                                                               reporting_start_datetime_utc,
                                                               reporting_end_datetime_utc,
                                                               period_type,
                                                               energy_categories)
    finally:
        if cursor_system:
            cursor_system.close()
        if cursor_production:
            cursor_production.close()
        if cursor_energy:
            cursor_energy.close()
        if cnx_system:
            cnx_system.close()
        if cnx_production:
            cnx_production.close()
        if cnx_energy:
            cnx_energy.close()

    total_production = Decimal(0)
    for _, production_value in production_period_rows:
        if production_value is not None:
            total_production += production_value

    total_energy_kgce = Decimal(0)
    total_carbon_kgco2e = Decimal(0)
    for category in category_period_values.values():
        total_energy_kgce += category['subtotal_in_kgce']
        total_carbon_kgco2e += category['subtotal_in_kgco2e']

    unit_energy_tce_per_t = total_energy_kgce / Decimal(1000) / total_production \
        if total_production > Decimal(0) else None
    unit_carbon_tco2_per_t = total_carbon_kgco2e / Decimal(1000) / total_production \
        if total_production > Decimal(0) else None

    enterprise_space_id = get_request_context_value(req, 'enterprise_space_id')
    if enterprise_space_id is None:
        enterprise_space_id = space.get('enterprise_space_id')

    evaluations = []
    for metric_code, actual_value in (
            ('unit_comprehensive_energy_tce_per_t', unit_energy_tce_per_t),
            ('unit_carbon_tco2_per_t', unit_carbon_tco2_per_t),
    ):
        metric_evaluation = evaluate_metric(metric_code=metric_code,
                                            actual_value=actual_value,
                                            enterprise_space_id=enterprise_space_id,
                                            space_id=space_id,
                                            product_id=product_id,
                                            report_date=reporting_end_datetime_utc)
        metric_evaluation['metric_name'] = METRIC_DEFINITIONS[metric_code]['name']
        metric_evaluation['metric_unit'] = METRIC_DEFINITIONS[metric_code]['unit']
        evaluations.append(metric_evaluation)

    return {
        'report_context': {
            'period_type': period_type,
            'reporting_start_datetime_utc': reporting_start_datetime_utc.isoformat()[0:19],
            'reporting_end_datetime_utc': reporting_end_datetime_utc.isoformat()[0:19],
        },
        'space': space,
        'product': product,
        'summary': {
            'total_production': total_production,
            'total_energy_kgce': total_energy_kgce,
            'total_carbon_kgco2e': total_carbon_kgco2e,
            'unit_comprehensive_energy_tce_per_t': unit_energy_tce_per_t,
            'unit_carbon_tco2_per_t': unit_carbon_tco2_per_t,
        },
        'energy_categories': _format_category_summary(category_period_values),
        'evaluations': evaluations,
        'trends': _build_trends(production_period_rows,
                                category_period_values,
                                timezone_offset),
    }


def _query_space(cursor_system, space_id):
    cursor_system.execute(" SELECT s.name, s.area, s.number_of_occupants, s.cost_center_id, c.enterprise_space_id "
                          " FROM tbl_spaces s "
                          " LEFT JOIN tbl_cost_centers c ON s.cost_center_id = c.id "
                          " WHERE s.id = %s ", (space_id,))
    row = cursor_system.fetchone()
    if row is None:
        raise falcon.HTTPError(status=falcon.HTTP_404, title='API.NOT_FOUND', description='API.SPACE_NOT_FOUND')
    return {
        'id': space_id,
        'name': row[0],
        'area': row[1],
        'number_of_occupants': row[2],
        'cost_center_id': row[3],
        'enterprise_space_id': row[4],
    }


def _query_product(cursor_production, product_id):
    cursor_production.execute(" SELECT name, unit_of_measure, tag, standard_product_coefficient "
                              " FROM tbl_products "
                              " WHERE id = %s ", (product_id,))
    row = cursor_production.fetchone()
    if row is None:
        raise falcon.HTTPError(status=falcon.HTTP_404, title='API.NOT_FOUND', description='API.PRODUCT_NOT_FOUND')
    return {
        'id': product_id,
        'name': row[0],
        'unit': row[1],
        'tag': row[2],
        'coefficient': row[3],
    }


def _query_energy_categories(cursor_system, energy_category_ids):
    if energy_category_ids is None or len(energy_category_ids) == 0:
        return {}
    placeholders = ', '.join(['%s'] * len(energy_category_ids))
    cursor_system.execute(" SELECT id, name, unit_of_measure, kgce, kgco2e "
                          " FROM tbl_energy_categories "
                          f" WHERE id IN ({placeholders}) "
                          " ORDER BY id ", tuple(energy_category_ids))
    rows = cursor_system.fetchall()
    return {
        row[0]: {
            'name': row[1],
            'unit_of_measure': row[2],
            'kgce': row[3],
            'kgco2e': row[4],
        } for row in rows or []
    }


def _query_production_hourly(cursor_production,
                             space_id,
                             product_id,
                             reporting_start_datetime_utc,
                             reporting_end_datetime_utc):
    cursor_production.execute(" SELECT start_datetime_utc, product_count "
                              " FROM tbl_space_hourly "
                              " WHERE space_id = %s "
                              " AND product_id = %s "
                              " AND start_datetime_utc >= %s "
                              " AND start_datetime_utc < %s "
                              " ORDER BY start_datetime_utc ",
                              (space_id,
                               product_id,
                               reporting_start_datetime_utc,
                               reporting_end_datetime_utc))
    return cursor_production.fetchall() or []


def _aggregate_energy_by_category(energy_rows_by_category,
                                  reporting_start_datetime_utc,
                                  reporting_end_datetime_utc,
                                  period_type,
                                  energy_categories):
    category_period_values = {}
    for energy_category_id, energy_category in energy_categories.items():
        period_rows = utilities.aggregate_hourly_data_by_period(
            energy_rows_by_category.get(energy_category_id, []),
            reporting_start_datetime_utc,
            reporting_end_datetime_utc,
            period_type)
        values = []
        subtotal = Decimal(0)
        subtotal_in_kgce = Decimal(0)
        subtotal_in_kgco2e = Decimal(0)
        for _, actual_value in period_rows:
            actual_value = Decimal(0) if actual_value is None else actual_value
            values.append(actual_value)
            subtotal += actual_value
            subtotal_in_kgce += actual_value * energy_category['kgce']
            subtotal_in_kgco2e += actual_value * energy_category['kgco2e']
        category_period_values[energy_category_id] = {
            'id': energy_category_id,
            'name': energy_category['name'],
            'unit_of_measure': energy_category['unit_of_measure'],
            'timestamps': [row[0] for row in period_rows],
            'values': values,
            'subtotal': subtotal,
            'subtotal_in_kgce': subtotal_in_kgce,
            'subtotal_in_kgco2e': subtotal_in_kgco2e,
            'kgce': energy_category['kgce'],
            'kgco2e': energy_category['kgco2e'],
        }
    return category_period_values


def _format_category_summary(category_period_values):
    return [{
        'id': category['id'],
        'name': category['name'],
        'unit_of_measure': category['unit_of_measure'],
        'subtotal': category['subtotal'],
        'subtotal_in_kgce': category['subtotal_in_kgce'],
        'subtotal_in_kgco2e': category['subtotal_in_kgco2e'],
    } for category in category_period_values.values()]


def _build_trends(production_period_rows, category_period_values, timezone_offset):
    trends = []
    for index, (current_datetime_utc, production_value) in enumerate(production_period_rows):
        current_energy_kgce = Decimal(0)
        current_carbon_kgco2e = Decimal(0)
        for category in category_period_values.values():
            if index < len(category['values']):
                current_value = category['values'][index]
                current_energy_kgce += current_value * category['kgce']
                current_carbon_kgco2e += current_value * category['kgco2e']
        production_value = Decimal(0) if production_value is None else production_value
        current_datetime_local = current_datetime_utc.replace(tzinfo=timezone.utc) + timedelta(minutes=timezone_offset)
        trends.append({
            'datetime': current_datetime_local.isoformat()[0:19],
            'production': production_value,
            'energy_kgce': current_energy_kgce,
            'carbon_kgco2e': current_carbon_kgco2e,
            'unit_comprehensive_energy_tce_per_t': current_energy_kgce / Decimal(1000) / production_value
            if production_value > Decimal(0) else None,
            'unit_carbon_tco2_per_t': current_carbon_kgco2e / Decimal(1000) / production_value
            if production_value > Decimal(0) else None,
        })
    return trends
