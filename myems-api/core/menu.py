import falcon
import mysql.connector
import simplejson as json
import redis
from core.useractivity import user_logger, admin_control, access_control, api_key_control, get_request_context_value
import config


def get_menu_scope(req):
    path = getattr(req, 'path', '') or ''
    if path == '/menus/web':
        return 'web'
    return 'admin'


def get_routes_from_template_data(template_data, scope):
    if not isinstance(template_data, dict):
        return None

    route_key = 'web_routes' if scope == 'web' else 'admin_routes'
    routes = template_data.get(route_key)
    if not isinstance(routes, list):
        return set()

    return {str.strip(route) for route in routes if isinstance(route, str) and len(str.strip(route)) > 0}


def get_menu_route_scope(req):
    if get_request_context_value(req, 'is_admin'):
        return None

    permission_context = get_request_context_value(req, 'permission_context')
    if permission_context is None:
        return None

    menu_template = permission_context.get('menu_template')
    if menu_template is not None:
        menu_scope = get_menu_scope(req)
        menu_template_data = menu_template.get('data') or dict()
        return get_routes_from_template_data(menu_template_data, menu_scope)

    privilege = permission_context.get('privilege')
    if privilege is None:
        return set()

    privilege_data = privilege.get('data') or dict()
    menu_routes = privilege_data.get('menu_routes')
    if isinstance(menu_routes, list):
        return {route for route in menu_routes if isinstance(route, str) and len(route) > 0}

    menus = privilege_data.get('menus')
    if isinstance(menus, list):
        return {route for route in menus if isinstance(route, str) and len(route) > 0}

    return set()


def can_use_shared_menu_cache(req):
    return get_menu_cache_scope_key(req) is not None


def get_menu_cache_scope_key(req):
    if get_request_context_value(req, 'is_admin'):
        return 'G:menu:admin'

    menu_template_id = get_request_context_value(req, 'menu_template_id')
    if menu_template_id is not None:
        return f'M:{menu_template_id}:menu'

    privilege_id = get_request_context_value(req, 'privilege_id')
    if privilege_id is not None:
        return f'P:{privilege_id}:menu'

    return None


def get_menu_list_cache_key(req):
    scope_key = get_menu_cache_scope_key(req)
    if scope_key is None:
        return None
    return f'{scope_key}:list'


def get_menu_web_cache_key(req):
    scope_key = get_menu_cache_scope_key(req)
    if scope_key is None:
        return None
    return f'{scope_key}:web'


def get_menu_item_cache_key(req, menu_id):
    scope_key = get_menu_cache_scope_key(req)
    if scope_key is None:
        return None
    return f'{scope_key}:item:{menu_id}'


def get_menu_children_cache_key(req, menu_id):
    scope_key = get_menu_cache_scope_key(req)
    if scope_key is None:
        return None
    return f'{scope_key}:children:{menu_id}'


def get_visible_menu_ids(rows_menus, menu_route_scope):
    if menu_route_scope is None:
        return {row[0] for row in rows_menus} if rows_menus else set()

    menu_by_id = dict()
    for row in rows_menus:
        menu_by_id[row[0]] = row

    visible_menu_ids = set()
    for row in rows_menus:
        menu_id = row[0]
        route = row[2]
        parent_menu_id = row[3]
        if route in menu_route_scope:
            visible_menu_ids.add(menu_id)
            while parent_menu_id is not None and parent_menu_id in menu_by_id and parent_menu_id not in visible_menu_ids:
                visible_menu_ids.add(parent_menu_id)
                parent_menu_id = menu_by_id[parent_menu_id][3]

    return visible_menu_ids


