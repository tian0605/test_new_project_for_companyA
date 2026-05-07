'use strict';

app.controller('ProductController', function(
    $scope,
    $rootScope,
    $window,
    $translate,
    $uibModal,
    ProductService,
    toaster,
    SweetAlert) {

    $scope.cur_user = JSON.parse($window.localStorage.getItem('myems_admin_ui_current_user'));
    $scope.searchKeyword = '';

    $scope.getAllProducts = function() {
        let headers = { 'User-UUID': $scope.cur_user.uuid, 'Token': $scope.cur_user.token };
        ProductService.getAllProducts(headers, function(response) {
            if (angular.isDefined(response.status) && response.status === 200) {
                $scope.products = response.data;
            } else {
                $scope.products = [];
            }
        });
    };

    $scope.addProduct = function() {
        var modalInstance = $uibModal.open({
            templateUrl: 'views/settings/product/product.model.html',
            controller: 'ModalAddProductCtrl',
            windowClass: 'animated fadeIn',
            resolve: {
                params: function() {
                    return {
                        products: angular.copy($scope.products)
                    };
                }
            }
        });

        modalInstance.result.then(function(product) {
            let headers = { 'User-UUID': $scope.cur_user.uuid, 'Token': $scope.cur_user.token };
            ProductService.addProduct(product, headers, function(response) {
                if (angular.isDefined(response.status) && response.status === 201) {
                    toaster.pop({
                        type: 'success',
                        title: $translate.instant('TOASTER.SUCCESS_TITLE'),
                        body: $translate.instant('TOASTER.SUCCESS_ADD_BODY', { template: $translate.instant('SETTING.PRODUCT') }),
                        showCloseButton: true,
                    });
                    $scope.getAllProducts();
                } else {
                    toaster.pop({
                        type: 'error',
                        title: $translate.instant('TOASTER.ERROR_ADD_BODY', { template: $translate.instant('SETTING.PRODUCT') }),
                        body: $translate.instant(response.data.description),
                        showCloseButton: true,
                    });
                }
            });
        }, function() {
        });
        $rootScope.modalInstance = modalInstance;
    };

    $scope.editProduct = function(product) {
        var modalInstance = $uibModal.open({
            windowClass: 'animated fadeIn',
            templateUrl: 'views/settings/product/product.model.html',
            controller: 'ModalEditProductCtrl',
            resolve: {
                params: function() {
                    return {
                        product: angular.copy(product),
                        products: angular.copy($scope.products)
                    };
                }
            }
        });

        modalInstance.result.then(function(modifiedProduct) {
            let headers = { 'User-UUID': $scope.cur_user.uuid, 'Token': $scope.cur_user.token };
            ProductService.editProduct(modifiedProduct, headers, function(response) {
                if (angular.isDefined(response.status) && response.status === 200) {
                    toaster.pop({
                        type: 'success',
                        title: $translate.instant('TOASTER.SUCCESS_TITLE'),
                        body: $translate.instant('TOASTER.SUCCESS_UPDATE_BODY', { template: $translate.instant('SETTING.PRODUCT') }),
                        showCloseButton: true,
                    });
                    $scope.getAllProducts();
                } else {
                    toaster.pop({
                        type: 'error',
                        title: $translate.instant('TOASTER.ERROR_UPDATE_BODY', { template: $translate.instant('SETTING.PRODUCT') }),
                        body: $translate.instant(response.data.description),
                        showCloseButton: true,
                    });
                }
            });
        }, function() {
        });
        $rootScope.modalInstance = modalInstance;
    };

    $scope.deleteProduct = function(product) {
        SweetAlert.swal({
            title: $translate.instant('SWEET.TITLE'),
            text: $translate.instant('SWEET.TEXT'),
            type: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#DD6B55',
            confirmButtonText: $translate.instant('SWEET.CONFIRM_BUTTON_TEXT'),
            cancelButtonText: $translate.instant('SWEET.CANCEL_BUTTON_TEXT'),
            closeOnConfirm: true,
            closeOnCancel: true
        }, function(isConfirm) {
            if (isConfirm) {
                let headers = { 'User-UUID': $scope.cur_user.uuid, 'Token': $scope.cur_user.token };
                ProductService.deleteProduct(product, headers, function(response) {
                    if (angular.isDefined(response.status) && response.status === 204) {
                        toaster.pop({
                            type: 'success',
                            title: $translate.instant('TOASTER.SUCCESS_TITLE'),
                            body: $translate.instant('TOASTER.SUCCESS_DELETE_BODY', { template: $translate.instant('SETTING.PRODUCT') }),
                            showCloseButton: true,
                        });
                        $scope.getAllProducts();
                    } else {
                        toaster.pop({
                            type: 'error',
                            title: $translate.instant('TOASTER.ERROR_DELETE_BODY', { template: $translate.instant('SETTING.PRODUCT') }),
                            body: $translate.instant(response.data.description),
                            showCloseButton: true,
                        });
                    }
                });
            }
        });
    };

    let searchDebounceTimer = null;
    function safeApply(scope) {
        if (!scope.$$phase && !scope.$root.$$phase) {
            scope.$apply();
        }
    }
    $scope.searchProduct = function() {
        const headers = {
            'User-UUID': $scope.cur_user?.uuid,
            'Token': $scope.cur_user?.token
        };

        const rawKeyword = $scope.searchKeyword || '';
        const trimmedKeyword = rawKeyword.trim();

        if (searchDebounceTimer) {
            clearTimeout(searchDebounceTimer);
        }

        searchDebounceTimer = setTimeout(() => {
            if (!trimmedKeyword) {
                $scope.getAllProducts();
                safeApply($scope);
                return;
            }

            ProductService.searchProducts(trimmedKeyword, headers, function(response) {
                $scope.products = (response.status === 200) ? response.data : [];
            });
        }, 300);
    };

    $scope.getAllProducts();
});

app.controller('ModalAddProductCtrl', function($scope, $uibModalInstance, params) {
    $scope.operation = 'SETTING.ADD_PRODUCT';
    $scope.products = params.products;
    $scope.product = { standard_product_coefficient: 1 };

    $scope.ok = function() {
        $uibModalInstance.close($scope.product);
    };

    $scope.cancel = function() {
        $uibModalInstance.dismiss('cancel');
    };
});

app.controller('ModalEditProductCtrl', function($scope, $uibModalInstance, params) {
    $scope.operation = 'SETTING.EDIT_PRODUCT';
    $scope.product = params.product;
    $scope.products = params.products;

    $scope.ok = function() {
        $uibModalInstance.close($scope.product);
    };

    $scope.cancel = function() {
        $uibModalInstance.dismiss('cancel');
    };
});