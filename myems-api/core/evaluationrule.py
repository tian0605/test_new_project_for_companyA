import uuid
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

import falcon
import mysql.connector
import simplejson as json

from core.useractivity import admin_control, get_request_context_value, user_logger
from core.evaluationengine import VALID_METRIC_CODES
import config


VALID_SCOPE_LEVELS = {
    'platform_default',
    'enterprise_default',
    'enterprise_product',
    'enterprise_space_product',
}

VALID_HIGHLIGHT_STYLES = {'normal', 'warning', 'danger', 'success'}


def _connect():
    return mysql.connector.connect(**config.myems_production_db)


def _read_json(req):
    try:
        raw_json = req.stream.read().decode('utf-8')
    except UnicodeDecodeError:
        raise falcon.HTTPError(status=falcon.HTTP_400, title='API.BAD_REQUEST', description='API.INVALID_ENCODING')
    except Exception:
        raise falcon.HTTPError(status=falcon.HTTP_400, title='API.BAD_REQUEST', description='API.FAILED_TO_READ_REQUEST_STREAM')
    try:
        parsed = json.loads(raw_json)
    except Exception:
        raise falcon.HTTPError(status=falcon.HTTP_400, title='API.BAD_REQUEST', description='API.INVALID_JSON')
    if not isinstance(parsed, dict) or not isinstance(parsed.get('data'), dict):
        raise falcon.HTTPError(status=falcon.HTTP_400, title='API.BAD_REQUEST', description='API.INVALID_DATA')
    return parsed['data']


def _string_value(data, key, error, required=True, max_length=None, default=''):
    value = data.get(key)
    if value is None:
        if required:
            raise falcon.HTTPError(status=falcon.HTTP_400, title='API.BAD_REQUEST', description=error)
        return default
    value = str(value).strip()
    if required and len(value) == 0:
        raise falcon.HTTPError(status=falcon.HTTP_400, title='API.BAD_REQUEST', description=error)
    if max_length is not None and len(value) > max_length:
        value = value[:max_length]
    return value


def _int_value(data, key, error, required=True, minimum=None):
    value = data.get(key)
    if value is None or value == '':
        if required:
            raise falcon.HTTPError(status=falcon.HTTP_400, title='API.BAD_REQUEST', description=error)
        return None
    try:
        result = int(value)
    except (TypeError, ValueError):
        raise falcon.HTTPError(status=falcon.HTTP_400, title='API.BAD_REQUEST', description=error)
    if minimum is not None and result < minimum:
        raise falcon.HTTPError(status=falcon.HTTP_400, title='API.BAD_REQUEST', description=error)
    return result


def _decimal_value(data, key, error, required=True):
    value = data.get(key)
    if value is None or value == '':
        if required:
            raise falcon.HTTPError(status=falcon.HTTP_400, title='API.BAD_REQUEST', description=error)
        return None
    try:
        return Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        raise falcon.HTTPError(status=falcon.HTTP_400, title='API.BAD_REQUEST', description=error)


def _date_value(data, key, error, required=False):
    value = data.get(key)
    if value is None or value == '':
        if required:
            raise falcon.HTTPError(status=falcon.HTTP_400, title='API.BAD_REQUEST', description=error)
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    try:
        return datetime.strptime(str(value)[:10], '%Y-%m-%d').date()
    except ValueError:
        raise falcon.HTTPError(status=falcon.HTTP_400, title='API.BAD_REQUEST', description=error)


def _bool_value(data, key, default=False):
    value = data.get(key)
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, int):
        return value != 0
    return str(value).strip().lower() in ('true', '1', 'yes', 'y', 'on')


def _get_request_enterprise_space_id(req):
    enterprise_space_id = get_request_context_value(req, 'enterprise_space_id')
    return int(enterprise_space_id) if enterprise_space_id is not None else None


def _is_platform_admin(req):
    return bool(get_request_context_value(req, 'is_admin')) and _get_request_enterprise_space_id(req) is None


