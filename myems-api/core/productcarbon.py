import uuid
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

import falcon
import mysql.connector
import simplejson as json

from core.useractivity import access_control, get_request_context_value
import config


LIFECYCLE_STAGES = [
    'raw_material_acquisition',
    'manufacturing',
    'distribution',
    'use',
    'end_of_life'
]


STAGE_LABELS = {
    'raw_material_acquisition': 'Raw Material Acquisition',
    'manufacturing': 'Manufacturing',
    'distribution': 'Distribution',
    'use': 'Use',
    'end_of_life': 'End of Life'
}


DEFAULT_DICTIONARIES = [
    ('supply_category', '运输类', 1),
    ('supply_category', '物料类', 2)
]


def _connect():
    return mysql.connector.connect(**config.myems_production_db)


def _connect_system():
    return mysql.connector.connect(**config.myems_system_db)


def _authenticate(req):
    access_control(req)
    enterprise_space_id = get_request_context_value(req, 'enterprise_space_id')
    return int(enterprise_space_id) if enterprise_space_id is not None else 0


def _get_authorized_space_ids(req, enterprise_space_id):
    authorized_space_ids = get_request_context_value(req, 'authorized_space_ids')
    if isinstance(authorized_space_ids, list):
        scoped_space_ids = [space_id for space_id in authorized_space_ids if isinstance(space_id, int) and space_id > 0]
        if scoped_space_ids:
            return scoped_space_ids
    return [enterprise_space_id] if enterprise_space_id > 0 else []


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


def _string_value(data, key, error, required=True, max_length=None):
    value = data.get(key)
    if value is None:
        if required:
            raise falcon.HTTPError(status=falcon.HTTP_400, title='API.BAD_REQUEST', description=error)
        return ''
    value = str(value).strip()
    if required and len(value) == 0:
        raise falcon.HTTPError(status=falcon.HTTP_400, title='API.BAD_REQUEST', description=error)
    if max_length is not None and len(value) > max_length:
        value = value[:max_length]
    return value


def _decimal_value(data, key, error, required=True, minimum=None):
    value = data.get(key)
    if value is None or value == '':
        if required:
            raise falcon.HTTPError(status=falcon.HTTP_400, title='API.BAD_REQUEST', description=error)
        return None
    try:
        result = Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        raise falcon.HTTPError(status=falcon.HTTP_400, title='API.BAD_REQUEST', description=error)
    if minimum is not None and result < Decimal(str(minimum)):
        raise falcon.HTTPError(status=falcon.HTTP_400, title='API.BAD_REQUEST', description=error)
    return result


def _int_value(data, key, error, required=True, minimum=None):
    value = data.get(key)
    if value is None or value == '':
        if required:
            raise falcon.HTTPError(status=falcon.HTTP_400, title='API.BAD_REQUEST', description=error)
        return None
    try:
        result = int(value)
    except (ValueError, TypeError):
        raise falcon.HTTPError(status=falcon.HTTP_400, title='API.BAD_REQUEST', description=error)
    if minimum is not None and result < minimum:
        raise falcon.HTTPError(status=falcon.HTTP_400, title='API.BAD_REQUEST', description=error)
    return result


def _date_value(data, key, error, default_value=None):
    value = data.get(key)
    if value is None or value == '':
        return default_value
    try:
        return datetime.strptime(str(value)[:10], '%Y-%m-%d').date()
    except ValueError:
        raise falcon.HTTPError(status=falcon.HTTP_400, title='API.BAD_REQUEST', description=error)


def _row_to_supply(row):
    return {
        'id': row[0],
        'uuid': row[1],
        'category': row[2],
        'supplier_name': row[3],
        'supplier_address': row[4],
        'material_name': row[5],
        'specification': row[6],
        'boundary': row[7],
        'carbon_footprint_value': row[8],
        'carbon_footprint_unit': row[9],
        'contact_name': row[10],
        'contact_phone': row[11],
        'contact_email': row[12],
        'remark': row[13]
    }


def _row_to_footprint(row):
    return {
        'id': row[0],
        'uuid': row[1],
        'product_id': row[2],
        'product_name': row[3],
        'product_unit': row[4],
        'accounting_year': row[5],
        'name': row[6],
        'unit': row[7],
        'accounting_date': row[8].isoformat() if row[8] else None,
        'system_boundary': row[9],
        'start_date': row[10].isoformat() if row[10] else None,
        'end_date': row[11].isoformat() if row[11] else None,
        'production_quantity': row[12],
        'functional_unit': row[13],
        'total_carbon_footprint': row[14],
        'data_status': row[15],
        'remark': row[16]
    }


def _row_to_activity(row):
    return {
        'id': row[0],
        'uuid': row[1],
        'footprint_id': row[2],
        'supply_id': row[3],
        'stage': row[4],
        'stage_label': STAGE_LABELS.get(row[4], row[4]),
        'category': row[5],
        'activity_name': row[6],
        'activity_level': row[7],
        'unit': row[8],
        'factor': row[9],
        'emission_amount': row[10],
        'factor_source': row[11],
        'carbon_footprint_value': row[12],
        'remark': row[13]
    }


def _row_to_dictionary(row):
    return {
        'id': row[0],
        'uuid': row[1],
        'dict_type': row[2],
        'name': row[3],
        'sort_order': row[4],
        'is_active': bool(row[5]),
        'remark': row[6]
    }


def _ensure_default_dictionaries(cursor, enterprise_space_id):
    for dict_type, name, sort_order in DEFAULT_DICTIONARIES:
        cursor.execute(' SELECT id FROM tbl_product_carbon_dictionaries '
                       ' WHERE enterprise_space_id = %s AND dict_type = %s AND name = %s ',
                       (enterprise_space_id, dict_type, name))
        if cursor.fetchone() is None:
            cursor.execute(' INSERT INTO tbl_product_carbon_dictionaries '
                           ' (uuid, enterprise_space_id, dict_type, name, sort_order, is_active, remark) '
                           ' VALUES (%s, %s, %s, %s, %s, 1, \'\') ',
                           (str(uuid.uuid4()), enterprise_space_id, dict_type, name, sort_order))


def _ensure_product_exists(cursor, product_id):
    cursor.execute(' SELECT id FROM tbl_products WHERE id = %s ', (product_id,))
    if cursor.fetchone() is None:
        raise falcon.HTTPError(status=falcon.HTTP_404, title='API.NOT_FOUND', description='API.PRODUCT_NOT_FOUND')


def _normalize_space_scope(space_scope):
    if isinstance(space_scope, list):
        return [space_id for space_id in space_scope if isinstance(space_id, int) and space_id > 0]
    if isinstance(space_scope, int) and space_scope > 0:
        return [space_scope]
    return []


