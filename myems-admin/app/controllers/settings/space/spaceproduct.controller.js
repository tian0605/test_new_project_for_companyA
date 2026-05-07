'use strict';

app.controller('SpaceProductController', function(
    $scope,
    $window,
    $timeout,
    $translate,
    SpaceService,
    ProductService,
    SpaceProductService,
    toaster,
    SweetAlert,
    DragDropWarningService) {
    $scope.spaces = [];
    $scope.currentSpaceID = 1;
    $scope.products = [];
    $scope.spaceproducts = [];
    $scope.filteredProducts = [];
    $scope.cur_user = JSON.parse($window.localStorage.getItem('myems_admin_ui_current_user'));
    $scope.isLoadingProducts = false;
    $scope.tabInitialized = false;
    $scope.isSpaceSelected = false;

    function safeApply(scope) {
        if (!scope.$$phase && !scope.$root.$$phase) {
            scope.$apply();
        }
    }

    $scope.getAllSpaces = function() {
        let headers = { 'User-UUID': $scope.cur_user.uuid, 'Token': $scope.cur_user.token };
        SpaceService.getAllSpaces(headers, function(response) {
            if (angular.isDefined(response.status) && response.status === 200) {
                $scope.spaces = response.data;
            } else {
                $scope.spaces = [];
            }

            var treedata = { 'core': { 'data': [], 'multiple': false }, 'plugins': ['wholerow'] };
            for (var i = 0; i < $scope.spaces.length; i++) {
                var node;
                if ($scope.spaces[i].id == 1) {
                    node = {
                        'id': $scope.spaces[i].id.toString(),
                        'parent': '#',
                        'text': $scope.spaces[i].name,
                        'state': { 'opened': true, 'selected': false }
                    };
                } else {
                    node = {
                        'id': $scope.spaces[i].id.toString(),
                        'parent': $scope.spaces[i].parent_space.id.toString(),
                        'text': $scope.spaces[i].name
                    };
                }
                treedata.core.data.push(node);
            }

            angular.element(spacetreewithproduct).jstree(treedata);
            angular.element(spacetreewithproduct).on('changed.jstree', function(e, data) {
                if (data.selected && data.selected.length > 0) {
                    $scope.currentSpaceID = parseInt(data.selected[0]);
                    $scope.isSpaceSelected = true;
                    $scope.getProductsBySpaceID($scope.currentSpaceID);
                } else {
                    $scope.isSpaceSelected = false;
                    $scope.spaceproducts = [];
                }
                safeApply($scope);
            });
        });
    };

    $scope.getProductsBySpaceID = function(id) {
        if ($scope.isLoadingProducts) return;
        $scope.isLoadingProducts = true;
        $scope.spaceproducts = [];
        let headers = { 'User-UUID': $scope.cur_user.uuid, 'Token': $scope.cur_user.token };
        SpaceProductService.getProductsBySpaceID(id, headers, function(response) {
            $scope.isLoadingProducts = false;
            if (angular.isDefined(response.status) && response.status === 200) {
                $scope.spaceproducts = response.data;
            } else {
                $scope.spaceproducts = [];
            }
            $scope.filterAvailableProducts();
        });
    };

    $scope.filterAvailableProducts = function() {
        var boundSet = {};
        ($scope.spaceproducts || []).forEach(function(sp) {
            if (angular.isDefined(sp.id)) {
                boundSet[String(sp.id)] = true;
            }
        });

        $scope.filteredProducts = ($scope.products || []).filter(function(product) {
            return !boundSet[String(product.id)];
        });
    };

    $scope.getAllProducts = function() {
        let headers = { 'User-UUID': $scope.cur_user.uuid, 'Token': $scope.cur_user.token };
        ProductService.getAllProducts(headers, function(response) {
            if (angular.isDefined(response.status) && response.status === 200) {
                $scope.products = response.data;
            } else {
                $scope.products = [];
            }
            $scope.filterAvailableProducts();
        });
    };

    $scope.pairProduct = function(dragEl, dropEl) {
        if (!$scope.isSpaceSelected) {
            DragDropWarningService.showWarning('SETTING.PLEASE_SELECT_SPACE_FIRST');
            return;
        }
        var productid = angular.element('#' + dragEl).scope().product.id;
        var spaceid = angular.element(spacetreewithproduct).jstree(true).get_top_selected();
        let headers = { 'User-UUID': $scope.cur_user.uuid, 'Token': $scope.cur_user.token };
        SpaceProductService.addPair(spaceid, productid, headers, function(response) {
            if (angular.isDefined(response.status) && response.status === 201) {
                toaster.pop({
                    type: 'success',
                    title: $translate.instant('TOASTER.SUCCESS_TITLE'),
                    body: $translate.instant('TOASTER.BIND_PRODUCT_SUCCESS'),
                    showCloseButton: true,
                });
                $scope.getProductsBySpaceID(spaceid);
            } else {
                toaster.pop({
                    type: 'error',
                    title: $translate.instant(response.data.title),
                    body: $translate.instant(response.data.description),
                    showCloseButton: true,
                });
            }
        });
    };

    $scope.deleteProductPair = function(dragEl, dropEl) {
        if (angular.element('#' + dragEl).hasClass('source')) {
            return;
        }
        if (!$scope.isSpaceSelected) {
            DragDropWarningService.showWarning('SETTING.PLEASE_SELECT_SPACE_FIRST');
            return;
        }
        var spaceproductid = angular.element('#' + dragEl).scope().spaceproduct.id;
        var spaceid = angular.element(spacetreewithproduct).jstree(true).get_top_selected();
        let headers = { 'User-UUID': $scope.cur_user.uuid, 'Token': $scope.cur_user.token };
        SpaceProductService.deletePair(spaceid, spaceproductid, headers, function(response) {
            if (angular.isDefined(response.status) && response.status === 204) {
                toaster.pop({
                    type: 'success',
                    title: $translate.instant('TOASTER.SUCCESS_TITLE'),
                    body: $translate.instant('TOASTER.UNBIND_PRODUCT_SUCCESS'),
                    showCloseButton: true,
                });
                $scope.getProductsBySpaceID(spaceid);
            } else {
                toaster.pop({
                    type: 'error',
                    title: $translate.instant(response.data.title),
                    body: $translate.instant(response.data.description),
                    showCloseButton: true,
                });
            }
        });
    };

    $scope.initTab = function() {
        if (!$scope.tabInitialized) {
            $scope.tabInitialized = true;
            $scope.getAllSpaces();
            $scope.getAllProducts();
        }
    };

    $scope.$on('space.tabSelected', function(event, tabIndex) {
        var TAB_INDEXES = ($scope.$parent && $scope.$parent.TAB_INDEXES) || {};
        if (tabIndex === TAB_INDEXES.PRODUCT) {
            if (!$scope.tabInitialized) {
                $scope.initTab();
            } else if ($scope.isSpaceSelected && $scope.currentSpaceID) {
                $scope.getProductsBySpaceID($scope.currentSpaceID);
            }
        }
    });

    $timeout(function() {
        var TAB_INDEXES = ($scope.$parent && $scope.$parent.TAB_INDEXES) || {};
        if ($scope.$parent && $scope.$parent.activeTabIndex === TAB_INDEXES.PRODUCT && !$scope.tabInitialized) {
            $scope.initTab();
        }
    }, 0);

    $scope.refreshSpaceTree = function() {
        let headers = { 'User-UUID': $scope.cur_user.uuid, 'Token': $scope.cur_user.token };
        SpaceService.getAllSpaces(headers, function(response) {
            if (angular.isDefined(response.status) && response.status === 200) {
                $scope.spaces = response.data;
            } else {
                $scope.spaces = [];
            }

            var treedata = { 'core': { 'data': [], 'multiple': false }, 'plugins': ['wholerow'] };
            for (var i = 0; i < $scope.spaces.length; i++) {
                var node;
                if ($scope.spaces[i].id == 1) {
                    node = {
                        'id': $scope.spaces[i].id.toString(),
                        'parent': '#',
                        'text': $scope.spaces[i].name,
                        'state': { 'opened': true, 'selected': false }
                    };
                } else {
                    node = {
                        'id': $scope.spaces[i].id.toString(),
                        'parent': $scope.spaces[i].parent_space.id.toString(),
                        'text': $scope.spaces[i].name
                    };
                }
                treedata.core.data.push(node);
            }

            angular.element(spacetreewithproduct).jstree(true).settings.core.data = treedata.core.data;
            angular.element(spacetreewithproduct).jstree(true).refresh();
            $scope.isSpaceSelected = false;
            $scope.spaceproducts = [];
            safeApply($scope);
        });
    };

    $scope.$on('handleBroadcastSpaceChanged', function(event) {
        $scope.spaceproducts = [];
        $scope.isSpaceSelected = false;
        $scope.currentSpaceID = 1;
        $scope.filterAvailableProducts();
        $scope.refreshSpaceTree();
    });

    DragDropWarningService.registerTabWarnings(
        $scope,
        'PRODUCT',
        'SETTING.PLEASE_SELECT_SPACE_FIRST',
        ($scope.$parent && $scope.$parent.TAB_INDEXES) || {}
    );
});