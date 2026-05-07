from collections import defaultdict
from decimal import Decimal
import falcon
from core.useractivity import get_request_context_value, get_user_permission_context


def ensure_request_space_visible(req, space_id):
    permission_context = get_request_context_value(req, 'permission_context')
    if permission_context is None and 'USER-UUID' in req.headers:
        permission_context = get_user_permission_context(str.strip(req.headers['USER-UUID']))

    if permission_context is None:
        raise falcon.HTTPError(status=falcon.HTTP_404, title='API.NOT_FOUND',
                               description='API.USER_NOT_FOUND')

    if permission_context.get('is_admin') and permission_context.get('enterprise_space_id') is None:
        return

    authorized_space_ids = permission_context.get('authorized_space_ids')
    if authorized_space_ids is not None and space_id not in authorized_space_ids:
        raise falcon.HTTPError(status=falcon.HTTP_404, title='API.NOT_FOUND',
                               description='API.SPACE_NOT_FOUND')


def ensure_space_product_bound(cursor_system, space_id, product_id):
    cursor_system.execute(" SELECT id "
                          " FROM tbl_spaces_products "
                          " WHERE space_id = %s AND product_id = %s ",
                          (space_id, product_id))
    if cursor_system.fetchone() is None:
        raise falcon.HTTPError(status=falcon.HTTP_404, title='API.NOT_FOUND',
                               description='API.PRODUCT_NOT_BOUND_TO_SPACE')


def get_space_product_dimension_sources(cursor_system, space_id, product_id, dimension_field='energy_category_id'):
    online_meter_ids_by_dimension = defaultdict(list)
    offline_meter_ids_by_dimension = defaultdict(list)

    cursor_system.execute(f" SELECT m.id, m.{dimension_field} "
                          " FROM tbl_spaces_meters sm, tbl_meters m "
                          " WHERE sm.space_id = %s "
                          "   AND sm.meter_id = m.id "
                          "   AND m.product_id = %s "
                          " ORDER BY m.id ",
                          (space_id, product_id))
    rows_online_meters = cursor_system.fetchall()
    if rows_online_meters is not None and len(rows_online_meters) > 0:
        for meter_id, dimension_id in rows_online_meters:
            if dimension_id is not None:
                online_meter_ids_by_dimension[dimension_id].append(meter_id)

    cursor_system.execute(f" SELECT om.id, om.{dimension_field} "
                          " FROM tbl_spaces_offline_meters som, tbl_offline_meters om "
                          " WHERE som.space_id = %s "
                          "   AND som.offline_meter_id = om.id "
                          "   AND om.product_id = %s "
                          " ORDER BY om.id ",
                          (space_id, product_id))
    rows_offline_meters = cursor_system.fetchall()
    if rows_offline_meters is not None and len(rows_offline_meters) > 0:
        for offline_meter_id, dimension_id in rows_offline_meters:
            if dimension_id is not None:
                offline_meter_ids_by_dimension[dimension_id].append(offline_meter_id)

    return {
        'online_ids_by_dimension': dict(online_meter_ids_by_dimension),
        'offline_ids_by_dimension': dict(offline_meter_ids_by_dimension)
    }


def get_energy_category_ids_for_sources(source_dict):
    energy_category_ids = set(source_dict['online_ids_by_dimension'].keys())
    energy_category_ids.update(source_dict['offline_ids_by_dimension'].keys())
    return energy_category_ids


def get_space_product_energy_sources(cursor_system, space_id, product_id):
    return get_space_product_dimension_sources(cursor_system, space_id, product_id, 'energy_category_id')


def _query_hourly_rows(cursor, table_name, id_column_name, source_ids, start_datetime_utc, end_datetime_utc):
    if source_ids is None or len(source_ids) == 0:
        return []

    placeholders = ', '.join(['%s'] * len(source_ids))
    query = (f" SELECT {id_column_name}, start_datetime_utc, actual_value "
             f" FROM {table_name} "
             f" WHERE {id_column_name} IN ({placeholders}) "
             "   AND start_datetime_utc >= %s "
             "   AND start_datetime_utc < %s "
             f" ORDER BY {id_column_name}, start_datetime_utc ")
    params = tuple(source_ids) + (start_datetime_utc, end_datetime_utc)
    cursor.execute(query, params)
    return cursor.fetchall()


def get_dimension_hourly_rows(cursor,
                              source_dict,
                              start_datetime_utc,
                              end_datetime_utc,
                              online_table_name='tbl_meter_hourly',
                              offline_table_name='tbl_offline_meter_hourly'):
    dimension_id_by_online_id = dict()
    online_meter_ids = []
    for dimension_id, source_ids in source_dict['online_ids_by_dimension'].items():
        for source_id in source_ids:
            dimension_id_by_online_id[source_id] = dimension_id
            online_meter_ids.append(source_id)

    dimension_id_by_offline_id = dict()
    offline_meter_ids = []
    for dimension_id, source_ids in source_dict['offline_ids_by_dimension'].items():
        for source_id in source_ids:
            dimension_id_by_offline_id[source_id] = dimension_id
            offline_meter_ids.append(source_id)

    aggregated_rows = defaultdict(lambda: defaultdict(lambda: Decimal(0)))

    rows_online = _query_hourly_rows(cursor,
                                     online_table_name,
                                     'meter_id',
                                     online_meter_ids,
                                     start_datetime_utc,
                                     end_datetime_utc)
    for source_id, start_datetime, actual_value in rows_online:
        dimension_id = dimension_id_by_online_id.get(source_id)
        if dimension_id is not None and actual_value is not None:
            aggregated_rows[dimension_id][start_datetime] += actual_value

    rows_offline = _query_hourly_rows(cursor,
                                      offline_table_name,
                                      'offline_meter_id',
                                      offline_meter_ids,
                                      start_datetime_utc,
                                      end_datetime_utc)
    for source_id, start_datetime, actual_value in rows_offline:
        dimension_id = dimension_id_by_offline_id.get(source_id)
        if dimension_id is not None and actual_value is not None:
            aggregated_rows[dimension_id][start_datetime] += actual_value

    result = dict()
    for dimension_id, rows_by_time in aggregated_rows.items():
        result[dimension_id] = sorted(rows_by_time.items(), key=lambda item: item[0])
    return result