def _get_bound_product_ids(space_scope):
    space_ids = _normalize_space_scope(space_scope)
    if not space_ids:
        return []

    cnx_system = None
    cursor_system = None
    try:
        cnx_system = _connect_system()
        cursor_system = cnx_system.cursor()
        placeholders = ','.join(['%s'] * len(space_ids))
        cursor_system.execute(f' SELECT DISTINCT product_id FROM tbl_spaces_products WHERE space_id IN ({placeholders}) ORDER BY product_id ',
                              tuple(space_ids))
        rows = cursor_system.fetchall()
        return [row[0] for row in rows] if rows else []
    finally:
        if cursor_system:
            cursor_system.close()
        if cnx_system:
            cnx_system.close()


def _ensure_product_bound_to_space(space_scope, product_id):
    space_ids = _normalize_space_scope(space_scope)
    if not space_ids:
        raise falcon.HTTPError(status=falcon.HTTP_404, title='API.NOT_FOUND', description='API.SPACE_PRODUCT_RELATION_NOT_FOUND')

    cnx_system = None
    cursor_system = None
    try:
        cnx_system = _connect_system()
        cursor_system = cnx_system.cursor()
        placeholders = ','.join(['%s'] * len(space_ids))
        cursor_system.execute(f' SELECT id FROM tbl_spaces_products WHERE space_id IN ({placeholders}) AND product_id = %s LIMIT 1 ',
                              tuple(space_ids) + (product_id,))
        if cursor_system.fetchone() is None:
            raise falcon.HTTPError(status=falcon.HTTP_404, title='API.NOT_FOUND',
                                   description='API.SPACE_PRODUCT_RELATION_NOT_FOUND')
    finally:
        if cursor_system:
            cursor_system.close()
        if cnx_system:
            cnx_system.close()


def _ensure_supply_exists(cursor, enterprise_space_id, supply_id):
    if supply_id is None:
        return
    cursor.execute(' SELECT id FROM tbl_product_carbon_supplies WHERE id = %s AND enterprise_space_id = %s ',
                   (supply_id, enterprise_space_id))
    if cursor.fetchone() is None:
        raise falcon.HTTPError(status=falcon.HTTP_404, title='API.NOT_FOUND', description='API.PRODUCT_CARBON_SUPPLY_NOT_FOUND')


def _ensure_footprint_exists(cursor, enterprise_space_id, footprint_id, product_space_scope=None):
    cursor.execute(' SELECT product_id FROM tbl_product_carbon_footprints WHERE id = %s AND enterprise_space_id = %s ',
                   (footprint_id, enterprise_space_id))
    row = cursor.fetchone()
    if row is None:
        raise falcon.HTTPError(status=falcon.HTTP_404, title='API.NOT_FOUND', description='API.PRODUCT_CARBON_FOOTPRINT_NOT_FOUND')
    _ensure_product_bound_to_space(product_space_scope if product_space_scope is not None else enterprise_space_id, row[0])


def _get_footprint_production_quantity(cursor, enterprise_space_id, footprint_id, product_space_scope=None):
    cursor.execute(' SELECT product_id, production_quantity FROM tbl_product_carbon_footprints '
                   ' WHERE id = %s AND enterprise_space_id = %s ',
                   (footprint_id, enterprise_space_id))
    row = cursor.fetchone()
    if row is None:
        raise falcon.HTTPError(status=falcon.HTTP_404, title='API.NOT_FOUND', description='API.PRODUCT_CARBON_FOOTPRINT_NOT_FOUND')
    _ensure_product_bound_to_space(product_space_scope if product_space_scope is not None else enterprise_space_id, row[0])
    production_quantity = row[1]
    if production_quantity is None or production_quantity <= Decimal('0'):
        raise falcon.HTTPError(status=falcon.HTTP_400, title='API.BAD_REQUEST',
                               description='API.INVALID_PRODUCT_CARBON_PRODUCTION_QUANTITY')
    return production_quantity


def _ensure_dictionary_exists(cursor, enterprise_space_id, dictionary_id):
    cursor.execute(' SELECT id FROM tbl_product_carbon_dictionaries WHERE id = %s AND enterprise_space_id = %s ',
                   (dictionary_id, enterprise_space_id))
    if cursor.fetchone() is None:
        raise falcon.HTTPError(status=falcon.HTTP_404, title='API.NOT_FOUND', description='API.PRODUCT_CARBON_DICTIONARY_NOT_FOUND')


def _validate_active_year_uniqueness(cursor, enterprise_space_id, product_id, accounting_year, current_id=None):
    params = [enterprise_space_id, product_id, accounting_year]
    query = (' SELECT id FROM tbl_product_carbon_footprints '
             ' WHERE enterprise_space_id = %s AND product_id = %s AND accounting_year = %s AND data_status = \'active\' ')
    if current_id is not None:
        query += ' AND id != %s '
        params.append(current_id)
    cursor.execute(query, tuple(params))
    if cursor.fetchone() is not None:
        raise falcon.HTTPError(status=falcon.HTTP_400, title='API.BAD_REQUEST',
                               description='API.PRODUCT_CARBON_FOOTPRINT_YEAR_EXISTS')


def _recalculate_footprint_total(cursor, enterprise_space_id, footprint_id, product_space_scope=None):
    production_quantity = _get_footprint_production_quantity(cursor, enterprise_space_id, footprint_id, product_space_scope)
    cursor.execute(' SELECT COALESCE(SUM(emission_amount / %s), 0) FROM tbl_product_carbon_activities '
                   ' WHERE enterprise_space_id = %s AND footprint_id = %s ',
                   (production_quantity, enterprise_space_id, footprint_id))
    row = cursor.fetchone()
    total = row[0] if row and row[0] is not None else Decimal('0')
    cursor.execute(' UPDATE tbl_product_carbon_activities '
                   ' SET carbon_footprint_value = emission_amount / %s '
                   ' WHERE enterprise_space_id = %s AND footprint_id = %s ',
                   (production_quantity, enterprise_space_id, footprint_id))
    cursor.execute(' UPDATE tbl_product_carbon_footprints SET total_carbon_footprint = %s '
                   ' WHERE id = %s AND enterprise_space_id = %s ',
                   (total, footprint_id, enterprise_space_id))
    return total


def _footprint_total_expression():
    return (' CASE WHEN f.production_quantity > 0 THEN '
            '   COALESCE((SELECT SUM(a.emission_amount / f.production_quantity) '
            '             FROM tbl_product_carbon_activities a '
            '             WHERE a.enterprise_space_id = f.enterprise_space_id AND a.footprint_id = f.id), 0) '
            ' ELSE f.total_carbon_footprint END ')


