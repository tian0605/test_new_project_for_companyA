import uuid
import falcon
import mysql.connector
import simplejson as json
import redis
from core.useractivity import user_logger, admin_control, access_control, api_key_control, get_request_context_value
import config


def get_request_enterprise_space_id(req):
    enterprise_space_id = get_request_context_value(req, 'enterprise_space_id')
    return enterprise_space_id if isinstance(enterprise_space_id, int) and enterprise_space_id > 0 else None


def get_costcenter_scope(req):
    is_admin = get_request_context_value(req, 'is_admin')
    authorized_space_ids = get_request_context_value(req, 'authorized_space_ids')
    if is_admin or authorized_space_ids is None:
        return None
    return [space_id for space_id in authorized_space_ids if isinstance(space_id, int)]


def can_use_shared_costcenter_cache(req):
    return get_costcenter_list_cache_key(req) is not None


def get_costcenter_list_cache_key(req):
    is_admin = bool(get_request_context_value(req, 'is_admin'))
    enterprise_space_id = get_request_context_value(req, 'enterprise_space_id')

    if is_admin and enterprise_space_id is None:
        return 'G:costcenter:admin:list'
    if enterprise_space_id is not None:
        return f'E:{enterprise_space_id}:costcenter:list'
    return None


def get_costcenter_item_cache_key(req, cost_center_id):
    is_admin = bool(get_request_context_value(req, 'is_admin'))
    enterprise_space_id = get_request_context_value(req, 'enterprise_space_id')

    if is_admin and enterprise_space_id is None:
        return f'G:costcenter:admin:item:{cost_center_id}'
    if enterprise_space_id is not None:
        return f'E:{enterprise_space_id}:costcenter:item:{cost_center_id}'
    return None


def get_costcenter_tariff_cache_key(req, cost_center_id):
    is_admin = bool(get_request_context_value(req, 'is_admin'))
    enterprise_space_id = get_request_context_value(req, 'enterprise_space_id')

    if is_admin and enterprise_space_id is None:
        return f'G:costcenter:admin:tariff:list:{cost_center_id}'
    if enterprise_space_id is not None:
        return f'E:{enterprise_space_id}:costcenter:tariff:list:{cost_center_id}'
    return None


def validate_costcenter_enterprise_space_id(cursor, enterprise_space_id):
    if enterprise_space_id is None:
        return None

    if not isinstance(enterprise_space_id, int) or enterprise_space_id <= 0:
        raise falcon.HTTPError(status=falcon.HTTP_400, title='API.BAD_REQUEST',
                               description='API.INVALID_ENTERPRISE_SPACE_ID')

    cursor.execute(" SELECT id "
                   " FROM tbl_spaces "
                   " WHERE id = %s ", (enterprise_space_id,))
    if cursor.fetchone() is None:
        raise falcon.HTTPError(status=falcon.HTTP_404, title='API.NOT_FOUND',
                               description='API.ENTERPRISE_SPACE_NOT_FOUND')

    return enterprise_space_id


def query_legacy_visible_cost_center_ids(cursor, authorized_space_ids):
    if authorized_space_ids is None:
        return None
    if len(authorized_space_ids) == 0:
        return set()

    placeholders = ', '.join(['%s'] * len(authorized_space_ids))
    cursor.execute((" SELECT DISTINCT cost_center_id "
                    " FROM tbl_spaces "
                    f" WHERE id IN ({placeholders}) AND cost_center_id IS NOT NULL "),
                   tuple(authorized_space_ids))
    rows = cursor.fetchall()
    if rows is None:
        return set()
    return {row[0] for row in rows}


def query_visible_cost_center_ids(cursor, authorized_space_ids, enterprise_space_id):
    legacy_visible_cost_center_ids = query_legacy_visible_cost_center_ids(cursor, authorized_space_ids)

    if enterprise_space_id is None:
        return legacy_visible_cost_center_ids

    cursor.execute(" SELECT id "
                   " FROM tbl_cost_centers "
                   " WHERE enterprise_space_id = %s ", (enterprise_space_id,))
    rows = cursor.fetchall()
    visible_cost_center_ids = {row[0] for row in rows} if rows is not None else set()

    if legacy_visible_cost_center_ids:
        placeholders = ', '.join(['%s'] * len(legacy_visible_cost_center_ids))
        cursor.execute((" SELECT id "
                        " FROM tbl_cost_centers "
                        " WHERE enterprise_space_id IS NULL "
                        f"   AND id IN ({placeholders}) "),
                       tuple(sorted(legacy_visible_cost_center_ids)))
        rows = cursor.fetchall()
        if rows is not None:
            visible_cost_center_ids.update(row[0] for row in rows)

    return visible_cost_center_ids


