import uuid
from decimal import Decimal, InvalidOperation

import falcon
import mysql.connector
import redis
import simplejson as json

from core.useractivity import user_logger, admin_control, access_control, api_key_control
import config


def clear_product_cache(product_id=None):
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

        list_cache_key_pattern = 'product:list:*'
        matching_keys = redis_client.keys(list_cache_key_pattern)
        if matching_keys:
            redis_client.delete(*matching_keys)

        if product_id:
            redis_client.delete(f'product:item:{product_id}')
    except Exception:
        pass


def normalize_product_payload(new_values):
    if 'name' not in new_values['data'].keys() or \
            not isinstance(new_values['data']['name'], str) or \
            len(str.strip(new_values['data']['name'])) == 0:
        raise falcon.HTTPError(status=falcon.HTTP_400, title='API.BAD_REQUEST',
                               description='API.INVALID_PRODUCT_NAME')
    name = str.strip(new_values['data']['name'])

    if 'unit_of_measure' not in new_values['data'].keys() or \
            not isinstance(new_values['data']['unit_of_measure'], str) or \
            len(str.strip(new_values['data']['unit_of_measure'])) == 0:
        raise falcon.HTTPError(status=falcon.HTTP_400, title='API.BAD_REQUEST',
                               description='API.INVALID_PRODUCT_UNIT')
    unit_of_measure = str.strip(new_values['data']['unit_of_measure'])

    if 'tag' in new_values['data'].keys() and \
            new_values['data']['tag'] is not None and \
            len(str(new_values['data']['tag'])) > 0:
        tag = str.strip(new_values['data']['tag'])
    else:
        tag = ''

    if 'standard_product_coefficient' not in new_values['data'].keys():
        standard_product_coefficient = Decimal('1.0')
    else:
        raw_coefficient = new_values['data']['standard_product_coefficient']
        try:
            standard_product_coefficient = Decimal(str(raw_coefficient))
        except (InvalidOperation, ValueError, TypeError):
            raise falcon.HTTPError(status=falcon.HTTP_400, title='API.BAD_REQUEST',
                                   description='API.INVALID_STANDARD_PRODUCT_COEFFICIENT')
        if standard_product_coefficient <= 0:
            raise falcon.HTTPError(status=falcon.HTTP_400, title='API.BAD_REQUEST',
                                   description='API.INVALID_STANDARD_PRODUCT_COEFFICIENT')

    return name, unit_of_measure, tag, standard_product_coefficient


class ProductCollection:
    def __init__(self):
        pass

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

        search_query = req.get_param('q', default='').strip()
        cache_key = f'product:list:{search_query}'
        cache_expire = 28800

        redis_client = None
        if config.redis.get('is_enabled', False):
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
                pass

        cnx = None
        cursor = None
        rows = []
        try:
            cnx = mysql.connector.connect(**config.myems_production_db)
            try:
                cursor = cnx.cursor()

                query = (" SELECT id, name, uuid, unit_of_measure, tag, standard_product_coefficient "
                         " FROM tbl_products ")
                params = []
                if search_query:
                    query += " WHERE name LIKE %s OR tag LIKE %s "
                    params = [f'%{search_query}%', f'%{search_query}%']
                query += " ORDER BY name "
                cursor.execute(query, params)
                rows = cursor.fetchall()
            finally:
                if cursor:
                    cursor.close()
        finally:
            if cnx:
                cnx.close()

        result = []
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

        result_json = json.dumps(result, use_decimal=True)
        if redis_client:
            try:
                redis_client.setex(cache_key, cache_expire, result_json)
            except Exception:
                pass

        resp.text = result_json

    @staticmethod
    @user_logger
    def on_post(req, resp):
        admin_control(req)
        try:
            raw_json = req.stream.read().decode('utf-8')
        except UnicodeDecodeError:
            raise falcon.HTTPError(status=falcon.HTTP_400, title='API.BAD_REQUEST',
                                   description='API.INVALID_ENCODING')
        except Exception:
            raise falcon.HTTPError(status=falcon.HTTP_400, title='API.BAD_REQUEST',
                                   description='API.FAILED_TO_READ_REQUEST_STREAM')

        new_values = json.loads(raw_json)
        name, unit_of_measure, tag, standard_product_coefficient = normalize_product_payload(new_values)

        cnx = None
        cursor = None
        try:
            cnx = mysql.connector.connect(**config.myems_production_db)
            try:
                cursor = cnx.cursor()
                cursor.execute(" SELECT name FROM tbl_products WHERE name = %s ", (name,))
                if cursor.fetchone() is not None:
                    raise falcon.HTTPError(status=falcon.HTTP_400, title='API.BAD_REQUEST',
                                           description='API.PRODUCT_NAME_IS_ALREADY_IN_USE')

                add_row = (" INSERT INTO tbl_products "
                           "     (name, uuid, unit_of_measure, tag, standard_product_coefficient) "
                           " VALUES (%s, %s, %s, %s, %s) ")
                cursor.execute(add_row, (name,
                                         str(uuid.uuid4()),
                                         unit_of_measure,
                                         tag,
                                         standard_product_coefficient))
                new_id = cursor.lastrowid
                cnx.commit()
            finally:
                if cursor:
                    cursor.close()
        finally:
            if cnx:
                cnx.close()

        clear_product_cache()
        resp.status = falcon.HTTP_201
        resp.location = '/products/' + str(new_id)