class ProductCarbonProductCollection:
    @staticmethod
    def on_options(req, resp):
        _ = req
        resp.status = falcon.HTTP_200

    @staticmethod
    def on_get(req, resp):
        enterprise_space_id = _authenticate(req)
        product_ids = _get_bound_product_ids(_get_authorized_space_ids(req, enterprise_space_id))
        result = []

        if product_ids:
            cnx = None
            cursor = None
            try:
                cnx = _connect()
                cursor = cnx.cursor()
                placeholders = ','.join(['%s'] * len(product_ids))
                cursor.execute(
                    ' SELECT id, name, uuid, unit_of_measure, tag, standard_product_coefficient '
                    f' FROM tbl_products WHERE id IN ({placeholders}) ORDER BY name ',
                    tuple(product_ids)
                )
                rows = cursor.fetchall()
                if rows:
                    for row in rows:
                        result.append({
                            'id': row[0],
                            'name': row[1],
                            'uuid': row[2],
                            'unit_of_measure': row[3],
                            'tag': row[4],
                            'standard_product_coefficient': row[5]
                        })
            finally:
                if cursor:
                    cursor.close()
                if cnx:
                    cnx.close()

        resp.text = json.dumps(result, use_decimal=True)


class ProductCarbonDictionaryCollection:
    @staticmethod
    def on_options(req, resp):
        _ = req
        resp.status = falcon.HTTP_200

    @staticmethod
    def on_get(req, resp):
        enterprise_space_id = _authenticate(req)
        dict_type = req.get_param('type', default='supply_category').strip()
        active_only = req.get_param_as_bool('activeonly', required=False)
        if active_only is None:
            active_only = False

        cnx = None
        cursor = None
        try:
            cnx = _connect()
            cursor = cnx.cursor()
            _ensure_default_dictionaries(cursor, enterprise_space_id)
            cnx.commit()
            query = (' SELECT id, uuid, dict_type, name, sort_order, is_active, remark '
                     ' FROM tbl_product_carbon_dictionaries WHERE enterprise_space_id = %s ')
            params = [enterprise_space_id]
            if dict_type:
                query += ' AND dict_type = %s '
                params.append(dict_type)
            if active_only:
                query += ' AND is_active = 1 '
            query += ' ORDER BY sort_order, id '
            cursor.execute(query, tuple(params))
            result = [_row_to_dictionary(row) for row in cursor.fetchall()]
        finally:
            if cursor:
                cursor.close()
            if cnx:
                cnx.close()
        resp.text = json.dumps(result, use_decimal=True)

    @staticmethod
    def on_post(req, resp):
        enterprise_space_id = _authenticate(req)
        data = _read_json(req)
        dict_type = _string_value(data, 'dict_type', 'API.INVALID_PRODUCT_CARBON_DICTIONARY_TYPE', required=False, max_length=64) or 'supply_category'
        name = _string_value(data, 'name', 'API.INVALID_PRODUCT_CARBON_DICTIONARY_NAME', max_length=64)
        sort_order = _int_value(data, 'sort_order', 'API.INVALID_SORT_ORDER', required=False, minimum=0) or 0
        is_active = 1 if data.get('is_active', True) else 0
        remark = _string_value(data, 'remark', 'API.INVALID_REMARK', required=False, max_length=255)
        cnx = None
        cursor = None
        try:
            cnx = _connect()
            cursor = cnx.cursor()
            _ensure_default_dictionaries(cursor, enterprise_space_id)
            cursor.execute(' SELECT id FROM tbl_product_carbon_dictionaries '
                           ' WHERE enterprise_space_id = %s AND dict_type = %s AND name = %s ',
                           (enterprise_space_id, dict_type, name))
            if cursor.fetchone() is not None:
                raise falcon.HTTPError(status=falcon.HTTP_400, title='API.BAD_REQUEST',
                                       description='API.PRODUCT_CARBON_DICTIONARY_EXISTS')
            cursor.execute(' INSERT INTO tbl_product_carbon_dictionaries '
                           ' (uuid, enterprise_space_id, dict_type, name, sort_order, is_active, remark) '
                           ' VALUES (%s, %s, %s, %s, %s, %s, %s) ',
                           (str(uuid.uuid4()), enterprise_space_id, dict_type, name, sort_order, is_active, remark))
            new_id = cursor.lastrowid
            cnx.commit()
        finally:
            if cursor:
                cursor.close()
            if cnx:
                cnx.close()
        resp.status = falcon.HTTP_201
        resp.location = '/product-carbon-dictionaries/' + str(new_id)


class ProductCarbonDictionaryItem:
    @staticmethod
    def on_options(req, resp, id_):
        _ = req
        _ = id_
        resp.status = falcon.HTTP_200

    @staticmethod
    def on_put(req, resp, id_):
        enterprise_space_id = _authenticate(req)
        dictionary_id = _int_value({'id': id_}, 'id', 'API.INVALID_PRODUCT_CARBON_DICTIONARY_ID', minimum=1)
        data = _read_json(req)
        dict_type = _string_value(data, 'dict_type', 'API.INVALID_PRODUCT_CARBON_DICTIONARY_TYPE', required=False, max_length=64) or 'supply_category'
        name = _string_value(data, 'name', 'API.INVALID_PRODUCT_CARBON_DICTIONARY_NAME', max_length=64)
        sort_order = _int_value(data, 'sort_order', 'API.INVALID_SORT_ORDER', required=False, minimum=0) or 0
        is_active = 1 if data.get('is_active', True) else 0
        remark = _string_value(data, 'remark', 'API.INVALID_REMARK', required=False, max_length=255)
        cnx = None
        cursor = None
        try:
            cnx = _connect()
            cursor = cnx.cursor()
            _ensure_dictionary_exists(cursor, enterprise_space_id, dictionary_id)
            cursor.execute(' SELECT id FROM tbl_product_carbon_dictionaries '
                           ' WHERE enterprise_space_id = %s AND dict_type = %s AND name = %s AND id != %s ',
                           (enterprise_space_id, dict_type, name, dictionary_id))
            if cursor.fetchone() is not None:
                raise falcon.HTTPError(status=falcon.HTTP_400, title='API.BAD_REQUEST',
                                       description='API.PRODUCT_CARBON_DICTIONARY_EXISTS')
            cursor.execute(' UPDATE tbl_product_carbon_dictionaries '
                           ' SET dict_type = %s, name = %s, sort_order = %s, is_active = %s, remark = %s '
                           ' WHERE id = %s AND enterprise_space_id = %s ',
                           (dict_type, name, sort_order, is_active, remark, dictionary_id, enterprise_space_id))
            cnx.commit()
        finally:
            if cursor:
                cursor.close()
            if cnx:
                cnx.close()
        resp.status = falcon.HTTP_200

    @staticmethod
    def on_delete(req, resp, id_):
        enterprise_space_id = _authenticate(req)
        dictionary_id = _int_value({'id': id_}, 'id', 'API.INVALID_PRODUCT_CARBON_DICTIONARY_ID', minimum=1)
        cnx = None
        cursor = None
        try:
            cnx = _connect()
            cursor = cnx.cursor()
            _ensure_dictionary_exists(cursor, enterprise_space_id, dictionary_id)
            cursor.execute(' DELETE FROM tbl_product_carbon_dictionaries WHERE id = %s AND enterprise_space_id = %s ',
                           (dictionary_id, enterprise_space_id))
            cnx.commit()
        finally:
            if cursor:
                cursor.close()
            if cnx:
                cnx.close()
        resp.status = falcon.HTTP_204


