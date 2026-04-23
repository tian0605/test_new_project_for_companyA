'use strict';

app.controller('MenuTemplateController', function (
    $scope,
    $rootScope,
    $window,
    $uibModal,
    MenuTemplateService,
    toaster,
    $translate,
    SweetAlert) {
    $scope.cur_user = JSON.parse($window.localStorage.getItem("myems_admin_ui_current_user"));
    $scope.menuTemplates = [];
    $scope.allMenus = [
        { state: 'settings.category', name: 'MENU.SETTINGS.CATEGORY' },
        { state: 'settings.tariff', name: 'MENU.SETTINGS.TARIFF' },
        { state: 'settings.costcenter', name: 'MENU.SETTINGS.COSTCENTER' },
        { state: 'settings.contact', name: 'MENU.SETTINGS.CONTACT' },
        { state: 'settings.gateway', name: 'MENU.SETTINGS.GATEWAY' },
        { state: 'settings.protocol', name: 'MENU.SETTINGS.PROTOCOL' },
        { state: 'settings.datasource', name: 'MENU.SETTINGS.DATASOURCE' },
        { state: 'settings.meter', name: 'MENU.SETTINGS.METER' },
        { state: 'settings.sensor', name: 'MENU.SETTINGS.SENSOR' },
        { state: 'settings.equipment', name: 'MENU.SETTINGS.EQUIPMENT' },
        { state: 'settings.combinedequipment', name: 'MENU.SETTINGS.COMBINED_EQUIPMENT' },
        { state: 'settings.space', name: 'MENU.SETTINGS.SPACE' },
        { state: 'settings.tenant', name: 'MENU.SETTINGS.TENANT' },
        { state: 'settings.store', name: 'MENU.SETTINGS.STORE' },
        { state: 'settings.shopfloor', name: 'MENU.SETTINGS.SHOPFLOOR' },
        { state: 'settings.energyflowdiagram', name: 'MENU.SETTINGS.ENERGY_FLOW_DIAGRAM' },
        { state: 'settings.svg', name: 'MENU.SETTINGS.SVG' },
        { state: 'settings.distributionsystem', name: 'MENU.SETTINGS.DISTRIBUTION_SYSTEM' },
        { state: 'settings.menu', name: 'MENU.SETTINGS.MENU' },
        { state: 'settings.knowledgefile', name: 'MENU.SETTINGS.KNOWLEDGEFILE' },
        { state: 'settings.workingcalendar', name: 'MENU.SETTINGS.WORKING_CALENDAR' },
        { state: 'users.user', name: 'MENU.USERSETTING.USER' },
        { state: 'users.privilege', name: 'MENU.USERSETTING.PRIVILEGE' },
        { state: 'users.menutemplate', name: 'MENU.USERSETTING.MENU_TEMPLATE' },
        { state: 'users.apikey', name: 'MENU.USERSETTING.API_KEY' },
        { state: 'users.log', name: 'MENU.USERSETTING.LOG' },
        { state: 'settings.command', name: 'MENU.SETTINGS.COMMAND' },
        { state: 'settings.controlmode', name: 'MENU.SETTINGS.CONTROL_MODE' },
        { state: 'settings.iotsimcard', name: 'MENU.SETTINGS.IOTSIMCARD' },
        { state: 'settings.microgrid', name: 'MENU.SETTINGS.MICROGRID' },
        { state: 'settings.virtualpowerplant', name: 'MENU.SETTINGS.VIRTUAL_POWER_PLANT' },
        { state: 'settings.energystoragecontainer', name: 'MENU.SETTINGS.ENERGY_STORAGE_CONTAINER' },
        { state: 'settings.energystoragepowerstation', name: 'MENU.SETTINGS.ENERGY_STORAGE_POWER_STATION' },
        { state: 'settings.photovoltaicpowerstation', name: 'MENU.SETTINGS.PHOTOVOLTAIC_POWER_STATION' },
        { state: 'settings.windfarm', name: 'MENU.SETTINGS.WIND_FARM' },
        { state: 'settings.emailserver', name: 'MENU.SETTINGS.EMAIL_SERVER' },
        { state: 'settings.advancedreport', name: 'MENU.SETTINGS.ADVANCED_REPORT' },
        { state: 'settings.energyplanfile', name: 'MENU.SETTINGS.ENERGY_PLAN_FILE' },
        { state: 'fdd.rule', name: 'MENU.FDD.RULE' },
        { state: 'fdd.textmessage', name: 'MENU.FDD.MESSAGEALARM' },
        { state: 'fdd.emailmessage', name: 'MENU.FDD.EMAILALARM' },
        { state: 'fdd.webmessage', name: 'MENU.FDD.WEBALARM' },
        { state: 'fdd.wechatmessage', name: 'MENU.FDD.WECHATALARM' },
        { state: '/dashboard', name: 'Dashboard' },
        { state: '/space/energycategory', name: 'Energy Category Data' },
        { state: '/space/energyitem', name: 'Energy Item Data' },
        { state: '/space/carbon', name: 'Carbon' },
        { state: '/space/cost', name: 'Cost' },
        { state: '/space/output', name: 'Output' },
        { state: '/space/income', name: 'Income' },
        { state: '/space/efficiency', name: 'Efficiency' },
        { state: '/space/load', name: 'Load' },
        { state: '/space/statistics', name: 'Statistics' },
        { state: '/space/saving', name: 'Saving' },
        { state: '/space/plan', name: 'Plan' },
        { state: '/space/prediction', name: 'Prediction' },
        { state: '/space/environmentmonitor', name: 'Environment Monitor' },
        { state: '/space/enterproduction', name: 'Enter Production' },
        { state: '/space/production', name: 'Space Production' },
        { state: '/space/comparison', name: 'Space Comparison' },
        { state: '/equipment/energycategory', name: 'Energy Category Data' },
        { state: '/equipment/energyitem', name: 'Energy Item Data' },
        { state: '/equipment/carbon', name: 'Carbon' },
        { state: '/equipment/cost', name: 'Cost' },
        { state: '/equipment/output', name: 'Output' },
        { state: '/equipment/income', name: 'Income' },
        { state: '/equipment/efficiency', name: 'Efficiency' },
        { state: '/equipment/load', name: 'Load' },
        { state: '/equipment/statistics', name: 'Statistics' },
        { state: '/equipment/saving', name: 'Saving' },
        { state: '/equipment/plan', name: 'Plan' },
        { state: '/equipment/batch', name: 'Batch Analysis' },
        { state: '/equipment/tracking', name: 'Equipment Tracking' },
        { state: '/equipment/comparison', name: 'Equipment Comparison' },
        { state: '/meter/meterenergy', name: 'Meter Energy' },
        { state: '/meter/metercarbon', name: 'Meter Carbon' },
        { state: '/meter/metercost', name: 'Meter Cost' },
        { state: '/meter/metertrend', name: 'Meter Trend' },
        { state: '/meter/meterrealtime', name: 'Meter Realtime' },
        { state: '/meter/metersaving', name: 'Meter Saving' },
        { state: '/meter/meterplan', name: 'Meter Plan' },
        { state: '/meter/metersubmetersbalance', name: 'Master Meter Submeters Balance' },
        { state: '/meter/meterbatch', name: 'Meter Batch Analysis' },
        { state: '/meter/metercomparison', name: 'Meter Comparison' },
        { state: '/meter/metertracking', name: 'Meter Tracking' },
        { state: '/meter/powerquality', name: 'Power Quality' },
        { state: '/meter/virtualmeterenergy', name: 'Virtual Meter Energy' },
        { state: '/meter/virtualmetercarbon', name: 'Virtual Meter Carbon' },
        { state: '/meter/virtualmetercost', name: 'Virtual Meter Cost' },
        { state: '/meter/virtualmeterbatch', name: 'Virtual Meter Batch Analysis' },
        { state: '/meter/virtualmetersaving', name: 'Virtual Meter Saving' },
        { state: '/meter/virtualmeterplan', name: 'Virtual Meter Plan' },
        { state: '/meter/virtualmetercomparison', name: 'Virtual Meter Comparison' },
        { state: '/meter/offlinemeterenergy', name: 'Offline Meter Energy' },
        { state: '/meter/offlinemetercarbon', name: 'Offline Meter Carbon' },
        { state: '/meter/offlinemetercost', name: 'Offline Meter Cost' },
        { state: '/meter/offlinemeterbatch', name: 'Offline Meter Batch Analysis' },
        { state: '/meter/offlinemetersaving', name: 'Offline Meter Saving' },
        { state: '/meter/offlinemeterplan', name: 'Offline Meter Plan' },
        { state: '/meter/offlinemeterinput', name: 'Offline Meter Input' },
        { state: '/tenant/energycategory', name: 'Energy Category Data' },
        { state: '/tenant/energyitem', name: 'Energy Item Data' },
        { state: '/tenant/carbon', name: 'Carbon' },
        { state: '/tenant/cost', name: 'Cost' },
        { state: '/tenant/load', name: 'Load' },
        { state: '/tenant/statistics', name: 'Statistics' },
        { state: '/tenant/saving', name: 'Saving' },
        { state: '/tenant/plan', name: 'Plan' },
        { state: '/tenant/bill', name: 'Tenant Bill' },
        { state: '/tenant/batch', name: 'Batch Analysis' },
        { state: '/tenant/comparison', name: 'Tenant Comparison' },
        { state: '/store/energycategory', name: 'Energy Category Data' },
        { state: '/store/energyitem', name: 'Energy Item Data' },
        { state: '/store/carbon', name: 'Carbon' },
        { state: '/store/cost', name: 'Cost' },
        { state: '/store/load', name: 'Load' },
        { state: '/store/statistics', name: 'Statistics' },
        { state: '/store/saving', name: 'Saving' },
        { state: '/store/plan', name: 'Plan' },
        { state: '/store/batch', name: 'Batch Analysis' },
        { state: '/store/comparison', name: 'Store Comparison' },
        { state: '/shopfloor/energycategory', name: 'Energy Category Data' },
        { state: '/shopfloor/energyitem', name: 'Energy Item Data' },
        { state: '/shopfloor/carbon', name: 'Carbon' },
        { state: '/shopfloor/cost', name: 'Cost' },
        { state: '/shopfloor/load', name: 'Load' },
        { state: '/shopfloor/statistics', name: 'Statistics' },
        { state: '/shopfloor/saving', name: 'Saving' },
        { state: '/shopfloor/plan', name: 'Plan' },
        { state: '/shopfloor/batch', name: 'Batch Analysis' },
        { state: '/shopfloor/comparison', name: 'Shopfloor Comparison' },
        { state: '/combinedequipment/energycategory', name: 'Energy Category Data' },
        { state: '/combinedequipment/energyitem', name: 'Energy Item Data' },
        { state: '/combinedequipment/carbon', name: 'Carbon' },
        { state: '/combinedequipment/cost', name: 'Cost' },
        { state: '/combinedequipment/output', name: 'Output' },
        { state: '/combinedequipment/income', name: 'Income' },
        { state: '/combinedequipment/efficiency', name: 'Efficiency' },
        { state: '/combinedequipment/load', name: 'Load' },
        { state: '/combinedequipment/statistics', name: 'Statistics' },
        { state: '/combinedequipment/saving', name: 'Saving' },
        { state: '/combinedequipment/plan', name: 'Plan' },
        { state: '/combinedequipment/batch', name: 'Batch Analysis' },
        { state: '/combinedequipment/comparison', name: 'Combined Equipment Comparison' },
        { state: '/auxiliarysystem/energyflowdiagram', name: 'Energy Flow Diagram' },
        { state: '/auxiliarysystem/distributionsystem', name: 'Distribution System' },
        { state: '/knowledgebase', name: 'Knowledge Base' }
    ];

    $scope.getRouteNames = function(menuTemplate) {
        let data = {};
        try {
            data = JSON.parse(menuTemplate.data || '{}');
        } catch (e) {
            data = {};
        }
        const routeSet = new Set(data.admin_routes || []);
        return ($scope.allMenus || []).filter(function(menu) {
            return routeSet.has(menu.state);
        }).map(function(menu) {
            return $translate.instant(menu.name) || menu.name;
        }).join(' / ');
    };

    $scope.isRouteSelected = function(menu) {
        return ($scope.menuTemplate.selected_routes || []).indexOf(menu.state) >= 0;
    };

    $scope.toggleRoute = function(menu) {
        const selectedRoutes = $scope.menuTemplate.selected_routes || [];
        const existingIndex = selectedRoutes.indexOf(menu.state);
        if (existingIndex >= 0) {
            selectedRoutes.splice(existingIndex, 1);
        } else {
            selectedRoutes.push(menu.state);
        }
        $scope.menuTemplate.selected_routes = selectedRoutes;
    };

    $scope.getAllMenuTemplates = function () {
        let headers = { "User-UUID": $scope.cur_user.uuid, "Token": $scope.cur_user.token };
        MenuTemplateService.getAllMenuTemplates(headers, function (response) {
            if (angular.isDefined(response.status) && response.status === 200) {
                $scope.menuTemplates = response.data;
            } else {
                $scope.menuTemplates = [];
            }
        });
    };

    $scope.addMenuTemplate = function () {
        var modalInstance = $uibModal.open({
            templateUrl: 'views/users/menutemplate/menutemplate.model.html',
            controller: 'ModalAddMenuTemplateCtrl',
            windowClass: "animated fadeIn",
            resolve: {
                params: function () {
                    return {
                        menus: angular.copy($scope.allMenus)
                    };
                }
            }
        });

        modalInstance.result.then(function (menuTemplate) {
            let headers = { "User-UUID": $scope.cur_user.uuid, "Token": $scope.cur_user.token };
            MenuTemplateService.addMenuTemplate(menuTemplate, headers, function (response) {
                if (angular.isDefined(response.status) && response.status === 201) {
                    toaster.pop({
                        type: "success",
                        title: $translate.instant("TOASTER.SUCCESS_TITLE"),
                        body: $translate.instant("TOASTER.SUCCESS_ADD_BODY", { template: $translate.instant("USER.MENU_PERMISSION_TEMPLATE") }),
                        showCloseButton: true,
                    });
                    $scope.getAllMenuTemplates();
                } else {
                    toaster.pop({
                        type: "error",
                        title: $translate.instant("TOASTER.ERROR_ADD_BODY", { template: $translate.instant("USER.MENU_PERMISSION_TEMPLATE") }),
                        body: $translate.instant(response.data.description),
                        showCloseButton: true,
                    });
                }
            });
        });
        $rootScope.modalInstance = modalInstance;
    };

    $scope.editMenuTemplate = function (menuTemplate) {
        var modalInstance = $uibModal.open({
            windowClass: "animated fadeIn",
            templateUrl: 'views/users/menutemplate/menutemplate.model.html',
            controller: 'ModalEditMenuTemplateCtrl',
            resolve: {
                params: function () {
                    return {
                        menuTemplate: angular.copy(menuTemplate),
                        menus: angular.copy($scope.allMenus)
                    };
                }
            }
        });

        modalInstance.result.then(function (modifiedMenuTemplate) {
            let headers = { "User-UUID": $scope.cur_user.uuid, "Token": $scope.cur_user.token };
            MenuTemplateService.editMenuTemplate(modifiedMenuTemplate, headers, function (response) {
                if (angular.isDefined(response.status) && response.status === 200) {
                    toaster.pop({
                        type: "success",
                        title: $translate.instant("TOASTER.SUCCESS_TITLE"),
                        body: $translate.instant("TOASTER.SUCCESS_UPDATE_BODY", { template: $translate.instant("USER.MENU_PERMISSION_TEMPLATE") }),
                        showCloseButton: true,
                    });
                    $scope.getAllMenuTemplates();
                } else {
                    toaster.pop({
                        type: "error",
                        title: $translate.instant("TOASTER.ERROR_UPDATE_BODY", { template: $translate.instant("USER.MENU_PERMISSION_TEMPLATE") }),
                        body: $translate.instant(response.data.description),
                        showCloseButton: true,
                    });
                }
            });
        });
        $rootScope.modalInstance = modalInstance;
    };

    $scope.deleteMenuTemplate = function (menuTemplate) {
        SweetAlert.swal({
            title: $translate.instant("SWEET.TITLE"),
            text: $translate.instant("SWEET.TEXT"),
            type: "warning",
            showCancelButton: true,
            confirmButtonColor: "#DD6B55",
            confirmButtonText: $translate.instant("SWEET.CONFIRM_BUTTON_TEXT"),
            cancelButtonText: $translate.instant("SWEET.CANCEL_BUTTON_TEXT"),
            closeOnConfirm: true,
            closeOnCancel: true
        }, function (isConfirm) {
            if (isConfirm) {
                let headers = { "User-UUID": $scope.cur_user.uuid, "Token": $scope.cur_user.token };
                MenuTemplateService.deleteMenuTemplate(menuTemplate, headers, function (response) {
                    if (angular.isDefined(response.status) && response.status === 204) {
                        toaster.pop({
                            type: "success",
                            title: $translate.instant("TOASTER.SUCCESS_TITLE"),
                            body: $translate.instant("TOASTER.SUCCESS_DELETE_BODY", { template: $translate.instant("USER.MENU_PERMISSION_TEMPLATE") }),
                            showCloseButton: true,
                        });
                        $scope.getAllMenuTemplates();
                    } else {
                        toaster.pop({
                            type: "error",
                            title: $translate.instant("TOASTER.ERROR_DELETE_BODY", { template: $translate.instant("USER.MENU_PERMISSION_TEMPLATE") }),
                            body: $translate.instant(response.data.description),
                            showCloseButton: true,
                        });
                    }
                });
            }
        });
    };
    $scope.getAllMenuTemplates();
});