def _scoped_enterprise_space_id(req, requested_enterprise_space_id):
    if _is_platform_admin(req):
        return int(requested_enterprise_space_id or 0)
    enterprise_space_id = _get_request_enterprise_space_id(req)
    if enterprise_space_id is None:
        raise falcon.HTTPError(status=falcon.HTTP_403, title='API.FORBIDDEN', description='API.FORBIDDEN')
    if requested_enterprise_space_id not in (None, '', enterprise_space_id, str(enterprise_space_id)):
        raise falcon.HTTPError(status=falcon.HTTP_403, title='API.FORBIDDEN', description='API.FORBIDDEN')
    return enterprise_space_id


def _row_to_rule_set(row, detail_count=0):
    return {
        'id': row[0],
        'uuid': row[1],
        'enterprise_space_id': row[2],
        'space_id': row[3],
        'product_id': row[4],
        'rule_set_code': row[5],
        'name': row[6],
        'metric_code': row[7],
        'metric_unit': row[8],
        'benchmark_source': row[9],
        'benchmark_value': row[10],
        'benchmark_display_name': row[11],
        'scope_level': row[12],
        'sort_order': row[13],
        'is_active': bool(row[14]),
        'effective_date': row[15].isoformat() if row[15] else None,
        'expiry_date': row[16].isoformat() if row[16] else None,
        'expression': row[17],
        'remark': row[18],
        'created_datetime_utc': row[19].isoformat()[0:19] if row[19] else None,
        'updated_datetime_utc': row[20].isoformat()[0:19] if row[20] else None,
        'detail_count': detail_count,
    }


def _row_to_detail(row):
    return {
        'id': row[0],
        'rule_set_id': row[1],
        'display_order': row[2],
        'min_value': row[3],
        'max_value': row[4],
        'min_inclusive': bool(row[5]),
        'max_inclusive': bool(row[6]),
        'comparison_side': row[7],
        'grade_code': row[8],
        'grade_label': row[9],
        'is_compliant': bool(row[10]),
        'status_text': row[11],
        'highlight_style': row[12],
        'evaluation_text': row[13],
        'advice_text': row[14],
        'remark': row[15],
    }