class ProductCarbonSupplyCollection:
    @staticmethod
    def on_options(req, resp):
        _ = req
        resp.status = falcon.HTTP_200

    @staticmethod
    def on_get(req, resp):
        enterprise_space_id = _authenticate(req)
        query_text = req.get_param('q', default='').strip()
        category = req.get_param('category', default='').strip()

        cnx = None
        cursor = None
        try:
            cnx = _connect()
            cursor = cnx.cursor()
            query = (' SELECT id, uuid, category, supplier_name, supplier_address, material_name, specification, boundary, '
                     '        carbon_footprint_value, carbon_footprint_unit, contact_name, contact_phone, contact_email, remark '
                     ' FROM tbl_product_carbon_supplies WHERE enterprise_space_id = %s ')
            params = [enterprise_space_id]
            if category:
                query += ' AND category = %s '
                params.append(category)
            if query_text:
                query += ' AND (supplier_name LIKE %s OR material_name LIKE %s OR specification LIKE %s) '
                keyword = f'%{query_text}%'
                params.extend([keyword, keyword, keyword])
            query += ' ORDER BY category, supplier_name, material_name '
            cursor.execute(query, tuple(params))
            result = [_row_to_supply(row) for row in cursor.fetchall()]
        finally:
            if cursor:
                cursor.close()
            if cnx:
                cnx.close()

        resp.text = json.dumps(result, use_decimal=True)

    @staticmethod
    def on_post(req, resp):
        enterprise_space_id = _authenticate(req)
        data = _read_json(req)
        category = _string_value(data, 'category', 'API.INVALID_PRODUCT_CARBON_SUPPLY_CATEGORY', max_length=64)
        supplier_name = _string_value(data, 'supplier_name', 'API.INVALID_PRODUCT_CARBON_SUPPLIER_NAME', max_length=128)
        supplier_address = _string_value(data, 'supplier_address', 'API.INVALID_PRODUCT_CARBON_SUPPLIER_ADDRESS', required=False, max_length=255)
        material_name = _string_value(data, 'material_name', 'API.INVALID_PRODUCT_CARBON_MATERIAL_NAME', max_length=128)
        specification = _string_value(data, 'specification', 'API.INVALID_PRODUCT_CARBON_MATERIAL_SPECIFICATION', required=False, max_length=128)
        boundary = _string_value(data, 'boundary', 'API.INVALID_PRODUCT_CARBON_BOUNDARY', required=False, max_length=128)
        value = _decimal_value(data, 'carbon_footprint_value', 'API.INVALID_PRODUCT_CARBON_FOOTPRINT_VALUE', minimum='0.000001')
        unit = _string_value(data, 'carbon_footprint_unit', 'API.INVALID_PRODUCT_CARBON_FOOTPRINT_UNIT', max_length=32)
        contact_name = _string_value(data, 'contact_name', 'API.INVALID_CONTACT_NAME', required=False, max_length=128)
        contact_phone = _string_value(data, 'contact_phone', 'API.INVALID_CONTACT_PHONE', required=False, max_length=32)
        contact_email = _string_value(data, 'contact_email', 'API.INVALID_CONTACT_EMAIL', required=False, max_length=128)
        remark = _string_value(data, 'remark', 'API.INVALID_REMARK', required=False, max_length=255)

        cnx = None
        cursor = None
        try:
            cnx = _connect()
            cursor = cnx.cursor()
            cursor.execute(' SELECT id FROM tbl_product_carbon_supplies '
                           ' WHERE enterprise_space_id = %s AND supplier_name = %s AND material_name = %s AND specification = %s ',
                           (enterprise_space_id, supplier_name, material_name, specification))
            if cursor.fetchone() is not None:
                raise falcon.HTTPError(status=falcon.HTTP_400, title='API.BAD_REQUEST',
                                       description='API.PRODUCT_CARBON_SUPPLY_EXISTS')
            cursor.execute(' INSERT INTO tbl_product_carbon_supplies '
                           ' (uuid, enterprise_space_id, category, supplier_name, supplier_address, material_name, specification, boundary, '
                           '  carbon_footprint_value, carbon_footprint_unit, contact_name, contact_phone, contact_email, remark) '
                           ' VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) ',
                           (str(uuid.uuid4()), enterprise_space_id, category, supplier_name, supplier_address, material_name,
                            specification, boundary, value, unit, contact_name, contact_phone, contact_email, remark))
            new_id = cursor.lastrowid
            cnx.commit()
        finally:
            if cursor:
                cursor.close()
            if cnx:
                cnx.close()

        resp.status = falcon.HTTP_201
        resp.location = '/product-carbon-supplies/' + str(new_id)


