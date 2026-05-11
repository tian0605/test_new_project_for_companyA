import falcon
import mysql.connector
import simplejson as json
import redis
from core.useractivity import user_logger, admin_control
from core.menu import clear_menu_cache
import config


VALID_MENU_TEMPLATE_TYPES = {'admin', 'web', 'hybrid'}


def sanitize_template_routes(routes):
    if routes is None:
        return list()
    if not isinstance(routes, list):
        raise falcon.HTTPError(status=falcon.HTTP_400,
                               title='API.BAD_REQUEST',
                               description='API.INVALID_MENU_TEMPLATE_DATA')

    sanitized_routes = []
    for route in routes:
        if not isinstance(route, str) or len(str.strip(route)) == 0:
            raise falcon.HTTPError(status=falcon.HTTP_400,
                                   title='API.BAD_REQUEST',
                                   description='API.INVALID_MENU_TEMPLATE_DATA')
        sanitized_routes.append(str.strip(route))

    return sorted(set(sanitized_routes))


def normalize_menu_template_data(template_data):
    if not isinstance(template_data, dict):
        raise falcon.HTTPError(status=falcon.HTTP_400,
                               title='API.BAD_REQUEST',
                               description='API.INVALID_MENU_TEMPLATE_DATA')

    template_type = template_data.get('template_type', 'admin')
    if not isinstance(template_type, str):
        raise falcon.HTTPError(status=falcon.HTTP_400,
                               title='API.BAD_REQUEST',
                               description='API.INVALID_MENU_TEMPLATE_DATA')
    template_type = str.strip(template_type).lower()
    if template_type not in VALID_MENU_TEMPLATE_TYPES:
        raise falcon.HTTPError(status=falcon.HTTP_400,
                               title='API.BAD_REQUEST',
                               description='API.INVALID_MENU_TEMPLATE_DATA')

    normalized_data = {
        'template_type': template_type,
        'admin_routes': sanitize_template_routes(template_data.get('admin_routes')),
        'web_routes': sanitize_template_routes(template_data.get('web_routes'))
    }
    return normalized_data


def normalize_menu_template_data_from_raw(raw_template_data):
    try:
        template_data = json.loads(raw_template_data) if isinstance(raw_template_data, str) else raw_template_data
    except (TypeError, ValueError):
        return {
            'template_type': 'admin',
            'admin_routes': list(),
            'web_routes': list()
        }

    if not isinstance(template_data, dict):
        return {
            'template_type': 'admin',
            'admin_routes': list(),
            'web_routes': list()
        }

    try:
        return normalize_menu_template_data(template_data)
    except falcon.HTTPError:
        return {
            'template_type': 'admin',
            'admin_routes': list(),
            'web_routes': list()
        }


def get_menu_template_type_from_data(raw_template_data):
    return normalize_menu_template_data_from_raw(raw_template_data).get('template_type', 'admin')


def get_menu_template_list_cache_key():
    return 'G:menu-template:admin:list'


def clear_menu_template_cache():
    if not config.redis.get('is_enabled', False):
        clear_menu_cache()
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

        redis_client.delete('menu-template:list')
        scoped_keys = redis_client.keys('G:menu-template:admin:list')
        if scoped_keys:
            redis_client.delete(*scoped_keys)
    except Exception:
        pass

    clear_menu_cache()


def validate_menu_template_payload(new_values):
    if 'name' not in new_values['data'] or \
            not isinstance(new_values['data']['name'], str) or \
            len(str.strip(new_values['data']['name'])) == 0:
        raise falcon.HTTPError(status=falcon.HTTP_400,
                               title='API.BAD_REQUEST',
                               description='API.INVALID_MENU_TEMPLATE_NAME')
    name = str.strip(new_values['data']['name'])

    if 'data' not in new_values['data'] or \
            not isinstance(new_values['data']['data'], str) or \
            len(str.strip(new_values['data']['data'])) == 0:
        raise falcon.HTTPError(status=falcon.HTTP_400,
                               title='API.BAD_REQUEST',
                               description='API.INVALID_MENU_TEMPLATE_DATA')
    data = str.strip(new_values['data']['data'])

    try:
        template_data = json.loads(data)
    except (TypeError, ValueError):
        raise falcon.HTTPError(status=falcon.HTTP_400,
                               title='API.BAD_REQUEST',
                               description='API.INVALID_MENU_TEMPLATE_DATA')

    normalized_data = normalize_menu_template_data(template_data)
    return name, json.dumps(normalized_data)


