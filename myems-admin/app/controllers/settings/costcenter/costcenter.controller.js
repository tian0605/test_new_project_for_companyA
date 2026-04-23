'use strict';

app.controller('CostCenterController', function(
	$scope,
	$rootScope,
	$window,
	$uibModal,
	$translate,
	CostCenterService,
	SpaceService,
	toaster,
	SweetAlert) {
	$scope.cur_user = JSON.parse($window.localStorage.getItem("myems_admin_ui_current_user"));
	$scope.enterpriseSpaces = [];
	$scope.getEnterpriseSpaces = function() {
		let headers = { "User-UUID": $scope.cur_user.uuid, "Token": $scope.cur_user.token };
		SpaceService.getAllSpaces(headers, function (response) {
			if (angular.isDefined(response.status) && response.status === 200) {
				$scope.enterpriseSpaces = (response.data || []).filter(function(space) {
					return space.parent_space && space.parent_space.id === 1;
				});
			} else {
				$scope.enterpriseSpaces = [];
			}
		});
	};
	$scope.getEnterpriseSpaceName = function(enterpriseSpaceId) {
		if (enterpriseSpaceId == null) {
			return '-';
		}
		const match = ($scope.enterpriseSpaces || []).find(function(space) {
			return space.id === enterpriseSpaceId;
		});
		return match ? match.name : enterpriseSpaceId;
	};
	$scope.getAllCostCenters = function() {
		let headers = { "User-UUID": $scope.cur_user.uuid, "Token": $scope.cur_user.token };
		CostCenterService.getAllCostCenters(headers, function (response) {
			if (angular.isDefined(response.status) && response.status === 200) {
				$scope.costcenters = response.data;
			} else {
				$scope.costcenters = [];
			}
		});
	};

	$scope.addCostCenter = function() {
		var modalInstance = $uibModal.open({
			templateUrl: 'views/settings/costcenter/costcenter.model.html',
			controller: 'ModalAddCostCenterCtrl',
			windowClass: "animated fadeIn",
			resolve: {
				params:function(){
					return {
						currentUser: angular.copy($scope.cur_user),
						enterpriseSpaces: angular.copy($scope.enterpriseSpaces)
					};
				}
			}
		});
		modalInstance.result.then(function(costcenter) {
			let headers = { "User-UUID": $scope.cur_user.uuid, "Token": $scope.cur_user.token };
			CostCenterService.addCostCenter(costcenter, headers, function (response) {
				if (angular.isDefined(response.status) && response.status === 201) {
					toaster.pop({
						type: "success",
						title: $translate.instant("TOASTER.SUCCESS_TITLE"),
						body: $translate.instant("TOASTER.SUCCESS_ADD_BODY", {template: $translate.instant("SETTING.COSTCENTER")}),
						showCloseButton: true,
					});
					$scope.getAllCostCenters();
					$scope.$emit('handleEmitCostCenterChanged');
				} else {
					toaster.pop({
						type: "error",
						title: $translate.instant("TOASTER.ERROR_ADD_BODY", {template: $translate.instant("SETTING.COSTCENTER")}),
						body: $translate.instant(response.data.description),
						showCloseButton: true,
					});
				}
			});
		}, function() {

		});
		$rootScope.modalInstance = modalInstance;
	};

	$scope.editCostCenter=function(costcenter){
		var modalInstance = $uibModal.open({
		    windowClass: "animated fadeIn",
		    templateUrl: 'views/settings/costcenter/costcenter.model.html',
		    controller: 'ModalEditCostCenterCtrl',
		    resolve: {
		        params:function(){
                    return {
                        costcenter:angular.copy(costcenter),
						costcenters:angular.copy($scope.costcenters),
						currentUser: angular.copy($scope.cur_user),
						enterpriseSpaces: angular.copy($scope.enterpriseSpaces)
                    };
                }
		    }
		});

		modalInstance.result.then(function (modifiedCostCenter) {
			let headers = { "User-UUID": $scope.cur_user.uuid, "Token": $scope.cur_user.token };
	        CostCenterService.editCostCenter(modifiedCostCenter, headers, function (response){
	            if(angular.isDefined(response.status) && response.status === 200){
					toaster.pop({
						type: "success",
						title: $translate.instant("TOASTER.SUCCESS_TITLE"),
						body: $translate.instant("TOASTER.SUCCESS_UPDATE_BODY", {template: $translate.instant("SETTING.COSTCENTER")}),
						showCloseButton: true,
					});
			        $scope.getAllCostCenters();
					$scope.$emit('handleEmitCostCenterChanged');
		      } else {
					toaster.pop({
						type: "error",
						title: $translate.instant("TOASTER.ERROR_UPDATE_BODY", {template: $translate.instant("SETTING.COSTCENTER")}),
						body: $translate.instant(response.data.description),
						showCloseButton: true,
					});
				}
	        });
		}, function () {
	        //do nothing;
		});
		$rootScope.modalInstance = modalInstance;
	};

	$scope.deleteCostCenter=function(costcenter){
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
			},
		    function (isConfirm) {
		        if (isConfirm) {
					let headers = { "User-UUID": $scope.cur_user.uuid, "Token": $scope.cur_user.token };
		            CostCenterService.deleteCostCenter(costcenter, headers, function (response) {
		            	if (angular.isDefined(response.status) && response.status === 204) {
							toaster.pop({
								type: "success",
								title: $translate.instant("TOASTER.SUCCESS_TITLE"),
								body: $translate.instant("TOASTER.SUCCESS_DELETE_BODY", {template: $translate.instant("SETTING.COSTCENTER")}),
								showCloseButton: true,
							});
		            		$scope.getAllCostCenters();
							$scope.$emit('handleEmitCostCenterChanged');
		            	} else {
							toaster.pop({
			                  type: "error",
			                  title: $translate.instant("TOASTER.ERROR_DELETE_BODY", {template: $translate.instant("SETTING.COSTCENTER")}),
			                  body: $translate.instant(response.data.description),
			                  showCloseButton: true,
			              });
						}
		            });
		        }
		    });
	};

	$scope.getAllCostCenters();
	$scope.getEnterpriseSpaces();

});

app.controller('ModalAddCostCenterCtrl', function ($scope, $uibModalInstance, params) {
    $scope.operation="SETTING.ADD_COSTCENTER";
	$scope.currentUser = (params && params.currentUser) || {};
	$scope.enterpriseSpaces = (params && params.enterpriseSpaces) || [];
	$scope.costcenter = {
		enterprise_space_id: $scope.currentUser.enterprise_space_id || null
	};
    $scope.ok = function () {
        $uibModalInstance.close($scope.costcenter);
    };

    $scope.cancel = function () {
        $uibModalInstance.dismiss('cancel');
    };
});

app.controller('ModalEditCostCenterCtrl', function ($scope, $uibModalInstance, params) {
    $scope.operation="SETTING.EDIT_COSTCENTER";
    $scope.costcenter = params.costcenter;
    $scope.costcenters=params.costcenters;
	$scope.currentUser = params.currentUser || {};
	$scope.enterpriseSpaces = params.enterpriseSpaces || [];
	if ($scope.currentUser.enterprise_space_id != null) {
		$scope.costcenter.enterprise_space_id = $scope.currentUser.enterprise_space_id;
	}

    $scope.ok = function() {
        $uibModalInstance.close($scope.costcenter);
    };

    $scope.cancel = function() {
        $uibModalInstance.dismiss('cancel');
    };
});