class ProductCarbonSupplyItem:
    @staticmethod
    def on_options(req, resp, id_):
        _ = req
        _ = id_
        resp.status = falcon.HTTP_200

    @staticmethod
    def on_get(req, resp, id_):
        enterprise_space_id = _authenticate(req)
        supply_id = _int_value({'id': id_}, 'id', 'API.INVALID_PRODUCT_CARBON_SUPPLY_ID', minimum=1)
        cnx = None
        cursor = None
        try:
            cnx = _connect()
            cursor = cnx.cursor()
            cursor.execute(' SELECT id, uuid, category, supplier_name, supplier_address, material_name, specification, boundary, '
                           '        carbon_footprint_value, carbon_footprint_unit, contact_name, contact_phone, contact_email, remark '
                           ' FROM tbl_product_carbon_supplies WHERE id = %s AND enterprise_space_id = %s ',
                           (supply_id, enterprise_space_id))
            row = cursor.fetchone()
            if row is None:
                raise falcon.HTTPError(status=falcon.HTTP_404, title='API.NOT_FOUND', description='API.PRODUCT_CARBON_SUPPLY_NOT_FOUND')
            result = _row_to_supply(row)
        finally:
            if cursor:
                cursor.close()
            if cnx:
                cnx.close()
        resp.text = json.dumps(result, use_decimal=True)

    @staticmethod
    def on_delete(req, resp, id_):
        enterprise_space_id = _authenticate(req)
        supply_id = _int_value({'id': id_}, 'id', 'API.INVALID_PRODUCT_CARBON_SUPPLY_ID', minimum=1)
        cnx = None
        cursor = None
        try:
            cnx = _connect()
            cursor = cnx.cursor()
            _ensure_supply_exists(cursor, enterprise_space_id, supply_id)
            cursor.execute(' SELECT id FROM tbl_product_carbon_activities WHERE supply_id = %s AND enterprise_space_id = %s LIMIT 1 ',
                           (supply_id, enterprise_space_id))
            if cursor.fetchone() is not None:
                raise falcon.HTTPError(status=falcon.HTTP_400, title='API.BAD_REQUEST',
                                       description='API.PRODUCT_CARBON_SUPPLY_IN_USE')
            cursor.execute(' DELETE FROM tbl_product_carbon_supplies WHERE id = %s AND enterprise_space_id = %s ',
                           (supply_id, enterprise_space_id))
            cnx.commit()
        finally:
            if cursor:
                cursor.close()
            if cnx:
                cnx.close()
        resp.status = falcon.HTTP_204

    @staticmethod
    def on_put(req, resp, id_):
        enterprise_space_id = _authenticate(req)
        supply_id = _int_value({'id': id_}, 'id', 'API.INVALID_PRODUCT_CARBON_SUPPLY_ID', minimum=1)
        data = _read_json(req)
        category = _string_value(data, 'category', 'API.INVALID_PRODUCT_CARBON_SUPPLY_CATEGORY', max_length=64)
        supplier_name = _string_value(data, 'supplier_name', 'API.INVALID_PRODUCT_CARBON_SUPPLIER_NAME', max_length=128)
        supplier_address = _string_value(data, 'supplier_address', 'API.INVALID_PRODUCT_CARBON_SUPPLIER_ADDRESS', required=False, max_length=255)
        material_name = _string_value(data, 'material_name', 'API.INVALID_PRODUCT_CARBON_MATERIAL_NAME', max_length=128)
        specification = _string_value(data, 'specification', 'API.INVALID_PRODUCT_CARBON_MATERIAL_SPECIFICATION', required=False, max_length=128)
        boundary = _string_value(data, 'boundary', 'API.INVALID_PRODUCT_CARBON_BOUNDARY', required=False, max_length=128)
        value = _decimal_value(data, 'carbon_footprint_value', 'API.INVALID_PRODUCT_CARBON_FOOTPRINT_VALUE', minimum='0.000001')
        unit = _string_value(data, 'carbon_footprint_unit', 'API.INVALID_PRODUCT_CARBON_FOOTPRINT_UNIT', max_length=32)
        contact_name = _string_value(data, 'contact_name', 'API.INVALID_CONTACT_NAME', required=False, max_length=128)
        contact_phone = _string_value(data, 'contact_phone', 'API.INVALID_CONTACT_PHONE', required=False, max_length=32)
        contact_email = _string_value(data, 'contact_email', 'API.INVALID_CONTACT_EMAIL', required=False, max_length=128)
        remark = _string_value(data, 'remark', 'API.INVALID_REMARK', required=False, max_length=255)

        cnx = None
        cursor = None
        try:
            cnx = _connect()
            cursor = cnx.cursor()
            _ensure_supply_exists(cursor, enterprise_space_id, supply_id)
            cursor.execute(' SELECT id FROM tbl_product_carbon_supplies '
                           ' WHERE enterprise_space_id = %s AND supplier_name = %s AND material_name = %s AND specification = %s AND id != %s ',
                           (enterprise_space_id, supplier_name, material_name, specification, supply_id))
            if cursor.fetchone() is not None:
                raise falcon.HTTPError(status=falcon.HTTP_400, title='API.BAD_REQUEST',
                                       description='API.PRODUCT_CARBON_SUPPLY_EXISTS')
            cursor.execute(' UPDATE tbl_product_carbon_supplies '
                           ' SET category = %s, supplier_name = %s, supplier_address = %s, material_name = %s, specification = %s, '
                           '     boundary = %s, carbon_footprint_value = %s, carbon_footprint_unit = %s, contact_name = %s, '
                           '     contact_phone = %s, contact_email = %s, remark = %s '
                           ' WHERE id = %s AND enterprise_space_id = %s ',
                           (category, supplier_name, supplier_address, material_name, specification, boundary, value, unit,
                            contact_name, contact_phone, contact_email, remark, supply_id, enterprise_space_id))
            cnx.commit()
        finally:
            if cursor:
                cursor.close()
            if cnx:
                cnx.close()
        resp.status = falcon.HTTP_200


