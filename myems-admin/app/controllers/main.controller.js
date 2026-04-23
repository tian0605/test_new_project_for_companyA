'use strict';
app.controller('MainController', [
    '$rootScope', '$location', '$window', '$timeout','$cookies',
    function($rootScope, $location, $window, $timeout,$cookies) {
        function getCurrentUser() {
            try {
                return JSON.parse($window.localStorage.getItem("myems_admin_ui_current_user")) || {};
            } catch (e) {
                return {};
            }
        }

        $rootScope.canAccessAdminRoute = function(routeName) {
            var currentUser = getCurrentUser();
            if (!currentUser || !currentUser.is_admin) {
                return false;
            }
            if (currentUser.enterprise_space_id == null) {
                return true;
            }
            var allowedRoutes = currentUser.admin_routes || [];
            if (!allowedRoutes.length) {
                return false;
            }
            return allowedRoutes.some(function(allowedRoute) {
                return routeName === allowedRoute || routeName.indexOf(allowedRoute + '.') === 0;
            });
        };

        $rootScope.canAccessAnyAdminRoute = function(routeNames) {
            return (routeNames || []).some(function(routeName) {
                return $rootScope.canAccessAdminRoute(routeName);
            });
        };

        $rootScope.getDefaultAdminRoute = function() {
            var currentUser = getCurrentUser();
            if (!currentUser || !currentUser.is_admin) {
                return 'login.login';
            }
            if (currentUser.enterprise_space_id == null) {
                return 'settings.space';
            }
            if (currentUser.admin_routes && currentUser.admin_routes.length > 0) {
                return currentUser.admin_routes[0];
            }
            return 'login.login';
        };
        
        $rootScope.$on("handleReLogin",function(){
            $timeout(function(){
                $window.localStorage.removeItem("myems_admin_ui_current_user");
                $location.path('/login');
            },2000)
        });

        $rootScope.$on('handleEmitWebMessageTableChanged', function(event) {
            $rootScope.$broadcast('BroadcastResetWebMessage');
        });

        $rootScope.$on('handleEmitWebMessageOptionChanged', function(event, args) {
            if(args.load){
                $rootScope.$broadcast('BroadcastResetWebMessage');
            }

        });

        $rootScope.bufferToStr=function(buffer){
            return String.fromCharCode.apply(null, new Uint8Array(buffer));
        };
    }
]);
