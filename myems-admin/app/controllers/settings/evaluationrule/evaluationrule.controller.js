'use strict';

app.controller('EvaluationRuleController', function(
    $scope,
    $rootScope,
    $window,
    $uibModal,
    $translate,
    EvaluationRuleService,
    toaster,
    SweetAlert) {
    $scope.cur_user = JSON.parse($window.localStorage.getItem('myems_admin_ui_current_user'));
    $scope.exportdata = '';
    $scope.importdata = '';

    $scope.getAllEvaluationRules = function() {
        var headers = { 'User-UUID': $scope.cur_user.uuid, 'Token': $scope.cur_user.token };
        EvaluationRuleService.getAllEvaluationRules(headers, function(response) {
            if (angular.isDefined(response.status) && response.status === 200) {
                $scope.evaluationrules = response.data;
            } else {
                $scope.evaluationrules = [];
            }
        });
    };

    $scope.addEvaluationRule = function() {
        var modalInstance = $uibModal.open({
            templateUrl: 'views/settings/evaluationrule/evaluationrule.model.html',
            controller: 'ModalAddEvaluationRuleCtrl',
            windowClass: 'animated fadeIn evaluation-rule-modal',
            size: 'lg'
        });
        modalInstance.result.then(function(rule) {
            var headers = { 'User-UUID': $scope.cur_user.uuid, 'Token': $scope.cur_user.token };
            EvaluationRuleService.addEvaluationRule(rule, headers, function(response) {
                if (angular.isDefined(response.status) && response.status === 201) {
                    toaster.pop({ type: 'success', title: $translate.instant('TOASTER.SUCCESS_TITLE'), body: $translate.instant('TOASTER.SUCCESS_ADD_BODY', {template: $translate.instant('SETTING.EVALUATION_RULE')}), showCloseButton: true });
                    $scope.getAllEvaluationRules();
                } else {
                    toaster.pop({ type: 'error', title: $translate.instant('TOASTER.ERROR_ADD_BODY', {template: $translate.instant('SETTING.EVALUATION_RULE')}), body: $translate.instant(response.data.description), showCloseButton: true });
                }
            });
        });
        $rootScope.modalInstance = modalInstance;
    };

    $scope.editEvaluationRule = function(rule) {
        var headers = { 'User-UUID': $scope.cur_user.uuid, 'Token': $scope.cur_user.token };
        EvaluationRuleService.getEvaluationRule(rule.id, headers, function(response) {
            if (!angular.isDefined(response.status) || response.status !== 200) {
                toaster.pop({ type: 'error', title: $translate.instant('TOASTER.ERROR_TITLE'), body: $translate.instant(response.data.description), showCloseButton: true });
                return;
            }
            var modalInstance = $uibModal.open({
                templateUrl: 'views/settings/evaluationrule/evaluationrule.model.html',
                controller: 'ModalEditEvaluationRuleCtrl',
                windowClass: 'animated fadeIn evaluation-rule-modal',
                size: 'lg',
                resolve: {
                    params: function() {
                        return { rule: angular.copy(response.data) };
                    }
                }
            });
            modalInstance.result.then(function(modifiedRule) {
                EvaluationRuleService.editEvaluationRule(modifiedRule, headers, function(response) {
                    if (angular.isDefined(response.status) && response.status === 200) {
                        toaster.pop({ type: 'success', title: $translate.instant('TOASTER.SUCCESS_TITLE'), body: $translate.instant('TOASTER.SUCCESS_UPDATE_BODY', {template: $translate.instant('SETTING.EVALUATION_RULE')}), showCloseButton: true });
                        $scope.getAllEvaluationRules();
                    } else {
                        toaster.pop({ type: 'error', title: $translate.instant('TOASTER.ERROR_UPDATE_BODY', {template: $translate.instant('SETTING.EVALUATION_RULE')}), body: $translate.instant(response.data.description), showCloseButton: true });
                    }
                });
            });
            $rootScope.modalInstance = modalInstance;
        });
    };

    $scope.deleteEvaluationRule = function(rule) {
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
            },
            function(isConfirm) {
                if (isConfirm) {
                    var headers = { 'User-UUID': $scope.cur_user.uuid, 'Token': $scope.cur_user.token };
                    EvaluationRuleService.deleteEvaluationRule(rule, headers, function(response) {
                        if (angular.isDefined(response.status) && response.status === 204) {
                            toaster.pop({ type: 'success', title: $translate.instant('TOASTER.SUCCESS_TITLE'), body: $translate.instant('TOASTER.SUCCESS_DELETE_BODY', {template: $translate.instant('SETTING.EVALUATION_RULE')}), showCloseButton: true });
                            $scope.getAllEvaluationRules();
                        } else {
                            toaster.pop({ type: 'error', title: $translate.instant('TOASTER.ERROR_DELETE_BODY', {template: $translate.instant('SETTING.EVALUATION_RULE')}), body: $translate.instant(response.data.description), showCloseButton: true });
                        }
                    });
                }
            });
    };

    $scope.cloneEvaluationRule = function(rule) {
        var headers = { 'User-UUID': $scope.cur_user.uuid, 'Token': $scope.cur_user.token };
        EvaluationRuleService.cloneEvaluationRule(rule, headers, function(response) {
            if (angular.isDefined(response.status) && response.status === 201) {
                toaster.pop({ type: 'success', title: $translate.instant('TOASTER.SUCCESS_TITLE'), body: $translate.instant('TOASTER.SUCCESS_ADD_BODY', {template: $translate.instant('SETTING.EVALUATION_RULE')}), showCloseButton: true });
                $scope.getAllEvaluationRules();
            } else {
                toaster.pop({ type: 'error', title: $translate.instant('TOASTER.ERROR_ADD_BODY', {template: $translate.instant('SETTING.EVALUATION_RULE')}), body: $translate.instant(response.data.description), showCloseButton: true });
            }
        });
    };

    $scope.exportEvaluationRule = function(rule) {
        var headers = { 'User-UUID': $scope.cur_user.uuid, 'Token': $scope.cur_user.token };
        EvaluationRuleService.exportEvaluationRule(rule, headers, function(response) {
            if (angular.isDefined(response.status) && response.status === 200) {
                var modalInstance = $uibModal.open({
                    templateUrl: 'views/common/export.html',
                    controller: 'ModalExportCtrl',
                    windowClass: 'animated fadeIn',
                    resolve: {
                        params: function() {
                            return { exportdata: angular.copy(JSON.stringify(response.data)) };
                        }
                    }
                });
                $rootScope.modalInstance = modalInstance;
            }
        });
    };

    $scope.importEvaluationRule = function() {
        var modalInstance = $uibModal.open({
            templateUrl: 'views/common/import.html',
            controller: 'ModalImportCtrl',
            windowClass: 'animated fadeIn'
        });
        modalInstance.result.then(function(importdata) {
            var headers = { 'User-UUID': $scope.cur_user.uuid, 'Token': $scope.cur_user.token };
            EvaluationRuleService.importEvaluationRule(importdata, headers, function(response) {
                if (angular.isDefined(response.status) && response.status === 201) {
                    toaster.pop({ type: 'success', title: $translate.instant('TOASTER.SUCCESS_TITLE'), body: $translate.instant('TOASTER.SUCCESS_ADD_BODY', {template: $translate.instant('SETTING.EVALUATION_RULE')}), showCloseButton: true });
                    $scope.getAllEvaluationRules();
                } else {
                    toaster.pop({ type: 'error', title: $translate.instant('TOASTER.ERROR_ADD_BODY', {template: $translate.instant('SETTING.EVALUATION_RULE')}), body: $translate.instant(response.data.description), showCloseButton: true });
                }
            });
        });
        $rootScope.modalInstance = modalInstance;
    };

    $scope.getAllEvaluationRules();
});