def clear_costcenter_cache(cost_center_id=None):
    """
    Clear cost center-related cache after data modification

    Args:
        cost_center_id: Cost center ID (optional, for specific cost center cache)
    """
    # Check if Redis is enabled
    if not config.redis.get('is_enabled', False):
        return

    redis_client = None
    try:
        redis_client = redis.Redis(
            host=config.redis['host'],
            port=config.redis['port'],
            password=config.redis['password'] if config.redis['password'] else None,
            db=config.redis['db'],
            decode_responses=True,
            socket_connect_timeout=2,
            socket_timeout=2
        )
        redis_client.ping()

        # Clear legacy and scoped cost center list cache
        matching_keys = redis_client.keys('costcenter:list*') + \
            redis_client.keys('G:costcenter:admin:list') + \
            redis_client.keys('E:*:costcenter:list')
        if matching_keys:
            redis_client.delete(*matching_keys)

        # Clear specific cost center item cache if cost_center_id is provided
        if cost_center_id:
            redis_client.delete(f'costcenter:item:{cost_center_id}')
            scoped_item_keys = redis_client.keys(f'G:costcenter:admin:item:{cost_center_id}') + \
                redis_client.keys(f'E:*:costcenter:item:{cost_center_id}')
            if scoped_item_keys:
                redis_client.delete(*scoped_item_keys)
            # Also clear tariff list cache for this cost center
            redis_client.delete(f'costcenter:tariff:list:{cost_center_id}')
            scoped_tariff_keys = redis_client.keys(f'G:costcenter:admin:tariff:list:{cost_center_id}') + \
                redis_client.keys(f'E:*:costcenter:tariff:list:{cost_center_id}')
            if scoped_tariff_keys:
                redis_client.delete(*scoped_tariff_keys)

        dashboard_keys = redis_client.keys('dashboard:report:*') + \
            redis_client.keys('G:dashboard:report:admin:*') + \
            redis_client.keys('E:*:dashboard:report:*')
        if dashboard_keys:
            redis_client.delete(*dashboard_keys)

    except Exception:
        # If cache clear fails, ignore and continue
        pass