class ProductCarbonFootprintCollection:
    @staticmethod
    def on_options(req, resp):
        _ = req
        resp.status = falcon.HTTP_200

    @staticmethod
    def on_get(req, resp):
        enterprise_space_id = _authenticate(req)
        product_id = req.get_param_as_int('productid', required=False)
        accounting_year = req.get_param_as_int('year', required=False)
        product_space_scope = _get_authorized_space_ids(req, enterprise_space_id)
        bound_product_ids = _get_bound_product_ids(product_space_scope)
        if not bound_product_ids or (product_id is not None and product_id not in bound_product_ids):
            resp.text = json.dumps([], use_decimal=True)
            return

        cnx = None
        cursor = None
        try:
            cnx = _connect()
            cursor = cnx.cursor()
            query = (' SELECT f.id, f.uuid, f.product_id, p.name, p.unit_of_measure, f.accounting_year, f.name, f.unit, '
                     '        f.accounting_date, f.system_boundary, f.start_date, f.end_date, f.production_quantity, '
                     '        f.functional_unit, ' + _footprint_total_expression() + ', f.data_status, f.remark '
                     ' FROM tbl_product_carbon_footprints f '
                     ' LEFT JOIN tbl_products p ON f.product_id = p.id '
                     ' WHERE f.enterprise_space_id = %s ')
            params = [enterprise_space_id]
            placeholders = ','.join(['%s'] * len(bound_product_ids))
            query += f' AND f.product_id IN ({placeholders}) '
            params.extend(bound_product_ids)
            if product_id is not None:
                query += ' AND f.product_id = %s '
                params.append(product_id)
            if accounting_year is not None:
                query += ' AND f.accounting_year = %s '
                params.append(accounting_year)
            query += ' ORDER BY f.accounting_year DESC, p.name, f.name '
            cursor.execute(query, tuple(params))
            result = [_row_to_footprint(row) for row in cursor.fetchall()]
        finally:
            if cursor:
                cursor.close()
            if cnx:
                cnx.close()
        resp.text = json.dumps(result, use_decimal=True)

    @staticmethod
    def on_post(req, resp):
        enterprise_space_id = _authenticate(req)
        data = _read_json(req)
        product_id = _int_value(data, 'product_id', 'API.INVALID_PRODUCT_ID', minimum=1)
        accounting_year = _int_value(data, 'accounting_year', 'API.INVALID_PRODUCT_CARBON_ACCOUNTING_YEAR', minimum=1900)
        name = _string_value(data, 'name', 'API.INVALID_PRODUCT_CARBON_FOOTPRINT_NAME', max_length=128)
        unit = _string_value(data, 'unit', 'API.INVALID_PRODUCT_CARBON_FOOTPRINT_UNIT', required=False, max_length=32)
        accounting_date = _date_value(data, 'accounting_date', 'API.INVALID_PRODUCT_CARBON_ACCOUNTING_DATE', date.today())
        start_date = _date_value(data, 'start_date', 'API.INVALID_PRODUCT_CARBON_START_DATE', date(accounting_year, 1, 1))
        end_date = _date_value(data, 'end_date', 'API.INVALID_PRODUCT_CARBON_END_DATE', date(accounting_year, 12, 31))
        if start_date > end_date or start_date.year != accounting_year or end_date.year != accounting_year:
            raise falcon.HTTPError(status=falcon.HTTP_400, title='API.BAD_REQUEST', description='API.INVALID_PRODUCT_CARBON_DATE_RANGE')
        system_boundary = _string_value(data, 'system_boundary', 'API.INVALID_PRODUCT_CARBON_BOUNDARY', required=False, max_length=128)
        production_quantity = _decimal_value(data, 'production_quantity', 'API.INVALID_PRODUCT_CARBON_PRODUCTION_QUANTITY', minimum='0.000001')
        functional_unit = _string_value(data, 'functional_unit', 'API.INVALID_PRODUCT_CARBON_FUNCTIONAL_UNIT', max_length=64)
        data_status = _string_value(data, 'data_status', 'API.INVALID_PRODUCT_CARBON_DATA_STATUS', required=False, max_length=32) or 'active'
        remark = _string_value(data, 'remark', 'API.INVALID_REMARK', required=False, max_length=255)

        cnx = None
        cursor = None
        try:
            cnx = _connect()
            cursor = cnx.cursor()
            _ensure_product_exists(cursor, product_id)
            _ensure_product_bound_to_space(_get_authorized_space_ids(req, enterprise_space_id), product_id)
            if data_status == 'active':
                _validate_active_year_uniqueness(cursor, enterprise_space_id, product_id, accounting_year)
            cursor.execute(' INSERT INTO tbl_product_carbon_footprints '
                           ' (uuid, enterprise_space_id, product_id, accounting_year, name, unit, accounting_date, system_boundary, '
                           '  start_date, end_date, production_quantity, functional_unit, total_carbon_footprint, data_status, remark) '
                           ' VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 0, %s, %s) ',
                           (str(uuid.uuid4()), enterprise_space_id, product_id, accounting_year, name, unit, accounting_date,
                            system_boundary, start_date, end_date, production_quantity, functional_unit, data_status, remark))
            new_id = cursor.lastrowid
            cnx.commit()
        finally:
            if cursor:
                cursor.close()
            if cnx:
                cnx.close()
        resp.status = falcon.HTTP_201
        resp.location = '/product-carbon-footprints/' + str(new_id)