def _normalize_rule_set(data, req):
    metric_code = _string_value(data, 'metric_code', 'API.INVALID_METRIC_CODE', max_length=64)
    if metric_code not in VALID_METRIC_CODES:
        raise falcon.HTTPError(status=falcon.HTTP_400, title='API.BAD_REQUEST', description='API.INVALID_METRIC_CODE')
    scope_level = _string_value(data, 'scope_level', 'API.INVALID_SCOPE_LEVEL', max_length=32, default='enterprise_default')
    if scope_level not in VALID_SCOPE_LEVELS:
        raise falcon.HTTPError(status=falcon.HTTP_400, title='API.BAD_REQUEST', description='API.INVALID_SCOPE_LEVEL')

    enterprise_space_id = _scoped_enterprise_space_id(req, data.get('enterprise_space_id'))
    if scope_level == 'platform_default':
        if not _is_platform_admin(req):
            raise falcon.HTTPError(status=falcon.HTTP_403, title='API.FORBIDDEN', description='API.FORBIDDEN')
        enterprise_space_id = 0

    space_id = _int_value(data, 'space_id', 'API.INVALID_SPACE_ID', required=False, minimum=1)
    product_id = _int_value(data, 'product_id', 'API.INVALID_PRODUCT_ID', required=False, minimum=1)
    if scope_level == 'enterprise_default':
        space_id = None
        product_id = None
    elif scope_level == 'enterprise_product':
        space_id = None
        if product_id is None:
            raise falcon.HTTPError(status=falcon.HTTP_400, title='API.BAD_REQUEST', description='API.INVALID_PRODUCT_ID')
    elif scope_level == 'enterprise_space_product':
        if space_id is None or product_id is None:
            raise falcon.HTTPError(status=falcon.HTTP_400, title='API.BAD_REQUEST', description='API.INVALID_SCOPE_LEVEL')
    elif scope_level == 'platform_default':
        space_id = None
        product_id = None

    expression = data.get('expression')
    if isinstance(expression, (dict, list)):
        expression = json.dumps(expression)
    elif expression in (None, ''):
        expression = None
    else:
        try:
            json.loads(expression)
        except Exception:
            raise falcon.HTTPError(status=falcon.HTTP_400, title='API.BAD_REQUEST', description='API.INVALID_JSON_FORMAT')

    return {
        'enterprise_space_id': enterprise_space_id,
        'space_id': space_id,
        'product_id': product_id,
        'rule_set_code': _string_value(data, 'rule_set_code', 'API.INVALID_RULE_SET_CODE', max_length=64),
        'name': _string_value(data, 'name', 'API.INVALID_EVALUATION_RULE_NAME', max_length=128),
        'metric_code': metric_code,
        'metric_unit': _string_value(data, 'metric_unit', 'API.INVALID_METRIC_UNIT', max_length=32),
        'benchmark_source': _string_value(data, 'benchmark_source', 'API.INVALID_BENCHMARK_SOURCE', required=False,
                                          max_length=32, default='fixed') or 'fixed',
        'benchmark_value': _decimal_value(data, 'benchmark_value', 'API.INVALID_BENCHMARK_VALUE'),
        'benchmark_display_name': _string_value(data, 'benchmark_display_name', 'API.INVALID_BENCHMARK_DISPLAY_NAME',
                                                required=False, max_length=128),
        'scope_level': scope_level,
        'sort_order': _int_value(data, 'sort_order', 'API.INVALID_SORT_ORDER', required=False) or 0,
        'is_active': _bool_value(data, 'is_active', True),
        'effective_date': _date_value(data, 'effective_date', 'API.INVALID_EFFECTIVE_DATE'),
        'expiry_date': _date_value(data, 'expiry_date', 'API.INVALID_EXPIRY_DATE'),
        'expression': expression,
        'remark': _string_value(data, 'remark', 'API.INVALID_REMARK', required=False, max_length=255),
    }


def _normalize_detail(detail, index):
    highlight_style = _string_value(detail, 'highlight_style', 'API.INVALID_HIGHLIGHT_STYLE', required=False,
                                    max_length=32, default='normal') or 'normal'
    if highlight_style not in VALID_HIGHLIGHT_STYLES:
        raise falcon.HTTPError(status=falcon.HTTP_400, title='API.BAD_REQUEST', description='API.INVALID_HIGHLIGHT_STYLE')
    return {
        'display_order': _int_value(detail, 'display_order', 'API.INVALID_DISPLAY_ORDER', required=False) or (index + 1) * 10,
        'min_value': _decimal_value(detail, 'min_value', 'API.INVALID_MIN_VALUE', required=False),
        'max_value': _decimal_value(detail, 'max_value', 'API.INVALID_MAX_VALUE', required=False),
        'min_inclusive': _bool_value(detail, 'min_inclusive', False),
        'max_inclusive': _bool_value(detail, 'max_inclusive', False),
        'comparison_side': _string_value(detail, 'comparison_side', 'API.INVALID_COMPARISON_SIDE', required=False,
                                         max_length=32, default='actual') or 'actual',
        'grade_code': _string_value(detail, 'grade_code', 'API.INVALID_GRADE_CODE', max_length=64),
        'grade_label': _string_value(detail, 'grade_label', 'API.INVALID_GRADE_LABEL', required=False, max_length=128),
        'is_compliant': _bool_value(detail, 'is_compliant', False),
        'status_text': _string_value(detail, 'status_text', 'API.INVALID_STATUS_TEXT', required=False, max_length=32),
        'highlight_style': highlight_style,
        'evaluation_text': _string_value(detail, 'evaluation_text', 'API.INVALID_EVALUATION_TEXT'),
        'advice_text': _string_value(detail, 'advice_text', 'API.INVALID_ADVICE_TEXT'),
        'remark': _string_value(detail, 'remark', 'API.INVALID_REMARK', required=False, max_length=255),
    }