class CostCenterCollection:
    """
    Cost Center Collection Resource

    This class handles CRUD operations for cost center collection.
    It provides endpoints for listing all cost centers and creating new cost centers.
    Cost centers represent organizational units for cost allocation in the energy management system.
    """
    def __init__(self):
        """Initialize CostCenterCollection"""
        pass

    @staticmethod
    def on_options(req, resp):
        """Handle OPTIONS requests for CORS preflight"""
        _ = req
        resp.status = falcon.HTTP_200

    @staticmethod
    def on_get(req, resp):
        """Handles GET requests"""
        if 'API-KEY' not in req.headers or \
                not isinstance(req.headers['API-KEY'], str) or \
                len(str.strip(req.headers['API-KEY'])) == 0:
            access_control(req)
        else:
            api_key_control(req)

        authorized_space_ids = get_costcenter_scope(req)
        enterprise_space_id = get_request_enterprise_space_id(req)

        # Redis cache key
        cache_key = get_costcenter_list_cache_key(req)
        cache_expire = 28800  # 8 hours in seconds (long-term cache)

        # Try to get from Redis cache (only if Redis is enabled)
        redis_client = None
        if config.redis.get('is_enabled', False) and cache_key is not None:
            try:
                redis_client = redis.Redis(
                    host=config.redis['host'],
                    port=config.redis['port'],
                    password=config.redis['password'] if config.redis['password'] else None,
                    db=config.redis['db'],
                    decode_responses=True,
                    socket_connect_timeout=2,
                    socket_timeout=2
                )
                redis_client.ping()
                cached_result = redis_client.get(cache_key)
                if cached_result:
                    resp.text = cached_result
                    return
            except Exception:
                # If Redis connection fails, continue to database query
                pass

        # Cache miss or Redis error - query database
        cnx = None
        cursor = None
        rows = []
        try:
            cnx = mysql.connector.connect(**config.myems_system_db)
            try:
                cursor = cnx.cursor()

                visible_cost_center_ids = query_visible_cost_center_ids(cursor, authorized_space_ids, enterprise_space_id)

                if visible_cost_center_ids == set():
                    rows = list()
                else:
                    query = (" SELECT id, name, uuid, external_id, enterprise_space_id "
                             " FROM tbl_cost_centers ")
                    params = tuple()
                    if visible_cost_center_ids is not None:
                        placeholders = ', '.join(['%s'] * len(visible_cost_center_ids))
                        query += f" WHERE id IN ({placeholders})"
                        params = tuple(sorted(visible_cost_center_ids))
                    query += " ORDER BY id"
                    cursor.execute(query, params)
                    rows = cursor.fetchall()
            finally:
                if cursor:
                    cursor.close()
        finally:
            if cnx:
                cnx.close()

        result = list()
        if rows is not None and len(rows) > 0:
            for row in rows:
                meta_result = {"id": row[0],
                               "name": row[1],
                               "uuid": row[2],
                               "external_id": row[3],
                               "enterprise_space_id": row[4]}
                result.append(meta_result)

        # Store result in Redis cache
        result_json = json.dumps(result)
        if redis_client and cache_key is not None:
            try:
                redis_client.setex(cache_key, cache_expire, result_json)
            except Exception:
                # If cache set fails, ignore and continue
                pass

        resp.text = result_json

    @staticmethod
    @user_logger
    def on_post(req, resp):
        """Handles POST requests"""
        admin_control(req)
        try:
            raw_json = req.stream.read().decode('utf-8')

        except UnicodeDecodeError as ex:
            print("Failed to decode request")
            raise falcon.HTTPError(status=falcon.HTTP_400,
                                   title='API.BAD_REQUEST',
                                   description='API.INVALID_ENCODING')
        except Exception as ex:
            print("Unexpected error reading request stream")
            raise falcon.HTTPError(status=falcon.HTTP_400,
                                   title='API.BAD_REQUEST',
                                   description='API.FAILED_TO_READ_REQUEST_STREAM')

        new_values = json.loads(raw_json)

        if 'name' not in new_values['data'].keys() or len(new_values['data']['name']) <= 0:
            raise falcon.HTTPError(status=falcon.HTTP_400, title='API.BAD_REQUEST',
                                   description='API.INVALID_NAME_VALUE')
        name = str.strip(new_values['data']['name'])

        if 'external_id' in new_values['data'].keys() and \
                new_values['data']['external_id'] is not None and \
                len(str(new_values['data']['external_id'])) > 0:
            external_id = str.strip(new_values['data']['external_id'])
        else:
            external_id = None

        enterprise_space_id = new_values['data'].get('enterprise_space_id') \
            if 'enterprise_space_id' in new_values['data'].keys() else get_request_enterprise_space_id(req)

        cnx = None
        cursor = None
        try:
            cnx = mysql.connector.connect(**config.myems_system_db)
            try:
                cursor = cnx.cursor()
                enterprise_space_id = validate_costcenter_enterprise_space_id(cursor, enterprise_space_id)

                cursor.execute(" SELECT name "
                               " FROM tbl_cost_centers "
                               " WHERE name = %s ", (name, ))
                if cursor.fetchone() is not None:
                    raise falcon.HTTPError(status=falcon.HTTP_400,
                                           title='API.BAD_REQUEST',
                                           description='API.COST_CENTER_NAME_EXISTS')
                if external_id is not None:
                    cursor.execute(" SELECT name "
                                   " FROM tbl_cost_centers "
                                   " WHERE external_id = %s ", (external_id, ))
                    if cursor.fetchone() is not None:
                        raise falcon.HTTPError(status=falcon.HTTP_400, title='API.BAD_REQUEST',
                                               description='API.COST_CENTER_EXTERNAL_ID_EXISTS')

                add_row = (" INSERT INTO tbl_cost_centers "
                           "     (name, uuid, external_id, enterprise_space_id) "
                           " VALUES (%s, %s, %s, %s) ")
                cursor.execute(add_row, (name,
                                         str(uuid.uuid4()),
                                         external_id,
                                         enterprise_space_id,))
                new_id = cursor.lastrowid
                cnx.commit()
            finally:
                if cursor:
                    cursor.close()
        finally:
            if cnx:
                cnx.close()

        # Clear cache after creating new cost center
        clear_costcenter_cache()

        resp.status = falcon.HTTP_201
        resp.location = '/costcenters/' + str(new_id)