def clear_menu_cache(menu_id=None):
    """
    Clear menu-related cache after data modification

    Args:
        menu_id: Menu ID (optional, for specific item cache)
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

        # Clear legacy and scoped menu list cache
        matching_keys = redis_client.keys('menu:list*') + redis_client.keys('G:menu:admin:list') + redis_client.keys('M:*:menu:list') + redis_client.keys('P:*:menu:list')
        if matching_keys:
            redis_client.delete(*matching_keys)

        # Clear legacy and scoped menu web cache
        matching_keys = redis_client.keys('menu:web*') + redis_client.keys('G:menu:admin:web') + redis_client.keys('M:*:menu:web') + redis_client.keys('P:*:menu:web')
        if matching_keys:
            redis_client.delete(*matching_keys)

        # Clear specific menu item cache if menu_id is provided
        if menu_id:
            redis_client.delete(f'menu:item:{menu_id}')
            scoped_item_keys = redis_client.keys(f'G:menu:admin:item:{menu_id}') + \
                redis_client.keys(f'M:*:menu:item:{menu_id}') + \
                redis_client.keys(f'P:*:menu:item:{menu_id}')
            if scoped_item_keys:
                redis_client.delete(*scoped_item_keys)

        # Clear menu children cache if menu_id is provided
        if menu_id:
            redis_client.delete(f'menu:children:{menu_id}')
            scoped_children_keys = redis_client.keys(f'G:menu:admin:children:{menu_id}') + \
                redis_client.keys(f'M:*:menu:children:{menu_id}') + \
                redis_client.keys(f'P:*:menu:children:{menu_id}')
            if scoped_children_keys:
                redis_client.delete(*scoped_children_keys)

    except Exception:
        # If cache clear fails, ignore and continue
        pass


class MenuCollection:
    """
    Menu Collection Resource

    This class handles menu operations for the MyEMS system.
    It provides functionality to retrieve all menus and their hierarchical structure
    used for navigation in the MyEMS web interface.
    """

    def __init__(self):
        pass

    @staticmethod
    def on_options(req, resp):
        """
        Handle OPTIONS request for CORS preflight

        Args:
            req: Falcon request object
            resp: Falcon response object
        """
        _ = req
        resp.status = falcon.HTTP_200

    @staticmethod
    def on_get(req, resp):
        """
        Handle GET requests to retrieve all menus

        Returns a list of all menus with their metadata including:
        - Menu ID and name
        - Route path
        - Parent menu ID (for hierarchical structure)
        - Hidden status

        Args:
            req: Falcon request object
            resp: Falcon response object
        """
        # Check authentication method (API key or session)
        if 'API-KEY' not in req.headers or \
                not isinstance(req.headers['API-KEY'], str) or \
                len(str.strip(req.headers['API-KEY'])) == 0:
            access_control(req)
        else:
            api_key_control(req)

        menu_route_scope = get_menu_route_scope(req)

        # Redis cache key
        cache_key = get_menu_list_cache_key(req)
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
        rows_menus = []

        try:
            cnx = mysql.connector.connect(**config.myems_system_db)
            try:
                cursor = cnx.cursor()

                # Query to retrieve all menus ordered by ID
                query = (" SELECT id, name, route, parent_menu_id, is_hidden "
                         " FROM tbl_menus "
                         " ORDER BY id ")
                cursor.execute(query)
                rows_menus = cursor.fetchall()
            finally:
                if cursor:
                    cursor.close()
        finally:
            if cnx:
                cnx.close()

        # Build result list
        result = list()
        visible_menu_ids = get_visible_menu_ids(rows_menus, menu_route_scope)
        if rows_menus is not None and len(rows_menus) > 0:
            for row in rows_menus:
                if row[0] not in visible_menu_ids:
                    continue
                temp = {"id": row[0],
                        "name": row[1],
                        "route": row[2],
                        "parent_menu_id": row[3],
                        "is_hidden": bool(row[4])}

                result.append(temp)

        # Store result in Redis cache
        result_json = json.dumps(result)
        if redis_client and cache_key is not None:
            try:
                redis_client.setex(cache_key, cache_expire, result_json)
            except Exception:
                # If cache set fails, ignore and continue
                pass

        resp.text = result_json


class MenuItem:
    """
    Menu Item Resource

    This class handles individual menu operations including:
    - Retrieving a specific menu by ID
    - Updating menu visibility status
    """

    def __init__(self):
        pass

    @staticmethod
    def on_options(req, resp, id_):
        """
        Handle OPTIONS request for CORS preflight

        Args:
            req: Falcon request object
            resp: Falcon response object
            id_: Menu ID parameter
        """
        _ = req
        resp.status = falcon.HTTP_200
        _ = id_

    @staticmethod
    def on_get(req, resp, id_):
        """
        Handle GET requests to retrieve a specific menu by ID

        Retrieves a single menu with its metadata including:
        - Menu ID and name
        - Route path
        - Parent menu ID
        - Hidden status

        Args:
            req: Falcon request object
            resp: Falcon response object
            id_: Menu ID to retrieve
        """
        # Check authentication method (API key or session)
        if 'API-KEY' not in req.headers or \
                not isinstance(req.headers['API-KEY'], str) or \
                len(str.strip(req.headers['API-KEY'])) == 0:
            access_control(req)
        else:
            api_key_control(req)

        if not id_.isdigit() or int(id_) <= 0:
            raise falcon.HTTPError(status=falcon.HTTP_400, title='API.BAD_REQUEST',
                                   description='API.INVALID_MENU_ID')

        # Redis cache key
        cache_key = get_menu_item_cache_key(req, id_)
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
        rows_menu = None

        try:
            cnx = mysql.connector.connect(**config.myems_system_db)
            try:
                cursor = cnx.cursor()

                # Query to retrieve specific menu by ID
                query = (" SELECT id, name, route, parent_menu_id, is_hidden "
                         " FROM tbl_menus "
                         " WHERE id= %s ")
                cursor.execute(query, (id_,))
                rows_menu = cursor.fetchone()
            finally:
                if cursor:
                    cursor.close()
        finally:
            if cnx:
                cnx.close()

        # Build result object
        result = None
        if rows_menu is not None and len(rows_menu) > 0:
            result = {"id": rows_menu[0],
                      "name": rows_menu[1],
                      "route": rows_menu[2],
                      "parent_menu_id": rows_menu[3],
                      "is_hidden": bool(rows_menu[4])}

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
    def on_put(req, resp, id_):
        """
        Handle PUT requests to update menu visibility

        Updates the hidden status of a specific menu.
        Requires admin privileges.

        Args:
            req: Falcon request object containing update data:
                - is_hidden: Boolean value for menu visibility
            resp: Falcon response object
            id_: Menu ID to update
        """
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
                                   description='API.INVALID_MENU_ID')

        new_values = json.loads(raw_json)

        # Validate hidden status
        if 'is_hidden' not in new_values['data'].keys() or \
                not isinstance(new_values['data']['is_hidden'], bool):
            raise falcon.HTTPError(status=falcon.HTTP_400, title='API.BAD_REQUEST',
                                   description='API.INVALID_IS_HIDDEN')
        is_hidden = new_values['data']['is_hidden']

        cnx = None
        cursor = None

        try:
            cnx = mysql.connector.connect(**config.myems_system_db)
            try:
                cursor = cnx.cursor()

                # Update menu visibility status
                update_row = (" UPDATE tbl_menus "
                              " SET is_hidden = %s "
                              " WHERE id = %s ")
                cursor.execute(update_row, (is_hidden,
                                            id_))
                cnx.commit()
            finally:
                if cursor:
                    cursor.close()
        finally:
            if cnx:
                cnx.close()

        # Clear cache after updating menu
        clear_menu_cache(menu_id=id_)

        resp.status = falcon.HTTP_200


class MenuChildrenCollection:
    """
    Menu Children Collection Resource

    This class handles retrieval of menu hierarchy including:
    - Current menu information
    - Parent menu information
    - Child menus
    """

    def __init__(self):
        pass

    @staticmethod
    def on_options(req, resp, id_):
        """
        Handle OPTIONS request for CORS preflight

        Args:
            req: Falcon request object
            resp: Falcon response object
            id_: Menu ID parameter
        """
        _ = req
        resp.status = falcon.HTTP_200
        _ = id_

    @staticmethod
    def on_get(req, resp, id_):
        """
        Handle GET requests to retrieve menu hierarchy

        Returns detailed menu information including:
        - Current menu details
        - Parent menu information
        - List of child menus

        Args:
            req: Falcon request object
            resp: Falcon response object
            id_: Menu ID to retrieve hierarchy for
        """
        # Check authentication method (API key or session)
        if 'API-KEY' not in req.headers or \
                not isinstance(req.headers['API-KEY'], str) or \
                len(str.strip(req.headers['API-KEY'])) == 0:
            access_control(req)
        else:
            api_key_control(req)

        if not id_.isdigit() or int(id_) <= 0:
            raise falcon.HTTPError(status=falcon.HTTP_400, title='API.BAD_REQUEST',
                                   description='API.INVALID_MENU_ID')

        menu_route_scope = get_menu_route_scope(req)

        # Redis cache key
        cache_key = get_menu_children_cache_key(req, id_)
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
        row_current_menu = None
        rows_menus = []
        rows_children = []

        try:
            cnx = mysql.connector.connect(**config.myems_system_db)
            try:
                cursor = cnx.cursor()

                # Query to retrieve current menu
                query = (" SELECT id, name, route, parent_menu_id, is_hidden "
                         " FROM tbl_menus "
                         " WHERE id = %s ")
                cursor.execute(query, (id_,))
                row_current_menu = cursor.fetchone()
                
                if row_current_menu is None:
                    raise falcon.HTTPError(status=falcon.HTTP_404, title='API.NOT_FOUND',
                                           description='API.MENU_NOT_FOUND')

                # Query to retrieve all menus for parent lookup
                query = (" SELECT id, name "
                         " FROM tbl_menus "
                         " ORDER BY id ")
                cursor.execute(query)
                rows_menus = cursor.fetchall()

                query = (" SELECT id, name, route, parent_menu_id, is_hidden "
                         " FROM tbl_menus "
                         " ORDER BY id ")
                cursor.execute(query)
                rows_all_menus = cursor.fetchall()
                visible_menu_ids = get_visible_menu_ids(rows_all_menus, menu_route_scope)

                if row_current_menu[0] not in visible_menu_ids:
                    raise falcon.HTTPError(status=falcon.HTTP_404, title='API.NOT_FOUND',
                                           description='API.MENU_NOT_FOUND')

                # Build menu dictionary for parent lookup
                menu_dict = dict()
                if rows_menus is not None and len(rows_menus) > 0:
                    for row in rows_menus:
                        menu_dict[row[0]] = {"id": row[0],
                                             "name": row[1]}

                # Build result structure
                result = dict()
                result['current'] = dict()
                result['current']['id'] = row_current_menu[0]
                result['current']['name'] = row_current_menu[1]
                result['current']['parent_menu'] = menu_dict.get(row_current_menu[3], None)
                result['current']['is_hidden'] = bool(row_current_menu[4])

                result['children'] = list()

                # Query to retrieve child menus
                query = (" SELECT id, name, route, parent_menu_id, is_hidden "
                         " FROM tbl_menus "
                         " WHERE parent_menu_id = %s "
                         " ORDER BY id ")
                cursor.execute(query, (id_, ))
                rows_children = cursor.fetchall()

                # Build children list
                if rows_children is not None and len(rows_children) > 0:
                    for row in rows_children:
                        if row[0] not in visible_menu_ids:
                            continue
                        meta_result = {"id": row[0],
                                       "name": row[1],
                                       "parent_menu": menu_dict.get(row[3], None),
                                       "is_hidden": bool(row[4])}
                        result['children'].append(meta_result)
                
                # Serialize here so we can use it outside the DB block
                result_json = json.dumps(result)

            finally:
                if cursor:
                    cursor.close()
        finally:
            if cnx:
                cnx.close()

        # Store result in Redis cache
        if redis_client and cache_key is not None:
            try:
                redis_client.setex(cache_key, cache_expire, result_json)
            except Exception:
                # If cache set fails, ignore and continue
                pass

        resp.text = result_json


class MenuWebCollection:
    """
    Menu Web Collection Resource

    This class provides menu data specifically formatted for web interface.
    It returns a hierarchical structure of routes organized by parent-child relationships.
    """

    def __init__(self):
        pass

    @staticmethod
    def on_options(req, resp):
        """
        Handle OPTIONS request for CORS preflight

        Args:
            req: Falcon request object
            resp: Falcon response object
        """
        _ = req
        resp.status = falcon.HTTP_200

    @staticmethod
    def on_get(req, resp):
        """
        Handle GET requests to retrieve web menu structure

        Returns a hierarchical menu structure formatted for web interface:
        - First level routes (parent menus)
        - Child routes organized under their parents
        - Only non-hidden menus are included

        Args:
            req: Falcon request object
            resp: Falcon response object
        """
        # Check authentication method (API key or session)
        if 'API-KEY' not in req.headers or \
                not isinstance(req.headers['API-KEY'], str) or \
                len(str.strip(req.headers['API-KEY'])) == 0:
            access_control(req)
        else:
            api_key_control(req)

        menu_route_scope = get_menu_route_scope(req)

        # Redis cache key
        cache_key = get_menu_web_cache_key(req)
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
        rows_menus = []

        try:
            cnx = mysql.connector.connect(**config.myems_system_db)
            try:
                cursor = cnx.cursor()

                # Optimized: Single query to retrieve all non-hidden menus
                # This reduces database round trips from 2 to 1
                # MySQL compatible: parent_menu_id IS NULL comes first in ORDER BY
                query = (" SELECT id, name, route, parent_menu_id "
                         " FROM tbl_menus "
                         " WHERE is_hidden = 0 "
                         " ORDER BY (parent_menu_id IS NULL) DESC, id ")
                cursor.execute(query)
                rows_menus = cursor.fetchall()
            finally:
                if cursor:
                    cursor.close()
        finally:
            if cnx:
                cnx.close()

        # Build first level routes dictionary and result structure in one pass
        first_level_routes = {}
        result = {}
        visible_menu_ids = get_visible_menu_ids(rows_menus, menu_route_scope)

        if rows_menus:
            for row in rows_menus:
                menu_id, _, route, parent_menu_id = row
                if menu_id not in visible_menu_ids:
                    continue

                if parent_menu_id is None:
                    # First level menu (parent)
                    first_level_routes[menu_id] = {
                        'route': route,
                        'children': []
                    }
                    result[route] = []
                else:
                    # Child menu - optimized: direct dictionary lookup instead of .keys()
                    if parent_menu_id in first_level_routes:
                        first_level_routes[parent_menu_id]['children'].append(route)
                        # Update result directly
                        parent_route = first_level_routes[parent_menu_id]['route']
                        result[parent_route].append(route)

        # Store result in Redis cache
        result_json = json.dumps(result)
        if redis_client and cache_key is not None:
            try:
                redis_client.setex(cache_key, cache_expire, result_json)
            except Exception:
                # If cache set fails, ignore and continue
                pass

        resp.text = result_json