def _validate_details(details):
    errors = []
    if not isinstance(details, list) or len(details) == 0:
        return False, [{'code': 'API.EVALUATION_RULE_DETAILS_REQUIRED'}]
    actual_details = [detail for detail in details if detail.get('comparison_side') == 'actual']
    ordered = sorted(actual_details, key=lambda item: (item['min_value'] is not None, item['min_value'] or Decimal('-999999999999'), item['display_order']))
    previous_max = None
    previous_max_inclusive = False
    for detail in ordered:
        min_value = detail['min_value']
        max_value = detail['max_value']
        if min_value is not None and max_value is not None and min_value > max_value:
            errors.append({'code': 'API.INVALID_EVALUATION_RULE_RANGE', 'grade_code': detail['grade_code']})
        if min_value is not None and max_value is not None and min_value == max_value and \
                not (detail['min_inclusive'] and detail['max_inclusive']):
            errors.append({'code': 'API.INVALID_EVALUATION_RULE_RANGE', 'grade_code': detail['grade_code']})
        if previous_max is not None and min_value is not None:
            if min_value < previous_max or (min_value == previous_max and previous_max_inclusive and detail['min_inclusive']):
                errors.append({'code': 'API.EVALUATION_RULE_RANGE_OVERLAP', 'grade_code': detail['grade_code']})
        if max_value is not None:
            previous_max = max_value
            previous_max_inclusive = detail['max_inclusive']
    return len(errors) == 0, errors


def _normalize_payload(data, req):
    rule_set = _normalize_rule_set(data, req)
    raw_details = data.get('details')
    if not isinstance(raw_details, list):
        raise falcon.HTTPError(status=falcon.HTTP_400, title='API.BAD_REQUEST', description='API.INVALID_EVALUATION_RULE_DETAILS')
    details = [_normalize_detail(detail, index) for index, detail in enumerate(raw_details)]
    is_valid, errors = _validate_details(details)
    if not is_valid:
        raise falcon.HTTPError(status=falcon.HTTP_400, title='API.BAD_REQUEST', description=errors[0]['code'])
    return rule_set, details


def _ensure_rule_visible(cursor, req, rule_set_id):
    cursor.execute(" SELECT enterprise_space_id FROM tbl_evaluation_rule_sets WHERE id = %s ", (rule_set_id,))
    row = cursor.fetchone()
    if row is None:
        raise falcon.HTTPError(status=falcon.HTTP_404, title='API.NOT_FOUND', description='API.EVALUATION_RULE_NOT_FOUND')
    if not _is_platform_admin(req) and row[0] != _get_request_enterprise_space_id(req):
        raise falcon.HTTPError(status=falcon.HTTP_404, title='API.NOT_FOUND', description='API.EVALUATION_RULE_NOT_FOUND')


def _get_rule_with_details(cursor, rule_set_id):
    cursor.execute(
        " SELECT id, uuid, enterprise_space_id, space_id, product_id, rule_set_code, name, metric_code, metric_unit, "
        "        benchmark_source, benchmark_value, benchmark_display_name, scope_level, sort_order, is_active, "
        "        effective_date, expiry_date, expression, remark, created_datetime_utc, updated_datetime_utc "
        " FROM tbl_evaluation_rule_sets WHERE id = %s ",
        (rule_set_id,)
    )
    row = cursor.fetchone()
    if row is None:
        raise falcon.HTTPError(status=falcon.HTTP_404, title='API.NOT_FOUND', description='API.EVALUATION_RULE_NOT_FOUND')
    result = _row_to_rule_set(row)
    cursor.execute(
        " SELECT id, rule_set_id, display_order, min_value, max_value, min_inclusive, max_inclusive, comparison_side, "
        "        grade_code, grade_label, is_compliant, status_text, highlight_style, evaluation_text, advice_text, remark "
        " FROM tbl_evaluation_rule_details WHERE rule_set_id = %s ORDER BY display_order, id ",
        (rule_set_id,)
    )
    result['details'] = [_row_to_detail(detail_row) for detail_row in cursor.fetchall() or []]
    result['detail_count'] = len(result['details'])
    return result