class CostCenterItem:
    def __init__(self):
        pass

    @staticmethod
    def on_options(req, resp, id_):
        _ = req
        resp.status = falcon.HTTP_200
        _ = id_

    @staticmethod
    def on_get(req, resp, id_):
        """Handles GET requests"""
        if 'API-KEY' not in req.headers or \
                not isinstance(req.headers['API-KEY'], str) or \
                len(str.strip(req.headers['API-KEY'])) == 0:
            access_control(req)
        else:
            api_key_control(req)
        if not id_.isdigit() or int(id_) <= 0:
            raise falcon.HTTPError(status=falcon.HTTP_400, title='API.BAD_REQUEST',
                                   description='API.INVALID_COST_CENTER_ID')

        authorized_space_ids = get_costcenter_scope(req)
        enterprise_space_id = get_request_enterprise_space_id(req)

        # Redis cache key
        cache_key = get_costcenter_item_cache_key(req, id_)
        cache_expire = 28800  # 8 hours in seconds (long-term cache)

        # Try to get from Redis cache (only if Redis is enabled)
        redis_client = None
        if config.redis.get('is_enabled', False) and cache_key is not None:
            try:
                redis_client = redis.Redis(
                    host=config.redis['host'],
                    port=config.redis['port'],
                    password=config.redis['password'] if config.redis['password'] else None,
                    db=config.redis['db'],
                    decode_responses=True,
                    socket_connect_timeout=2,
                    socket_timeout=2
                )
                redis_client.ping()
                cached_result = redis_client.get(cache_key)
                if cached_result:
                    resp.text = cached_result
                    return
            except Exception:
                # If Redis connection fails, continue to database query
                pass

        # Cache miss or Redis error - query database
        cnx = None
        cursor = None
        row = None
        try:
            cnx = mysql.connector.connect(**config.myems_system_db)
            try:
                cursor = cnx.cursor()

                visible_cost_center_ids = query_visible_cost_center_ids(cursor, authorized_space_ids, enterprise_space_id)
                if visible_cost_center_ids is not None and int(id_) not in visible_cost_center_ids:
                    raise falcon.HTTPError(status=falcon.HTTP_404, title='API.NOT_FOUND',
                                           description='API.COST_CENTER_NOT_FOUND')

                query = (" SELECT id, name, uuid, external_id, enterprise_space_id "
                         " FROM tbl_cost_centers "
                         " WHERE id = %s ")
                cursor.execute(query, (id_,))
                row = cursor.fetchone()

                if row is None:
                    raise falcon.HTTPError(status=falcon.HTTP_404, title='API.NOT_FOUND',
                                           description='API.COST_CENTER_NOT_FOUND')
            finally:
                if cursor:
                    cursor.close()
        finally:
            if cnx:
                cnx.close()

        result = {"id": row[0],
                  "name": row[1],
                  "uuid": row[2],
                  "external_id": row[3],
                  "enterprise_space_id": row[4]}

        # Store result in Redis cache
        result_json = json.dumps(result)
        if redis_client and cache_key is not None:
            try:
                redis_client.setex(cache_key, cache_expire, result_json)
            except Exception:
                # If cache set fails, ignore and continue
                pass

        resp.text = result_json

    @staticmethod
    @user_logger
    def on_delete(req, resp, id_):
        """Handles DELETE requests"""
        admin_control(req)
        if not id_.isdigit() or int(id_) <= 0:
            raise falcon.HTTPError(status=falcon.HTTP_400, title='API.BAD_REQUEST',
                                   description='API.INVALID_COST_CENTER_ID')

        cnx = None
        cursor = None
        try:
            cnx = mysql.connector.connect(**config.myems_system_db)
            try:
                cursor = cnx.cursor()

                cursor.execute(" SELECT name, enterprise_space_id "
                               " FROM tbl_cost_centers "
                               " WHERE id = %s ", (id_,))
                row = cursor.fetchone()
                if row is None:
                    raise falcon.HTTPError(status=falcon.HTTP_404, title='API.NOT_FOUND',
                                           description='API.COST_CENTER_NOT_FOUND')

                # check relation with charging_stations
                cursor.execute(" SELECT id "
                               " FROM tbl_charging_stations "
                               " WHERE cost_center_id = %s ", (id_,))
                rows_charging_stations = cursor.fetchall()
                if rows_charging_stations is not None and len(rows_charging_stations) > 0:
                    raise falcon.HTTPError(status=falcon.HTTP_400,
                                           title='API.BAD_REQUEST',
                                           description='API.THERE_IS_RELATION_WITH_CHARGING_STATIONS')

                # check relation with energy_storage_containers
                cursor.execute(" SELECT id "
                               " FROM tbl_energy_storage_containers "
                               " WHERE cost_center_id = %s ", (id_,))
                rows_energy_storage_containers = cursor.fetchall()
                if rows_energy_storage_containers is not None and len(rows_energy_storage_containers) > 0:
                    raise falcon.HTTPError(status=falcon.HTTP_400,
                                           title='API.BAD_REQUEST',
                                           description='API.THERE_IS_RELATION_WITH_ENERGY_STORAGE_CONTAINERS')

                # check relation with energy_storage_power_stations
                cursor.execute(" SELECT id "
                               " FROM tbl_energy_storage_power_stations "
                               " WHERE cost_center_id = %s ", (id_,))
                rows_energy_storage_power_stations = cursor.fetchall()
                if rows_energy_storage_power_stations is not None and len(rows_energy_storage_power_stations) > 0:
                    raise falcon.HTTPError(status=falcon.HTTP_400,
                                           title='API.BAD_REQUEST',
                                           description='API.THERE_IS_RELATION_WITH_ENERGY_STORAGE_POWER_STATIONS')

                # check relation with microgrids
                cursor.execute(" SELECT id "
                               " FROM tbl_microgrids "
                               " WHERE cost_center_id = %s ", (id_,))
                rows_microgrids = cursor.fetchall()
                if rows_microgrids is not None and len(rows_microgrids) > 0:
                    raise falcon.HTTPError(status=falcon.HTTP_400,
                                           title='API.BAD_REQUEST',
                                           description='API.THERE_IS_RELATION_WITH_MICROGRIDS')

                # check relation with photovoltaic_power_stations
                cursor.execute(" SELECT id "
                               " FROM tbl_photovoltaic_power_stations "
                               " WHERE cost_center_id = %s ", (id_,))
                rows_photovoltaic_power_stations = cursor.fetchall()
                if rows_photovoltaic_power_stations is not None and len(rows_photovoltaic_power_stations) > 0:
                    raise falcon.HTTPError(status=falcon.HTTP_400,
                                           title='API.BAD_REQUEST',
                                           description='API.THERE_IS_RELATION_WITH_PHOTOVOLTAIC_POWER_STATIONS')

                # check relation with virtual_power_plants
                cursor.execute(" SELECT id "
                               " FROM tbl_virtual_power_plants "
                               " WHERE cost_center_id = %s ", (id_,))
                rows_virtual_power_plants = cursor.fetchall()
                if rows_virtual_power_plants is not None and len(rows_virtual_power_plants) > 0:
                    raise falcon.HTTPError(status=falcon.HTTP_400,
                                           title='API.BAD_REQUEST',
                                           description='API.THERE_IS_RELATION_WITH_VIRTUAL_POWER_PLANTS')

                # check relation with wind_farms
                cursor.execute(" SELECT id "
                               " FROM tbl_wind_farms "
                               " WHERE cost_center_id = %s ", (id_,))
                rows_wind_farms = cursor.fetchall()
                if rows_wind_farms is not None and len(rows_wind_farms) > 0:
                    raise falcon.HTTPError(status=falcon.HTTP_400,
                                           title='API.BAD_REQUEST',
                                           description='API.THERE_IS_RELATION_WITH_WIND_FARMS')

                # check relation with equipments
                cursor.execute(" SELECT id "
                               " FROM tbl_equipments "
                               " WHERE cost_center_id = %s ", (id_,))
                rows_equipments = cursor.fetchall()
                if rows_equipments is not None and len(rows_equipments) > 0:
                    raise falcon.HTTPError(status=falcon.HTTP_400,
                                           title='API.BAD_REQUEST',
                                           description='API.THERE_IS_RELATION_WITH_EQUIPMENTS')

                # check relation with combined equipments
                cursor.execute(" SELECT id "
                               " FROM tbl_combined_equipments "
                               " WHERE cost_center_id = %s ", (id_,))
                rows_combined_equipments = cursor.fetchall()
                if rows_combined_equipments is not None and len(rows_combined_equipments) > 0:
                    raise falcon.HTTPError(status=falcon.HTTP_400,
                                           title='API.BAD_REQUEST',
                                           description='API.THERE_IS_RELATION_WITH_COMBINED_EQUIPMENTS')

                # check relation with meters
                cursor.execute(" SELECT id "
                               " FROM tbl_meters "
                               " WHERE cost_center_id = %s ", (id_,))
                rows_meters = cursor.fetchall()
                if rows_meters is not None and len(rows_meters) > 0:
                    raise falcon.HTTPError(status=falcon.HTTP_400,
                                           title='API.BAD_REQUEST',
                                           description='API.THERE_IS_RELATION_WITH_METERS')

                # check relation with offline meters
                cursor.execute(" SELECT id "
                               " FROM tbl_offline_meters "
                               " WHERE cost_center_id = %s ", (id_,))
                rows_offline_meters = cursor.fetchall()
                if rows_offline_meters is not None and len(rows_offline_meters) > 0:
                    raise falcon.HTTPError(status=falcon.HTTP_400,
                                           title='API.BAD_REQUEST',
                                           description='API.THERE_IS_RELATION_WITH_OFFLINE_METERS')

                # check relation with virtual meters
                cursor.execute(" SELECT id "
                               " FROM tbl_virtual_meters "
                               " WHERE cost_center_id = %s ", (id_,))
                rows_virtual_meters = cursor.fetchall()
                if rows_virtual_meters is not None and len(rows_virtual_meters) > 0:
                    raise falcon.HTTPError(status=falcon.HTTP_400,
                                           title='API.BAD_REQUEST',
                                           description='API.THERE_IS_RELATION_WITH_OFFLINE_METERS')

                # check relation with tenants
                cursor.execute(" SELECT id "
                               " FROM tbl_tenants "
                               " WHERE cost_center_id = %s ", (id_,))
                rows_tenants = cursor.fetchall()
                if rows_tenants is not None and len(rows_tenants) > 0:
                    raise falcon.HTTPError(status=falcon.HTTP_400,
                                           title='API.BAD_REQUEST',
                                           description='API.THERE_IS_RELATION_WITH_TENANTS')

                # check relation with stores
                cursor.execute(" SELECT id "
                               " FROM tbl_stores "
                               " WHERE cost_center_id = %s ", (id_,))
                rows_stores = cursor.fetchall()
                if rows_stores is not None and len(rows_stores) > 0:
                    raise falcon.HTTPError(status=falcon.HTTP_400,
                                           title='API.BAD_REQUEST',
                                           description='API.THERE_IS_RELATION_WITH_STORES')

                # check relation with spaces
                cursor.execute(" SELECT id "
                               " FROM tbl_spaces "
                               " WHERE cost_center_id = %s ", (id_,))
                rows_factories = cursor.fetchall()
                if rows_factories is not None and len(rows_factories) > 0:
                    raise falcon.HTTPError(status=falcon.HTTP_400,
                                           title='API.BAD_REQUEST',
                                           description='API.THERE_IS_RELATION_WITH_SPACES')

                # check relation with shopfloors
                cursor.execute(" SELECT id "
                               " FROM tbl_shopfloors "
                               " WHERE cost_center_id = %s ", (id_,))
                rows_shopfloors = cursor.fetchall()
                if rows_shopfloors is not None and len(rows_shopfloors) > 0:
                    raise falcon.HTTPError(status=falcon.HTTP_400,
                                           title='API.BAD_REQUEST',
                                           description='API.THERE_IS_RELATION_WITH_SHOPFLOORS')

                # delete relation with tariffs
                cursor.execute(" DELETE FROM tbl_cost_centers_tariffs WHERE cost_center_id = %s ", (id_,))

                cursor.execute(" DELETE FROM tbl_cost_centers WHERE id = %s ", (id_,))
                cnx.commit()
            finally:
                if cursor:
                    cursor.close()
        finally:
            if cnx:
                cnx.close()

        # Clear cache after deleting cost center
        clear_costcenter_cache(cost_center_id=id_)

        resp.status = falcon.HTTP_204

    @staticmethod
    @user_logger
    def on_put(req, resp, id_):
        """Handles PUT requests"""
        admin_control(req)
        try:
            raw_json = req.stream.read().decode('utf-8')
        except UnicodeDecodeError as ex:
            print("Failed to decode request")
            raise falcon.HTTPError(status=falcon.HTTP_400,
                                   title='API.BAD_REQUEST',
                                   description='API.INVALID_ENCODING')
        except Exception as ex:
            print("Unexpected error reading request stream")
            raise falcon.HTTPError(status=falcon.HTTP_400,
                                   title='API.BAD_REQUEST',
                                   description='API.FAILED_TO_READ_REQUEST_STREAM')

        if not id_.isdigit() or int(id_) <= 0:
            raise falcon.HTTPError(status=falcon.HTTP_400, title='API.BAD_REQUEST',
                                   description='API.INVALID_COST_CENTER_ID')

        new_values = json.loads(raw_json)

        if 'name' not in new_values['data'].keys() or len(new_values['data']['name']) <= 0:
            raise falcon.HTTPError(status=falcon.HTTP_400, title='API.BAD_REQUEST',
                                   description='API.INVALID_NAME_VALUE')
        name = str.strip(new_values['data']['name'])

        if 'external_id' in new_values['data'].keys() and \
                new_values['data']['external_id'] is not None and \
                len(str(new_values['data']['external_id'])) > 0:
            external_id = str.strip(new_values['data']['external_id'])
        else:
            external_id = None

        cnx = None
        cursor = None
        try:
            cnx = mysql.connector.connect(**config.myems_system_db)
            try:
                cursor = cnx.cursor()

                cursor.execute(" SELECT name, enterprise_space_id "
                               " FROM tbl_cost_centers "
                               " WHERE id = %s ", (id_,))
                row = cursor.fetchone()
                if row is None:
                    raise falcon.HTTPError(status=falcon.HTTP_404, title='API.NOT_FOUND',
                                           description='API.COST_CENTER_NOT_FOUND')

                enterprise_space_id = row[1]
                if 'enterprise_space_id' in new_values['data'].keys():
                    enterprise_space_id = new_values['data']['enterprise_space_id']
                elif enterprise_space_id is None:
                    enterprise_space_id = get_request_enterprise_space_id(req)

                enterprise_space_id = validate_costcenter_enterprise_space_id(cursor, enterprise_space_id)

                cursor.execute(" SELECT name "
                               " FROM tbl_cost_centers "
                               " WHERE name = %s AND id != %s ",
                               (name, id_, ))
                if cursor.fetchone() is not None:
                    raise falcon.HTTPError(status=falcon.HTTP_400,
                                           title='API.BAD_REQUEST',
                                           description='API.COST_CENTER_NAME_EXISTS')
                if external_id is not None:
                    cursor.execute(" SELECT name "
                                   " FROM tbl_cost_centers "
                                   " WHERE external_id = %s AND id != %s ",
                                   (external_id, id_, ))
                    if cursor.fetchone() is not None:
                        raise falcon.HTTPError(status=falcon.HTTP_400,
                                               title='API.BAD_REQUEST',
                                               description='API.COST_CENTER_EXTERNAL_ID_EXISTS')

                update_row = (" UPDATE tbl_cost_centers "
                              " SET name = %s, external_id = %s, enterprise_space_id = %s "
                              " WHERE id = %s ")

                cursor.execute(update_row, (name,
                                            external_id,
                                            enterprise_space_id,
                                            id_,))
                cnx.commit()
            finally:
                if cursor:
                    cursor.close()
        finally:
            if cnx:
                cnx.close()

        # Clear cache after updating cost center
        clear_costcenter_cache(cost_center_id=id_)

        resp.status = falcon.HTTP_200