class ProductCarbonFootprintItem:
    @staticmethod
    def on_options(req, resp, id_):
        _ = req
        _ = id_
        resp.status = falcon.HTTP_200

    @staticmethod
    def on_get(req, resp, id_):
        enterprise_space_id = _authenticate(req)
        footprint_id = _int_value({'id': id_}, 'id', 'API.INVALID_PRODUCT_CARBON_FOOTPRINT_ID', minimum=1)
        product_space_scope = _get_authorized_space_ids(req, enterprise_space_id)
        cnx = None
        cursor = None
        try:
            cnx = _connect()
            cursor = cnx.cursor()
            cursor.execute(' SELECT f.id, f.uuid, f.product_id, p.name, p.unit_of_measure, f.accounting_year, f.name, f.unit, '
                           '        f.accounting_date, f.system_boundary, f.start_date, f.end_date, f.production_quantity, '
                           '        f.functional_unit, ' + _footprint_total_expression() + ', f.data_status, f.remark '
                           ' FROM tbl_product_carbon_footprints f LEFT JOIN tbl_products p ON f.product_id = p.id '
                           ' WHERE f.id = %s AND f.enterprise_space_id = %s ',
                           (footprint_id, enterprise_space_id))
            row = cursor.fetchone()
            if row is None:
                raise falcon.HTTPError(status=falcon.HTTP_404, title='API.NOT_FOUND', description='API.PRODUCT_CARBON_FOOTPRINT_NOT_FOUND')
            result = _row_to_footprint(row)
            _ensure_product_bound_to_space(product_space_scope, result['product_id'])
        finally:
            if cursor:
                cursor.close()
            if cnx:
                cnx.close()
        resp.text = json.dumps(result, use_decimal=True)

    @staticmethod
    def on_delete(req, resp, id_):
        enterprise_space_id = _authenticate(req)
        footprint_id = _int_value({'id': id_}, 'id', 'API.INVALID_PRODUCT_CARBON_FOOTPRINT_ID', minimum=1)
        product_space_scope = _get_authorized_space_ids(req, enterprise_space_id)
        cnx = None
        cursor = None
        try:
            cnx = _connect()
            cursor = cnx.cursor()
            _ensure_footprint_exists(cursor, enterprise_space_id, footprint_id, product_space_scope)
            cursor.execute(' SELECT id FROM tbl_product_carbon_activities WHERE footprint_id = %s AND enterprise_space_id = %s LIMIT 1 ',
                           (footprint_id, enterprise_space_id))
            if cursor.fetchone() is not None:
                raise falcon.HTTPError(status=falcon.HTTP_400, title='API.BAD_REQUEST',
                                       description='API.PRODUCT_CARBON_FOOTPRINT_HAS_ACTIVITIES')
            cursor.execute(' DELETE FROM tbl_product_carbon_footprints WHERE id = %s AND enterprise_space_id = %s ',
                           (footprint_id, enterprise_space_id))
            cnx.commit()
        finally:
            if cursor:
                cursor.close()
            if cnx:
                cnx.close()
        resp.status = falcon.HTTP_204

    @staticmethod
    def on_put(req, resp, id_):
        enterprise_space_id = _authenticate(req)
        footprint_id = _int_value({'id': id_}, 'id', 'API.INVALID_PRODUCT_CARBON_FOOTPRINT_ID', minimum=1)
        data = _read_json(req)
        product_id = _int_value(data, 'product_id', 'API.INVALID_PRODUCT_ID', minimum=1)
        accounting_year = _int_value(data, 'accounting_year', 'API.INVALID_PRODUCT_CARBON_ACCOUNTING_YEAR', minimum=1900)
        name = _string_value(data, 'name', 'API.INVALID_PRODUCT_CARBON_FOOTPRINT_NAME', max_length=128)
        unit = _string_value(data, 'unit', 'API.INVALID_PRODUCT_CARBON_FOOTPRINT_UNIT', required=False, max_length=32)
        accounting_date = _date_value(data, 'accounting_date', 'API.INVALID_PRODUCT_CARBON_ACCOUNTING_DATE', date.today())
        start_date = _date_value(data, 'start_date', 'API.INVALID_PRODUCT_CARBON_START_DATE', date(accounting_year, 1, 1))
        end_date = _date_value(data, 'end_date', 'API.INVALID_PRODUCT_CARBON_END_DATE', date(accounting_year, 12, 31))
        if start_date > end_date or start_date.year != accounting_year or end_date.year != accounting_year:
            raise falcon.HTTPError(status=falcon.HTTP_400, title='API.BAD_REQUEST', description='API.INVALID_PRODUCT_CARBON_DATE_RANGE')
        system_boundary = _string_value(data, 'system_boundary', 'API.INVALID_PRODUCT_CARBON_BOUNDARY', required=False, max_length=128)
        production_quantity = _decimal_value(data, 'production_quantity', 'API.INVALID_PRODUCT_CARBON_PRODUCTION_QUANTITY', minimum='0.000001')
        functional_unit = _string_value(data, 'functional_unit', 'API.INVALID_PRODUCT_CARBON_FUNCTIONAL_UNIT', max_length=64)
        data_status = _string_value(data, 'data_status', 'API.INVALID_PRODUCT_CARBON_DATA_STATUS', required=False, max_length=32) or 'active'
        remark = _string_value(data, 'remark', 'API.INVALID_REMARK', required=False, max_length=255)

        cnx = None
        cursor = None
        try:
            cnx = _connect()
            cursor = cnx.cursor()
            product_space_scope = _get_authorized_space_ids(req, enterprise_space_id)
            _ensure_footprint_exists(cursor, enterprise_space_id, footprint_id, product_space_scope)
            _ensure_product_exists(cursor, product_id)
            _ensure_product_bound_to_space(product_space_scope, product_id)
            if data_status == 'active':
                _validate_active_year_uniqueness(cursor, enterprise_space_id, product_id, accounting_year, footprint_id)
            cursor.execute(' UPDATE tbl_product_carbon_footprints '
                           ' SET product_id = %s, accounting_year = %s, name = %s, unit = %s, accounting_date = %s, '
                           '     system_boundary = %s, start_date = %s, end_date = %s, production_quantity = %s, '
                           '     functional_unit = %s, data_status = %s, remark = %s '
                           ' WHERE id = %s AND enterprise_space_id = %s ',
                           (product_id, accounting_year, name, unit, accounting_date, system_boundary, start_date, end_date,
                            production_quantity, functional_unit, data_status, remark, footprint_id, enterprise_space_id))
            cursor.execute(' UPDATE tbl_product_carbon_activities '
                           ' SET carbon_footprint_value = emission_amount / %s '
                           ' WHERE footprint_id = %s AND enterprise_space_id = %s ',
                           (production_quantity, footprint_id, enterprise_space_id))
            _recalculate_footprint_total(cursor, enterprise_space_id, footprint_id, product_space_scope)
            cnx.commit()
        finally:
            if cursor:
                cursor.close()
            if cnx:
                cnx.close()
        resp.status = falcon.HTTP_200


class ProductCarbonActivityCollection:
    @staticmethod
    def on_options(req, resp):
        _ = req
        resp.status = falcon.HTTP_200

    @staticmethod
    def on_get(req, resp):
        enterprise_space_id = _authenticate(req)
        footprint_id = req.get_param_as_int('footprintid', required=True)
        product_space_scope = _get_authorized_space_ids(req, enterprise_space_id)
        cnx = None
        cursor = None
        try:
            cnx = _connect()
            cursor = cnx.cursor()
            _ensure_footprint_exists(cursor, enterprise_space_id, footprint_id, product_space_scope)
            cursor.execute(' SELECT id, uuid, footprint_id, supply_id, stage, category, activity_name, activity_level, unit, factor, '
                           '        emission_amount, factor_source, carbon_footprint_value, remark '
                           ' FROM tbl_product_carbon_activities WHERE enterprise_space_id = %s AND footprint_id = %s '
                           ' ORDER BY FIELD(stage, %s, %s, %s, %s, %s), id ',
                           (enterprise_space_id, footprint_id) + tuple(LIFECYCLE_STAGES))
            activities = [_row_to_activity(row) for row in cursor.fetchall()]
            result = {
                'stages': [{'value': stage, 'label': STAGE_LABELS[stage]} for stage in LIFECYCLE_STAGES],
                'activities': activities
            }
        finally:
            if cursor:
                cursor.close()
            if cnx:
                cnx.close()
        resp.text = json.dumps(result, use_decimal=True)

    @staticmethod
    def on_post(req, resp):
        enterprise_space_id = _authenticate(req)
        data = _read_json(req)
        footprint_id = _int_value(data, 'footprint_id', 'API.INVALID_PRODUCT_CARBON_FOOTPRINT_ID', minimum=1)
        supply_id = _int_value(data, 'supply_id', 'API.INVALID_PRODUCT_CARBON_SUPPLY_ID', required=False, minimum=1)
        stage = _string_value(data, 'stage', 'API.INVALID_PRODUCT_CARBON_STAGE', max_length=64)
        if stage not in LIFECYCLE_STAGES:
            raise falcon.HTTPError(status=falcon.HTTP_400, title='API.BAD_REQUEST', description='API.INVALID_PRODUCT_CARBON_STAGE')
        category = _string_value(data, 'category', 'API.INVALID_PRODUCT_CARBON_ACTIVITY_CATEGORY', max_length=64)
        activity_name = _string_value(data, 'activity_name', 'API.INVALID_PRODUCT_CARBON_ACTIVITY_NAME', max_length=128)
        activity_level = _decimal_value(data, 'activity_level', 'API.INVALID_PRODUCT_CARBON_ACTIVITY_LEVEL', minimum='0.000001')
        unit = _string_value(data, 'unit', 'API.INVALID_PRODUCT_CARBON_ACTIVITY_UNIT', max_length=32)
        factor = _decimal_value(data, 'factor', 'API.INVALID_PRODUCT_CARBON_FACTOR', minimum='0')
        emission_amount = activity_level * factor
        factor_source = _string_value(data, 'factor_source', 'API.INVALID_PRODUCT_CARBON_FACTOR_SOURCE', required=False, max_length=128)
        remark = _string_value(data, 'remark', 'API.INVALID_REMARK', required=False, max_length=255)

        cnx = None
        cursor = None
        try:
            cnx = _connect()
            cursor = cnx.cursor()
            production_quantity = _get_footprint_production_quantity(cursor, enterprise_space_id, footprint_id,
                                                                     _get_authorized_space_ids(req, enterprise_space_id))
            _ensure_supply_exists(cursor, enterprise_space_id, supply_id)
            carbon_footprint_value = emission_amount / production_quantity
            cursor.execute(' INSERT INTO tbl_product_carbon_activities '
                           ' (uuid, enterprise_space_id, footprint_id, supply_id, stage, category, activity_name, activity_level, unit, '
                           '  factor, emission_amount, factor_source, carbon_footprint_value, remark) '
                           ' VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) ',
                           (str(uuid.uuid4()), enterprise_space_id, footprint_id, supply_id, stage, category, activity_name,
                            activity_level, unit, factor, emission_amount, factor_source, carbon_footprint_value, remark))
            new_id = cursor.lastrowid
            _recalculate_footprint_total(cursor, enterprise_space_id, footprint_id,
                                         _get_authorized_space_ids(req, enterprise_space_id))
            cnx.commit()
        finally:
            if cursor:
                cursor.close()
            if cnx:
                cnx.close()
        resp.status = falcon.HTTP_201
        resp.location = '/product-carbon-activities/' + str(new_id)