def _insert_rule(cursor, rule_set, details, new_uuid=None):
    cursor.execute(
        " INSERT INTO tbl_evaluation_rule_sets "
        " (uuid, enterprise_space_id, space_id, product_id, rule_set_code, name, metric_code, metric_unit, "
        "  benchmark_source, benchmark_value, benchmark_display_name, scope_level, sort_order, is_active, "
        "  effective_date, expiry_date, expression, remark) "
        " VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) ",
        (new_uuid or str(uuid.uuid4()), rule_set['enterprise_space_id'], rule_set['space_id'], rule_set['product_id'],
         rule_set['rule_set_code'], rule_set['name'], rule_set['metric_code'], rule_set['metric_unit'],
         rule_set['benchmark_source'], rule_set['benchmark_value'], rule_set['benchmark_display_name'],
         rule_set['scope_level'], rule_set['sort_order'], rule_set['is_active'], rule_set['effective_date'],
         rule_set['expiry_date'], rule_set['expression'], rule_set['remark'])
    )
    rule_set_id = cursor.lastrowid
    _insert_details(cursor, rule_set_id, details)
    return rule_set_id


def _insert_details(cursor, rule_set_id, details):
    for detail in details:
        cursor.execute(
            " INSERT INTO tbl_evaluation_rule_details "
            " (rule_set_id, display_order, min_value, max_value, min_inclusive, max_inclusive, comparison_side, "
            "  grade_code, grade_label, is_compliant, status_text, highlight_style, evaluation_text, advice_text, remark) "
            " VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) ",
            (rule_set_id, detail['display_order'], detail['min_value'], detail['max_value'], detail['min_inclusive'],
             detail['max_inclusive'], detail['comparison_side'], detail['grade_code'], detail['grade_label'],
             detail['is_compliant'], detail['status_text'], detail['highlight_style'], detail['evaluation_text'],
             detail['advice_text'], detail['remark'])
        )


class EvaluationRuleCollection:
    @staticmethod
    def on_options(req, resp):
        _ = req
        resp.status = falcon.HTTP_200

    @staticmethod
    def on_get(req, resp):
        admin_control(req)
        conditions = []
        params = []
        if not _is_platform_admin(req):
            conditions.append(" r.enterprise_space_id = %s ")
            params.append(_get_request_enterprise_space_id(req))
        for param_name in ('enterprise_space_id', 'product_id', 'space_id'):
            param_value = req.params.get(param_name)
            if param_value is not None and str(param_value).strip() != '':
                conditions.append(f" r.{param_name} = %s ")
                params.append(int(param_value))
        metric_code = req.params.get('metric_code')
        if metric_code:
            conditions.append(" r.metric_code = %s ")
            params.append(str(metric_code).strip())
        is_active = req.params.get('is_active')
        if is_active is not None and str(is_active).strip() != '':
            conditions.append(" r.is_active = %s ")
            params.append(1 if str(is_active).strip().lower() in ('true', '1', 'yes', 'y', 'on') else 0)
        keyword = req.params.get('keyword')
        if keyword:
            conditions.append(" (r.name LIKE %s OR r.rule_set_code LIKE %s OR r.metric_code LIKE %s) ")
            like_value = '%' + str(keyword).strip() + '%'
            params.extend([like_value, like_value, like_value])

        where_clause = ' WHERE ' + ' AND '.join(conditions) if conditions else ''
        cnx = None
        cursor = None
        try:
            cnx = _connect()
            cursor = cnx.cursor()
            cursor.execute(
                " SELECT r.id, r.uuid, r.enterprise_space_id, r.space_id, r.product_id, r.rule_set_code, r.name, "
                "        r.metric_code, r.metric_unit, r.benchmark_source, r.benchmark_value, r.benchmark_display_name, "
                "        r.scope_level, r.sort_order, r.is_active, r.effective_date, r.expiry_date, r.expression, "
                "        r.remark, r.created_datetime_utc, r.updated_datetime_utc, COUNT(d.id) "
                " FROM tbl_evaluation_rule_sets r "
                " LEFT JOIN tbl_evaluation_rule_details d ON r.id = d.rule_set_id "
                + where_clause +
                " GROUP BY r.id "
                " ORDER BY r.enterprise_space_id, r.metric_code, r.sort_order, r.id ",
                tuple(params)
            )
            resp.text = json.dumps([_row_to_rule_set(row[:21], row[21]) for row in cursor.fetchall() or []])
        finally:
            if cursor:
                cursor.close()
            if cnx:
                cnx.close()

    @staticmethod
    @user_logger
    def on_post(req, resp):
        admin_control(req)
        rule_set, details = _normalize_payload(_read_json(req), req)
        cnx = None
        cursor = None
        try:
            cnx = _connect()
            cursor = cnx.cursor()
            new_id = _insert_rule(cursor, rule_set, details)
            cnx.commit()
            resp.status = falcon.HTTP_201
            resp.location = '/evaluationrules/' + str(new_id)
        finally:
            if cursor:
                cursor.close()
            if cnx:
                cnx.close()