app.controller('ModalAddEvaluationRuleCtrl', function($scope, $uibModalInstance, $window, SpaceService, SpaceProductService, ProductService) {
    $scope.operation = 'SETTING.ADD';
    $scope.rule = defaultRule();
    wireModal($scope, $uibModalInstance, $window, SpaceService, SpaceProductService, ProductService);
});

app.controller('ModalEditEvaluationRuleCtrl', function($scope, $uibModalInstance, params, $window, SpaceService, SpaceProductService, ProductService) {
    $scope.operation = 'SETTING.EDIT';
    $scope.rule = params.rule;
    if (!$scope.rule.details || $scope.rule.details.length === 0) {
        $scope.rule.details = [defaultDetail(10)];
    }
    wireModal($scope, $uibModalInstance, $window, SpaceService, SpaceProductService, ProductService);
});

function wireModal($scope, $uibModalInstance, $window, SpaceService, SpaceProductService, ProductService) {
    var currentUser = JSON.parse($window.localStorage.getItem('myems_admin_ui_current_user'));
    var headers = currentUser ? { 'User-UUID': currentUser.uuid, 'Token': currentUser.token } : null;

    $scope.metricOptions = [
        { value: 'unit_comprehensive_energy_tce_per_t', label: 'SETTING.UNIT_COMPREHENSIVE_ENERGY_TCE_PER_T' },
        { value: 'unit_carbon_tco2_per_t', label: 'SETTING.UNIT_CARBON_TCO2_PER_T' }
    ];
    $scope.scopeOptions = [
        { value: 'platform_default', label: 'SETTING.PLATFORM_DEFAULT' },
        { value: 'enterprise_default', label: 'SETTING.ENTERPRISE_DEFAULT' },
        { value: 'enterprise_product', label: 'SETTING.ENTERPRISE_PRODUCT' },
        { value: 'enterprise_space_product', label: 'SETTING.ENTERPRISE_SPACE_PRODUCT' }
    ];
    $scope.highlightOptions = ['normal', 'success', 'warning', 'danger'];
    $scope.spaceOptions = [];
    $scope.productOptions = [];
    $scope.filteredProductOptions = [];

    $scope.isSpaceScope = function() {
        return $scope.rule.scope_level === 'enterprise_space_product';
    };

    $scope.isProductScope = function() {
        return $scope.rule.scope_level === 'enterprise_product' || $scope.rule.scope_level === 'enterprise_space_product';
    };

    $scope.onScopeLevelChange = function() {
        if ($scope.rule.scope_level === 'platform_default' || $scope.rule.scope_level === 'enterprise_default') {
            $scope.rule.space_id = null;
            $scope.rule.product_id = null;
        } else if ($scope.rule.scope_level === 'enterprise_product') {
            $scope.rule.space_id = null;
        }
        $scope.refreshProductOptions();
    };

    $scope.onSpaceChange = function() {
        if ($scope.rule.scope_level === 'enterprise_space_product') {
            $scope.rule.product_id = null;
        }
        $scope.refreshProductOptions();
    };

    $scope.refreshProductOptions = function() {
        if (!$scope.isProductScope()) {
            $scope.filteredProductOptions = [];
            return;
        }

        if ($scope.rule.scope_level === 'enterprise_space_product' && $scope.rule.space_id) {
            if (!headers) {
                $scope.filteredProductOptions = [];
                return;
            }
            SpaceProductService.getProductsBySpaceID($scope.rule.space_id, headers, function(response) {
                if (angular.isDefined(response.status) && response.status === 200) {
                    $scope.filteredProductOptions = response.data || [];
                } else {
                    $scope.filteredProductOptions = [];
                }
            });
            return;
        }

        $scope.filteredProductOptions = angular.copy($scope.productOptions);
    };

    function loadSpaces() {
        if (!headers) {
            return;
        }
        SpaceService.getAllSpaces(headers, function(response) {
            if (angular.isDefined(response.status) && response.status === 200) {
                $scope.spaceOptions = response.data || [];
            } else {
                $scope.spaceOptions = [];
            }
        });
    }

    function loadProducts() {
        if (!headers) {
            return;
        }
        ProductService.getAllProducts(headers, function(response) {
            if (angular.isDefined(response.status) && response.status === 200) {
                $scope.productOptions = response.data || [];
                $scope.refreshProductOptions();
            } else {
                $scope.productOptions = [];
                $scope.filteredProductOptions = [];
            }
        });
    }

    $scope.addDetail = function() {
        var nextOrder = ($scope.rule.details.length + 1) * 10;
        $scope.rule.details.push(defaultDetail(nextOrder));
    };
    $scope.removeDetail = function(index) {
        if ($scope.rule.details.length > 1) {
            $scope.rule.details.splice(index, 1);
        }
    };
    $scope.ok = function() {
        $uibModalInstance.close($scope.rule);
    };
    $scope.cancel = function() {
        $uibModalInstance.dismiss('cancel');
    };

    loadSpaces();
    loadProducts();
    $scope.onScopeLevelChange();
}

function defaultRule() {
    return {
        rule_set_code: '',
        name: '',
        metric_code: 'unit_comprehensive_energy_tce_per_t',
        metric_unit: 'TCE/T',
        benchmark_source: 'fixed',
        benchmark_value: null,
        benchmark_display_name: '',
        scope_level: 'enterprise_default',
        sort_order: 0,
        is_active: true,
        expression: null,
        remark: '',
        details: [defaultDetail(10)]
    };
}

function defaultDetail(displayOrder) {
    return {
        display_order: displayOrder,
        min_value: null,
        max_value: null,
        min_inclusive: false,
        max_inclusive: false,
        comparison_side: 'actual',
        grade_code: '',
        grade_label: '',
        is_compliant: false,
        status_text: '',
        highlight_style: 'normal',
        evaluation_text: '',
        advice_text: '',
        remark: ''
    };
}