class CostCenterTariffCollection:
    def __init__(self):
        pass

    @staticmethod
    def on_options(req, resp, id_):
        _ = req
        resp.status = falcon.HTTP_200
        _ = id_

    @staticmethod
    def on_get(req, resp, id_):
        """Handles GET requests"""
        if 'API-KEY' not in req.headers or \
                not isinstance(req.headers['API-KEY'], str) or \
                len(str.strip(req.headers['API-KEY'])) == 0:
            access_control(req)
        else:
            api_key_control(req)
        if not id_.isdigit() or int(id_) <= 0:
            raise falcon.HTTPError(status=falcon.HTTP_400, title='API.BAD_REQUEST',
                                   description='API.INVALID_COST_CENTER_ID')

        authorized_space_ids = get_costcenter_scope(req)
        enterprise_space_id = get_request_enterprise_space_id(req)

        # Redis cache key
        cache_key = get_costcenter_tariff_cache_key(req, id_)
        cache_expire = 28800  # 8 hours in seconds (long-term cache)

        # Try to get from Redis cache (only if Redis is enabled)
        redis_client = None
        if config.redis.get('is_enabled', False) and cache_key is not None:
            try:
                redis_client = redis.Redis(
                    host=config.redis['host'],
                    port=config.redis['port'],
                    password=config.redis['password'] if config.redis['password'] else None,
                    db=config.redis['db'],
                    decode_responses=True,
                    socket_connect_timeout=2,
                    socket_timeout=2
                )
                redis_client.ping()
                cached_result = redis_client.get(cache_key)
                if cached_result:
                    resp.text = cached_result
                    return
            except Exception:
                # If Redis connection fails, continue to database query
                pass

        # Cache miss or Redis error - query database
        cnx = None
        cursor = None
        rows = []
        try:
            cnx = mysql.connector.connect(**config.myems_system_db)
            try:
                cursor = cnx.cursor()

                visible_cost_center_ids = query_visible_cost_center_ids(cursor, authorized_space_ids, enterprise_space_id)
                if visible_cost_center_ids is not None and int(id_) not in visible_cost_center_ids:
                    raise falcon.HTTPError(status=falcon.HTTP_404, title='API.NOT_FOUND',
                                           description='API.COST_CENTER_NOT_FOUND')

                query = (" SELECT t.id, t.name, t.uuid, "
                         "        t.tariff_type, t.unit_of_price "
                         " FROM tbl_tariffs t, tbl_cost_centers_tariffs ct "
                         " WHERE t.id = ct.tariff_id AND ct.cost_center_id = %s "
                         " ORDER BY t.name ")
                cursor.execute(query, (id_,))
                rows = cursor.fetchall()
            finally:
                if cursor:
                    cursor.close()
        finally:
            if cnx:
                cnx.close()

        result = list()
        if rows is not None and len(rows) > 0:
            for row in rows:
                meta_result = {"id": row[0],
                               "name": row[1],
                               "uuid": row[2],
                               "tariff_type": row[3],
                               "unit_of_price": row[4]}
                result.append(meta_result)

        # Store result in Redis cache
        result_json = json.dumps(result)
        if redis_client and cache_key is not None:
            try:
                redis_client.setex(cache_key, cache_expire, result_json)
            except Exception:
                # If cache set fails, ignore and continue
                pass

        resp.text = result_json

    @staticmethod
    @user_logger
    def on_post(req, resp, id_):
        """Handles POST requests"""
        admin_control(req)
        try:
            raw_json = req.stream.read().decode('utf-8')
        except UnicodeDecodeError as ex:
            print("Failed to decode request")
            raise falcon.HTTPError(status=falcon.HTTP_400,
                                   title='API.BAD_REQUEST',
                                   description='API.INVALID_ENCODING')
        except Exception as ex:
            print("Unexpected error reading request stream")
            raise falcon.HTTPError(status=falcon.HTTP_400,
                                   title='API.BAD_REQUEST',
                                   description='API.FAILED_TO_READ_REQUEST_STREAM')

        if not id_.isdigit() or int(id_) <= 0:
            raise falcon.HTTPError(status=falcon.HTTP_400, title='API.BAD_REQUEST',
                                   description='API.INVALID_COST_CENTER_ID')

        new_values = json.loads(raw_json)

        cnx = None
        cursor = None
        try:
            cnx = mysql.connector.connect(**config.myems_system_db)
            try:
                cursor = cnx.cursor()

                cursor.execute(" SELECT name "
                               " FROM tbl_cost_centers "
                               " WHERE id = %s ", (id_,))
                if cursor.fetchone() is None:
                    raise falcon.HTTPError(status=falcon.HTTP_404, title='API.NOT_FOUND',
                                           description='API.COST_CENTER_NOT_FOUND')

                cursor.execute(" SELECT name "
                               " FROM tbl_tariffs "
                               " WHERE id = %s ", (new_values['data']['tariff_id'],))
                if cursor.fetchone() is None:
                    raise falcon.HTTPError(status=falcon.HTTP_404, title='API.NOT_FOUND',
                                           description='API.TARIFF_NOT_FOUND')

                cursor.execute(" SELECT id "
                               " FROM tbl_cost_centers_tariffs "
                               " WHERE cost_center_id = %s AND tariff_id = %s ", (id_, new_values['data']['tariff_id']))
                rows = cursor.fetchall()
                if rows is not None and len(rows) > 0:
                    raise falcon.HTTPError(status=falcon.HTTP_400, title='API.BAD_REQUEST',
                                           description='API.TARIFF_IS_ALREADY_ASSOCIATED_WITH_COST_CENTER')

                add_row = (" INSERT INTO tbl_cost_centers_tariffs "
                           "             (cost_center_id, tariff_id) "
                           " VALUES (%s, %s) ")
                cursor.execute(add_row, (id_, new_values['data']['tariff_id'],))
                cnx.commit()
            finally:
                if cursor:
                    cursor.close()
        finally:
            if cnx:
                cnx.close()

        # Clear cache after adding tariff to cost center
        clear_costcenter_cache(cost_center_id=id_)

        resp.status = falcon.HTTP_201
        resp.location = '/costcenters/' + str(id_) + '/tariffs/' + str(new_values['data']['tariff_id'])