class EvaluationRuleItem:
    @staticmethod
    def on_options(req, resp, id_):
        _ = req, id_
        resp.status = falcon.HTTP_200

    @staticmethod
    def on_get(req, resp, id_):
        admin_control(req)
        if not str(id_).isdigit() or int(id_) <= 0:
            raise falcon.HTTPError(status=falcon.HTTP_400, title='API.BAD_REQUEST', description='API.INVALID_EVALUATION_RULE_ID')
        cnx = None
        cursor = None
        try:
            cnx = _connect()
            cursor = cnx.cursor()
            _ensure_rule_visible(cursor, req, int(id_))
            resp.text = json.dumps(_get_rule_with_details(cursor, int(id_)))
        finally:
            if cursor:
                cursor.close()
            if cnx:
                cnx.close()

    @staticmethod
    @user_logger
    def on_put(req, resp, id_):
        admin_control(req)
        if not str(id_).isdigit() or int(id_) <= 0:
            raise falcon.HTTPError(status=falcon.HTTP_400, title='API.BAD_REQUEST', description='API.INVALID_EVALUATION_RULE_ID')
        rule_set, details = _normalize_payload(_read_json(req), req)
        cnx = None
        cursor = None
        try:
            cnx = _connect()
            cursor = cnx.cursor()
            _ensure_rule_visible(cursor, req, int(id_))
            cursor.execute(
                " UPDATE tbl_evaluation_rule_sets "
                " SET enterprise_space_id = %s, space_id = %s, product_id = %s, rule_set_code = %s, name = %s, "
                "     metric_code = %s, metric_unit = %s, benchmark_source = %s, benchmark_value = %s, "
                "     benchmark_display_name = %s, scope_level = %s, sort_order = %s, is_active = %s, "
                "     effective_date = %s, expiry_date = %s, expression = %s, remark = %s "
                " WHERE id = %s ",
                (rule_set['enterprise_space_id'], rule_set['space_id'], rule_set['product_id'], rule_set['rule_set_code'],
                 rule_set['name'], rule_set['metric_code'], rule_set['metric_unit'], rule_set['benchmark_source'],
                 rule_set['benchmark_value'], rule_set['benchmark_display_name'], rule_set['scope_level'],
                 rule_set['sort_order'], rule_set['is_active'], rule_set['effective_date'], rule_set['expiry_date'],
                 rule_set['expression'], rule_set['remark'], int(id_))
            )
            cursor.execute(" DELETE FROM tbl_evaluation_rule_details WHERE rule_set_id = %s ", (int(id_),))
            _insert_details(cursor, int(id_), details)
            cnx.commit()
            resp.status = falcon.HTTP_200
        finally:
            if cursor:
                cursor.close()
            if cnx:
                cnx.close()

    @staticmethod
    @user_logger
    def on_delete(req, resp, id_):
        admin_control(req)
        if not str(id_).isdigit() or int(id_) <= 0:
            raise falcon.HTTPError(status=falcon.HTTP_400, title='API.BAD_REQUEST', description='API.INVALID_EVALUATION_RULE_ID')
        cnx = None
        cursor = None
        try:
            cnx = _connect()
            cursor = cnx.cursor()
            _ensure_rule_visible(cursor, req, int(id_))
            cursor.execute(" DELETE FROM tbl_evaluation_rule_details WHERE rule_set_id = %s ", (int(id_),))
            cursor.execute(" DELETE FROM tbl_evaluation_rule_sets WHERE id = %s ", (int(id_),))
            cnx.commit()
            resp.status = falcon.HTTP_204
        finally:
            if cursor:
                cursor.close()
            if cnx:
                cnx.close()