class MenuTemplateCollection:
    def __init__(self):
        pass

    @staticmethod
    def on_options(req, resp):
        _ = req
        resp.status = falcon.HTTP_200

    @staticmethod
    def on_get(req, resp):
        admin_control(req)

        cache_key = get_menu_template_list_cache_key()
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
        try:
            cnx = mysql.connector.connect(**config.myems_user_db)
            try:
                cursor = cnx.cursor()
                cursor.execute(" SELECT id, name, data "
                               " FROM tbl_menu_templates "
                               " ORDER BY id DESC ")
                rows = cursor.fetchall()
                result = list()
                if rows is not None and len(rows) > 0:
                    for row in rows:
                        normalized_data = normalize_menu_template_data_from_raw(row[2])
                        result.append({
                            'id': row[0],
                            'name': row[1],
                            'data': json.dumps(normalized_data),
                            'template_type': normalized_data.get('template_type', 'admin')
                        })

                result_json = json.dumps(result)
                if redis_client:
                    try:
                        redis_client.setex(cache_key, cache_expire, result_json)
                    except Exception:
                        pass
                resp.text = result_json
            finally:
                if cursor:
                    cursor.close()
        finally:
            if cnx:
                cnx.close()

    @staticmethod
    @user_logger
    def on_post(req, resp):
        admin_control(req)
        try:
            raw_json = req.stream.read().decode('utf-8')
            new_values = json.loads(raw_json)
        except UnicodeDecodeError:
            raise falcon.HTTPError(status=falcon.HTTP_400,
                                   title='API.BAD_REQUEST',
                                   description='API.INVALID_ENCODING')
        except json.JSONDecodeError:
            raise falcon.HTTPError(status=falcon.HTTP_400,
                                   title='API.BAD_REQUEST',
                                   description='API.INVALID_JSON_FORMAT')
        except Exception:
            raise falcon.HTTPError(status=falcon.HTTP_400,
                                   title='API.BAD_REQUEST',
                                   description='API.FAILED_TO_READ_REQUEST_STREAM')

        name, data = validate_menu_template_payload(new_values)

        cnx = None
        cursor = None
        try:
            cnx = mysql.connector.connect(**config.myems_user_db)
            try:
                cursor = cnx.cursor()
                cursor.execute(" SELECT name FROM tbl_menu_templates WHERE name = %s ", (name,))
                if cursor.fetchone() is not None:
                    raise falcon.HTTPError(status=falcon.HTTP_400,
                                           title='API.BAD_REQUEST',
                                           description='API.MENU_TEMPLATE_NAME_IS_ALREADY_IN_USE')

                cursor.execute(" INSERT INTO tbl_menu_templates (name, data) VALUES (%s, %s) ",
                               (name, data))
                new_id = cursor.lastrowid
                cnx.commit()
            finally:
                if cursor:
                    cursor.close()
        finally:
            if cnx:
                cnx.close()

        clear_menu_template_cache()
        resp.status = falcon.HTTP_201
        resp.location = '/menu-templates/' + str(new_id)


class MenuTemplateItem:
    def __init__(self):
        pass

    @staticmethod
    def on_options(req, resp, id_):
        _ = req
        resp.status = falcon.HTTP_200
        _ = id_

    @staticmethod
    @user_logger
    def on_delete(req, resp, id_):
        admin_control(req)
        if not id_.isdigit() or int(id_) <= 0:
            raise falcon.HTTPError(status=falcon.HTTP_400,
                                   title='API.BAD_REQUEST',
                                   description='API.INVALID_MENU_TEMPLATE_ID')

        cnx = None
        cursor = None
        try:
            cnx = mysql.connector.connect(**config.myems_user_db)
            try:
                cursor = cnx.cursor()
                cursor.execute(" SELECT id FROM tbl_users WHERE menu_template_id = %s ", (id_,))
                if cursor.fetchone() is not None:
                    raise falcon.HTTPError(status=falcon.HTTP_400,
                                           title='API.BAD_REQUEST',
                                           description='API.THERE_IS_RELATION_WITH_USERS')

                cursor.execute(" SELECT name FROM tbl_menu_templates WHERE id = %s ", (id_,))
                if cursor.fetchone() is None:
                    raise falcon.HTTPError(status=falcon.HTTP_404,
                                           title='API.NOT_FOUND',
                                           description='API.MENU_TEMPLATE_NOT_FOUND')

                cursor.execute(" DELETE FROM tbl_menu_templates WHERE id = %s ", (id_,))
                cnx.commit()
            finally:
                if cursor:
                    cursor.close()
        finally:
            if cnx:
                cnx.close()

        clear_menu_template_cache()
        resp.status = falcon.HTTP_204

    @staticmethod
    @user_logger
    def on_put(req, resp, id_):
        admin_control(req)
        try:
            raw_json = req.stream.read().decode('utf-8')
            new_values = json.loads(raw_json)
        except UnicodeDecodeError:
            raise falcon.HTTPError(status=falcon.HTTP_400,
                                   title='API.BAD_REQUEST',
                                   description='API.INVALID_ENCODING')
        except json.JSONDecodeError:
            raise falcon.HTTPError(status=falcon.HTTP_400,
                                   title='API.BAD_REQUEST',
                                   description='API.INVALID_JSON_FORMAT')
        except Exception:
            raise falcon.HTTPError(status=falcon.HTTP_400,
                                   title='API.BAD_REQUEST',
                                   description='API.FAILED_TO_READ_REQUEST_STREAM')

        if not id_.isdigit() or int(id_) <= 0:
            raise falcon.HTTPError(status=falcon.HTTP_400,
                                   title='API.BAD_REQUEST',
                                   description='API.INVALID_MENU_TEMPLATE_ID')

        name, data = validate_menu_template_payload(new_values)

        cnx = None
        cursor = None
        try:
            cnx = mysql.connector.connect(**config.myems_user_db)
            try:
                cursor = cnx.cursor()
                cursor.execute(" SELECT name FROM tbl_menu_templates WHERE id = %s ", (id_,))
                if cursor.fetchone() is None:
                    raise falcon.HTTPError(status=falcon.HTTP_404,
                                           title='API.NOT_FOUND',
                                           description='API.MENU_TEMPLATE_NOT_FOUND')

                cursor.execute(" SELECT name FROM tbl_menu_templates WHERE name = %s AND id != %s ",
                               (name, id_))
                if cursor.fetchone() is not None:
                    raise falcon.HTTPError(status=falcon.HTTP_400,
                                           title='API.BAD_REQUEST',
                                           description='API.MENU_TEMPLATE_NAME_IS_ALREADY_IN_USE')

                cursor.execute(" UPDATE tbl_menu_templates SET name = %s, data = %s WHERE id = %s ",
                               (name, data, id_))
                cnx.commit()
            finally:
                if cursor:
                    cursor.close()
        finally:
            if cnx:
                cnx.close()

        clear_menu_template_cache()
        resp.status = falcon.HTTP_200