app.controller('ModalAddMenuTemplateCtrl', function ($scope, $uibModalInstance, params) {
    $scope.operation = "USER.ADD_MENU_PERMISSION_TEMPLATE";
    $scope.menus = params.menus || [];
    $scope.menuTemplate = { selected_routes: [] };

    $scope.isRouteSelected = function(menu) {
        return ($scope.menuTemplate.selected_routes || []).indexOf(menu.state) >= 0;
    };

    $scope.toggleRoute = function(menu) {
        const selectedRoutes = $scope.menuTemplate.selected_routes || [];
        const existingIndex = selectedRoutes.indexOf(menu.state);
        if (existingIndex >= 0) {
            selectedRoutes.splice(existingIndex, 1);
        } else {
            selectedRoutes.push(menu.state);
        }
        $scope.menuTemplate.selected_routes = selectedRoutes;
    };

    $scope.ok = function () {
        $scope.menuTemplate.data = JSON.stringify({ admin_routes: $scope.menuTemplate.selected_routes || [] });
        delete $scope.menuTemplate.selected_routes;
        $uibModalInstance.close($scope.menuTemplate);
    };

    $scope.cancel = function () {
        $uibModalInstance.dismiss('cancel');
    };
});

app.controller('ModalEditMenuTemplateCtrl', function ($scope, $uibModalInstance, params) {
    $scope.operation = "USER.EDIT_MENU_PERMISSION_TEMPLATE";
    $scope.menus = params.menus || [];
    $scope.menuTemplate = params.menuTemplate;
    let data = {};
    try {
        data = JSON.parse($scope.menuTemplate.data || '{}');
    } catch (e) {
        data = {};
    }
    $scope.menuTemplate.selected_routes = data.admin_routes || [];

    $scope.isRouteSelected = function(menu) {
        return ($scope.menuTemplate.selected_routes || []).indexOf(menu.state) >= 0;
    };

    $scope.toggleRoute = function(menu) {
        const selectedRoutes = $scope.menuTemplate.selected_routes || [];
        const existingIndex = selectedRoutes.indexOf(menu.state);
        if (existingIndex >= 0) {
            selectedRoutes.splice(existingIndex, 1);
        } else {
            selectedRoutes.push(menu.state);
        }
        $scope.menuTemplate.selected_routes = selectedRoutes;
    };

    $scope.ok = function () {
        $scope.menuTemplate.data = JSON.stringify({ admin_routes: $scope.menuTemplate.selected_routes || [] });
        delete $scope.menuTemplate.selected_routes;
        $uibModalInstance.close($scope.menuTemplate);
    };

    $scope.cancel = function () {
        $uibModalInstance.dismiss('cancel');
    };
});