class EvaluationRuleValidate:
    @staticmethod
    def on_options(req, resp):
        _ = req
        resp.status = falcon.HTTP_200

    @staticmethod
    def on_post(req, resp):
        admin_control(req)
        data = _read_json(req)
        details = [_normalize_detail(detail, index) for index, detail in enumerate(data.get('details') or [])]
        is_valid, errors = _validate_details(details)
        resp.text = json.dumps({'is_valid': is_valid, 'errors': errors, 'warnings': []})


class EvaluationRuleExport:
    @staticmethod
    def on_options(req, resp, id_):
        _ = req, id_
        resp.status = falcon.HTTP_200

    @staticmethod
    def on_get(req, resp, id_):
        admin_control(req)
        cnx = None
        cursor = None
        try:
            cnx = _connect()
            cursor = cnx.cursor()
            _ensure_rule_visible(cursor, req, int(id_))
            resp.text = json.dumps({'data': _get_rule_with_details(cursor, int(id_))})
        finally:
            if cursor:
                cursor.close()
            if cnx:
                cnx.close()


class EvaluationRuleImport:
    @staticmethod
    def on_options(req, resp):
        _ = req
        resp.status = falcon.HTTP_200

    @staticmethod
    @user_logger
    def on_post(req, resp):
        admin_control(req)
        payload = _read_json(req)
        rule_data = payload.get('data') if isinstance(payload.get('data'), dict) else payload
        rule_set, details = _normalize_payload(rule_data, req)
        cnx = None
        cursor = None
        try:
            cnx = _connect()
            cursor = cnx.cursor()
            new_id = _insert_rule(cursor, rule_set, details)
            cnx.commit()
            resp.status = falcon.HTTP_201
            resp.location = '/evaluationrules/' + str(new_id)
        finally:
            if cursor:
                cursor.close()
            if cnx:
                cnx.close()


class EvaluationRuleClone:
    @staticmethod
    def on_options(req, resp, id_):
        _ = req, id_
        resp.status = falcon.HTTP_200

    @staticmethod
    @user_logger
    def on_post(req, resp, id_):
        admin_control(req)
        cnx = None
        cursor = None
        try:
            cnx = _connect()
            cursor = cnx.cursor()
            _ensure_rule_visible(cursor, req, int(id_))
            existing = _get_rule_with_details(cursor, int(id_))
            existing['name'] = existing['name'] + ' Copy'
            existing['rule_set_code'] = existing['rule_set_code'] + '_copy_' + str(uuid.uuid4())[:8]
            rule_set, details = _normalize_payload(existing, req)
            new_id = _insert_rule(cursor, rule_set, details)
            cnx.commit()
            resp.status = falcon.HTTP_201
            resp.location = '/evaluationrules/' + str(new_id)
        finally:
            if cursor:
                cursor.close()
            if cnx:
                cnx.close()