class ProductCarbonActivityItem:
    @staticmethod
    def on_options(req, resp, id_):
        _ = req
        _ = id_
        resp.status = falcon.HTTP_200

    @staticmethod
    def on_delete(req, resp, id_):
        enterprise_space_id = _authenticate(req)
        activity_id = _int_value({'id': id_}, 'id', 'API.INVALID_PRODUCT_CARBON_ACTIVITY_ID', minimum=1)
        cnx = None
        cursor = None
        try:
            cnx = _connect()
            cursor = cnx.cursor()
            cursor.execute(' SELECT footprint_id FROM tbl_product_carbon_activities WHERE id = %s AND enterprise_space_id = %s ',
                           (activity_id, enterprise_space_id))
            row = cursor.fetchone()
            if row is None:
                raise falcon.HTTPError(status=falcon.HTTP_404, title='API.NOT_FOUND', description='API.PRODUCT_CARBON_ACTIVITY_NOT_FOUND')
            footprint_id = row[0]
            cursor.execute(' DELETE FROM tbl_product_carbon_activities WHERE id = %s AND enterprise_space_id = %s ',
                           (activity_id, enterprise_space_id))
            _recalculate_footprint_total(cursor, enterprise_space_id, footprint_id,
                                         _get_authorized_space_ids(req, enterprise_space_id))
            cnx.commit()
        finally:
            if cursor:
                cursor.close()
            if cnx:
                cnx.close()
        resp.status = falcon.HTTP_204

    @staticmethod
    def on_put(req, resp, id_):
        enterprise_space_id = _authenticate(req)
        activity_id = _int_value({'id': id_}, 'id', 'API.INVALID_PRODUCT_CARBON_ACTIVITY_ID', minimum=1)
        data = _read_json(req)
        supply_id = _int_value(data, 'supply_id', 'API.INVALID_PRODUCT_CARBON_SUPPLY_ID', required=False, minimum=1)
        stage = _string_value(data, 'stage', 'API.INVALID_PRODUCT_CARBON_STAGE', max_length=64)
        if stage not in LIFECYCLE_STAGES:
            raise falcon.HTTPError(status=falcon.HTTP_400, title='API.BAD_REQUEST', description='API.INVALID_PRODUCT_CARBON_STAGE')
        category = _string_value(data, 'category', 'API.INVALID_PRODUCT_CARBON_ACTIVITY_CATEGORY', max_length=64)
        activity_name = _string_value(data, 'activity_name', 'API.INVALID_PRODUCT_CARBON_ACTIVITY_NAME', max_length=128)
        activity_level = _decimal_value(data, 'activity_level', 'API.INVALID_PRODUCT_CARBON_ACTIVITY_LEVEL', minimum='0.000001')
        unit = _string_value(data, 'unit', 'API.INVALID_PRODUCT_CARBON_ACTIVITY_UNIT', max_length=32)
        factor = _decimal_value(data, 'factor', 'API.INVALID_PRODUCT_CARBON_FACTOR', minimum='0')
        emission_amount = activity_level * factor
        factor_source = _string_value(data, 'factor_source', 'API.INVALID_PRODUCT_CARBON_FACTOR_SOURCE', required=False, max_length=128)
        remark = _string_value(data, 'remark', 'API.INVALID_REMARK', required=False, max_length=255)

        cnx = None
        cursor = None
        try:
            cnx = _connect()
            cursor = cnx.cursor()
            cursor.execute(' SELECT footprint_id FROM tbl_product_carbon_activities WHERE id = %s AND enterprise_space_id = %s ',
                           (activity_id, enterprise_space_id))
            row = cursor.fetchone()
            if row is None:
                raise falcon.HTTPError(status=falcon.HTTP_404, title='API.NOT_FOUND', description='API.PRODUCT_CARBON_ACTIVITY_NOT_FOUND')
            footprint_id = row[0]
            production_quantity = _get_footprint_production_quantity(cursor, enterprise_space_id, footprint_id,
                                                                     _get_authorized_space_ids(req, enterprise_space_id))
            _ensure_supply_exists(cursor, enterprise_space_id, supply_id)
            carbon_footprint_value = emission_amount / production_quantity
            cursor.execute(' UPDATE tbl_product_carbon_activities '
                           ' SET supply_id = %s, stage = %s, category = %s, activity_name = %s, activity_level = %s, unit = %s, '
                           '     factor = %s, emission_amount = %s, factor_source = %s, carbon_footprint_value = %s, remark = %s '
                           ' WHERE id = %s AND enterprise_space_id = %s ',
                           (supply_id, stage, category, activity_name, activity_level, unit, factor, emission_amount,
                            factor_source, carbon_footprint_value, remark, activity_id, enterprise_space_id))
            _recalculate_footprint_total(cursor, enterprise_space_id, footprint_id,
                                         _get_authorized_space_ids(req, enterprise_space_id))
            cnx.commit()
        finally:
            if cursor:
                cursor.close()
            if cnx:
                cnx.close()
        resp.status = falcon.HTTP_200