class CostCenterTariffItem:
    def __init__(self):
        pass

    @staticmethod
    def on_options(req, resp, id_, tid):
        _ = req
        resp.status = falcon.HTTP_200
        _ = id_

    @staticmethod
    @user_logger
    def on_delete(req, resp, id_, tid):
        """Handles DELETE requests"""
        admin_control(req)
        if not id_.isdigit() or int(id_) <= 0:
            raise falcon.HTTPError(status=falcon.HTTP_400, title='API.BAD_REQUEST',
                                   description='API.INVALID_COST_CENTER_ID')

        if not tid.isdigit() or int(tid) <= 0:
            raise falcon.HTTPError(status=falcon.HTTP_400, title='API.BAD_REQUEST',
                                   description='API.INVALID_TARIFF_ID')

        cnx = None
        cursor = None
        try:
            cnx = mysql.connector.connect(**config.myems_system_db)
            try:
                cursor = cnx.cursor()

                cursor.execute(" SELECT name "
                               " FROM tbl_cost_centers "
                               " WHERE id = %s ", (id_,))
                if cursor.fetchone() is None:
                    raise falcon.HTTPError(status=falcon.HTTP_404, title='API.NOT_FOUND',
                                           description='API.COST_CENTER_NOT_FOUND')

                cursor.execute(" SELECT name "
                               " FROM tbl_tariffs "
                               " WHERE id = %s ", (tid,))
                if cursor.fetchone() is None:
                    raise falcon.HTTPError(status=falcon.HTTP_404, title='API.NOT_FOUND',
                                           description='API.TARIFF_NOT_FOUND')

                cursor.execute(" SELECT id "
                               " FROM tbl_cost_centers_tariffs "
                               " WHERE cost_center_id = %s AND tariff_id = %s ", (id_, tid))
                if cursor.fetchone() is None:
                    raise falcon.HTTPError(status=falcon.HTTP_404, title='API.NOT_FOUND',
                                           description='API.TARIFF_IS_NOT_ASSOCIATED_WITH_COST_CENTER')

                cursor.execute(" DELETE FROM tbl_cost_centers_tariffs "
                               " WHERE cost_center_id = %s AND tariff_id = %s ", (id_, tid))
                cnx.commit()
            finally:
                if cursor:
                    cursor.close()
        finally:
            if cnx:
                cnx.close()

        # Clear cache after removing tariff from cost center
        clear_costcenter_cache(cost_center_id=id_)

        resp.status = falcon.HTTP_204