class ProductItem:
    def __init__(self):
        pass

    @staticmethod
    def on_options(req, resp, id_):
        _ = req
        _ = id_
        resp.status = falcon.HTTP_200

    @staticmethod
    def on_get(req, resp, id_):
        if 'API-KEY' not in req.headers or \
                not isinstance(req.headers['API-KEY'], str) or \
                len(str.strip(req.headers['API-KEY'])) == 0:
            access_control(req)
        else:
            api_key_control(req)
        if not id_.isdigit() or int(id_) <= 0:
            raise falcon.HTTPError(status=falcon.HTTP_400, title='API.BAD_REQUEST',
                                   description='API.INVALID_PRODUCT_ID')

        cache_key = f'product:item:{id_}'
        cache_expire = 28800

        redis_client = None
        if config.redis.get('is_enabled', False):
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
                pass

        cnx = None
        cursor = None
        row = None
        try:
            cnx = mysql.connector.connect(**config.myems_production_db)
            try:
                cursor = cnx.cursor()
                cursor.execute(" SELECT id, name, uuid, unit_of_measure, tag, standard_product_coefficient "
                               " FROM tbl_products WHERE id = %s ", (id_,))
                row = cursor.fetchone()
            finally:
                if cursor:
                    cursor.close()
        finally:
            if cnx:
                cnx.close()

        if row is None:
            raise falcon.HTTPError(status=falcon.HTTP_404, title='API.NOT_FOUND',
                                   description='API.PRODUCT_NOT_FOUND')

        result = {
            'id': row[0],
            'name': row[1],
            'uuid': row[2],
            'unit_of_measure': row[3],
            'tag': row[4],
            'standard_product_coefficient': row[5]
        }
        result_json = json.dumps(result, use_decimal=True)
        if redis_client:
            try:
                redis_client.setex(cache_key, cache_expire, result_json)
            except Exception:
                pass

        resp.text = result_json

    @staticmethod
    @user_logger
    def on_delete(req, resp, id_):
        admin_control(req)
        if not id_.isdigit() or int(id_) <= 0:
            raise falcon.HTTPError(status=falcon.HTTP_400, title='API.BAD_REQUEST',
                                   description='API.INVALID_PRODUCT_ID')

        cnx_production = None
        cursor_production = None
        try:
            cnx_production = mysql.connector.connect(**config.myems_production_db)
            try:
                cursor_production = cnx_production.cursor()
                cursor_production.execute(" SELECT name FROM tbl_products WHERE id = %s ", (id_,))
                if cursor_production.fetchone() is None:
                    raise falcon.HTTPError(status=falcon.HTTP_404, title='API.NOT_FOUND',
                                           description='API.PRODUCT_NOT_FOUND')

                for relation_query, description in [
                    (" SELECT id FROM tbl_shifts WHERE product_id = %s ", 'API.THERE_IS_RELATION_WITH_SHIFTS'),
                    (" SELECT id FROM tbl_shopfloor_hourly WHERE product_id = %s ", 'API.THERE_IS_RELATION_WITH_SHOPFLOOR_HOURLY'),
                    (" SELECT id FROM tbl_shopfloors_products WHERE product_id = %s ", 'API.THERE_IS_RELATION_WITH_SHOPFLOORS'),
                    (" SELECT id FROM tbl_space_hourly WHERE product_id = %s ", 'API.THERE_IS_RELATION_WITH_SPACE_HOURLY')
                ]:
                    cursor_production.execute(relation_query, (id_,))
                    if cursor_production.fetchone() is not None:
                        raise falcon.HTTPError(status=falcon.HTTP_400, title='API.BAD_REQUEST',
                                               description=description)
            finally:
                if cursor_production:
                    cursor_production.close()
        finally:
            if cnx_production:
                cnx_production.close()

        cnx_system = None
        cursor_system = None
        try:
            cnx_system = mysql.connector.connect(**config.myems_system_db)
            try:
                cursor_system = cnx_system.cursor()
                cursor_system.execute(" SELECT id FROM tbl_spaces_products WHERE product_id = %s ", (id_,))
                if cursor_system.fetchone() is not None:
                    raise falcon.HTTPError(status=falcon.HTTP_400, title='API.BAD_REQUEST',
                                           description='API.THERE_IS_RELATION_WITH_SPACES')

                cursor_system.execute(" SELECT id FROM tbl_meters WHERE product_id = %s ", (id_,))
                if cursor_system.fetchone() is not None:
                    raise falcon.HTTPError(status=falcon.HTTP_400, title='API.BAD_REQUEST',
                                           description='API.THERE_IS_RELATION_WITH_METERS')
            finally:
                if cursor_system:
                    cursor_system.close()
        finally:
            if cnx_system:
                cnx_system.close()

        cnx_production = None
        cursor_production = None
        try:
            cnx_production = mysql.connector.connect(**config.myems_production_db)
            try:
                cursor_production = cnx_production.cursor()
                cursor_production.execute(" DELETE FROM tbl_products WHERE id = %s ", (id_,))
                cnx_production.commit()
            finally:
                if cursor_production:
                    cursor_production.close()
        finally:
            if cnx_production:
                cnx_production.close()

        clear_product_cache(product_id=id_)
        resp.status = falcon.HTTP_204

    @staticmethod
    @user_logger
    def on_put(req, resp, id_):
        admin_control(req)
        try:
            raw_json = req.stream.read().decode('utf-8')
        except UnicodeDecodeError:
            raise falcon.HTTPError(status=falcon.HTTP_400, title='API.BAD_REQUEST',
                                   description='API.INVALID_ENCODING')
        except Exception:
            raise falcon.HTTPError(status=falcon.HTTP_400, title='API.BAD_REQUEST',
                                   description='API.FAILED_TO_READ_REQUEST_STREAM')

        if not id_.isdigit() or int(id_) <= 0:
            raise falcon.HTTPError(status=falcon.HTTP_400, title='API.BAD_REQUEST',
                                   description='API.INVALID_PRODUCT_ID')

        new_values = json.loads(raw_json)
        name, unit_of_measure, tag, standard_product_coefficient = normalize_product_payload(new_values)

        cnx = None
        cursor = None
        try:
            cnx = mysql.connector.connect(**config.myems_production_db)
            try:
                cursor = cnx.cursor()

                cursor.execute(" SELECT name FROM tbl_products WHERE id = %s ", (id_,))
                if cursor.fetchone() is None:
                    raise falcon.HTTPError(status=falcon.HTTP_404, title='API.NOT_FOUND',
                                           description='API.PRODUCT_NOT_FOUND')

                cursor.execute(" SELECT name FROM tbl_products WHERE name = %s AND id != %s ", (name, id_))
                if cursor.fetchone() is not None:
                    raise falcon.HTTPError(status=falcon.HTTP_400, title='API.BAD_REQUEST',
                                           description='API.PRODUCT_NAME_IS_ALREADY_IN_USE')

                update_row = (" UPDATE tbl_products "
                              " SET name = %s, unit_of_measure = %s, tag = %s, standard_product_coefficient = %s "
                              " WHERE id = %s ")
                cursor.execute(update_row, (name,
                                            unit_of_measure,
                                            tag,
                                            standard_product_coefficient,
                                            id_))
                cnx.commit()
            finally:
                if cursor:
                    cursor.close()
        finally:
            if cnx:
                cnx.close()

        clear_product_cache(product_id=id_)
        resp.status = falcon.HTTP_200
