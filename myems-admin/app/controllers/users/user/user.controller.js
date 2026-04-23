'use strict';

app.controller('UserController', function ($scope,
	$rootScope,
	$window,
	$uibModal,
	UserService,
	PrivilegeService,
	MenuTemplateService,
	SpaceService,
	toaster,
	$translate,
	SweetAlert) {
	$scope.cur_user = JSON.parse($window.localStorage.getItem("myems_admin_ui_current_user"));
	$scope.searchKeyword = '';
	$scope.selectedEnterpriseSpaceId = '';
	$scope.enterpriseSpaces = [];
	$scope.allUsers = [];
	$scope.menuTemplates = [];

	$scope.applyUserFilters = function () {
		const keyword = ($scope.searchKeyword || '').trim().toLowerCase();
		const selectedEnterpriseSpaceId = $scope.selectedEnterpriseSpaceId === '' ? null : Number($scope.selectedEnterpriseSpaceId);
		$scope.users = ($scope.allUsers || []).filter(function (user) {
			const enterpriseSpaceName = $scope.getEnterpriseSpaceName(user.enterprise_space_id);
			const matchesEnterpriseSpace = selectedEnterpriseSpaceId == null || user.enterprise_space_id === selectedEnterpriseSpaceId;
			if (!matchesEnterpriseSpace) {
				return false;
			}
			if (!keyword) {
				return true;
			}
			const searchableFields = [
				user.name,
				user.display_name,
				user.email,
				user.phone,
				user.privilege && user.privilege.name,
				enterpriseSpaceName
			];
			return searchableFields.some(function (field) {
				return field != null && String(field).toLowerCase().indexOf(keyword) >= 0;
			});
		});
	};

	$scope.getEnterpriseSpaces = function () {
		let headers = { "User-UUID": $scope.cur_user.uuid, "Token": $scope.cur_user.token };
		SpaceService.getAllSpaces(headers, function (response) {
			if (angular.isDefined(response.status) && response.status === 200) {
				$scope.enterpriseSpaces = (response.data || []).filter(function(space) {
					return space.parent_space && space.parent_space.id === 1;
				});
				$scope.applyUserFilters();
			} else {
				$scope.enterpriseSpaces = [];
				$scope.applyUserFilters();
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
	$scope.getAllUsers = function () {
		let headers = { "User-UUID": $scope.cur_user.uuid, "Token": $scope.cur_user.token };
		UserService.getAllUsers(headers, function (response) {
			if (angular.isDefined(response.status) && response.status === 200) {
				$scope.allUsers = response.data;
			} else {
				$scope.allUsers = [];
			}
			$scope.applyUserFilters();
		});
	};

	$scope.getAllPrivileges = function () {
		let headers = { "User-UUID": $scope.cur_user.uuid, "Token": $scope.cur_user.token };
		PrivilegeService.getAllPrivileges(headers, function (response) {
			if (angular.isDefined(response.status) && response.status === 200) {
				$scope.privileges = response.data;
			} else {
				$scope.privileges = [];
			}
		});

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

	$scope.addUser = function () {
		var modalInstance = $uibModal.open({
			templateUrl: 'views/users/user/user.model.html',
			controller: 'ModalAddUserCtrl',
			windowClass: "animated fadeIn",
			resolve: {
				params: function () {
					return {
						privileges: angular.copy($scope.privileges),
						menuTemplates: angular.copy($scope.menuTemplates),
						currentUser: angular.copy($scope.cur_user),
						enterpriseSpaces: angular.copy($scope.enterpriseSpaces)
					};
				}
			}
		});
		modalInstance.result.then(function (user) {
			let headers = { "User-UUID": $scope.cur_user.uuid, "Token": $scope.cur_user.token };
			UserService.addUser(user, headers, function (response) {
				if (angular.isDefined(response.status) && response.status === 201) {
					toaster.pop({
						type: "success",
						title: $translate.instant("TOASTER.SUCCESS_TITLE"),
						body: $translate.instant("TOASTER.SUCCESS_ADD_BODY", { template: $translate.instant("SETTING.USER") }),
						showCloseButton: true,
					});
					$scope.getAllUsers();
				} else {
					toaster.pop({
						type: "error",
						title: $translate.instant("TOASTER.ERROR_ADD_BODY", { template: $translate.instant("SETTING.USER") }),
						body: $translate.instant(response.data.description),
						showCloseButton: true,
					});
				}
			});
		}, function () {

		});
		$rootScope.modalInstance = modalInstance;
	};

	$scope.editUser = function (user) {
		var modalInstance = $uibModal.open({
			windowClass: "animated fadeIn",
			templateUrl: 'views/users/user/user.model.html',
			controller: 'ModalEditUserCtrl',
			resolve: {
				params: function () {
					return {
						user: angular.copy(user),
						privileges: angular.copy($scope.privileges),
						menuTemplates: angular.copy($scope.menuTemplates),
						currentUser: angular.copy($scope.cur_user),
						enterpriseSpaces: angular.copy($scope.enterpriseSpaces)
					};
				}
			}
		});

		modalInstance.result.then(function (modifiedUser) {
			let headers = { "User-UUID": $scope.cur_user.uuid, "Token": $scope.cur_user.token };
			UserService.editUser(modifiedUser, headers, function (response) {
				if (angular.isDefined(response.status) && response.status === 200) {
					toaster.pop({
						type: "success",
						title: $translate.instant("TOASTER.SUCCESS_TITLE"),
						body: $translate.instant("TOASTER.SUCCESS_UPDATE_BODY", { template: $translate.instant("SETTING.USER") }),
						showCloseButton: true,
					});
					$scope.getAllUsers();
				} else {
					toaster.pop({
						type: "error",
						title: $translate.instant("TOASTER.ERROR_UPDATE_BODY", { template: $translate.instant("SETTING.USER") }),
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

	$scope.resetPassword = function (user) {
		var modalInstance = $uibModal.open({
			windowClass: "animated fadeIn",
			templateUrl: 'views/users/user/reset-password.model.html',
			controller: 'ModalResetPasswordCtrl',
			resolve: {
				params: function () {
					return {
						user: angular.copy(user),
					};
				}
			}
		});

		modalInstance.result.then(function (modifiedUser) {
			let data = {name: modifiedUser.name, password: modifiedUser.password };
			let headers = { "User-UUID": $scope.cur_user.uuid, "Token": $scope.cur_user.token };
			UserService.resetPassword(data, headers, function (response) {
				if (angular.isDefined(response.status) && response.status === 200) {
					toaster.pop({
						type: "success",
						title: $translate.instant("TOASTER.SUCCESS_TITLE"),
						body: $translate.instant("TOASTER.SUCCESS_UPDATE_BODY", { template: $translate.instant("SETTING.USER") }),
						showCloseButton: true,
					});
					$scope.getAllUsers();
				} else {
					toaster.pop({
						type: "error",
						title: $translate.instant("TOASTER.ERROR_UPDATE_BODY", { template: $translate.instant("SETTING.USER") }),
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

	$scope.deleteUser = function (user) {
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
				UserService.deleteUser(user, headers, function (response) {
					if (angular.isDefined(response.status) && response.status === 204) {
						toaster.pop({
							type: "success",
							title: $translate.instant("TOASTER.SUCCESS_TITLE"),
							body: $translate.instant("TOASTER.SUCCESS_DELETE_BODY", { template: $translate.instant("SETTING.USER") }),
							showCloseButton: true,
						});
						$scope.getAllUsers();
					} else {
						toaster.pop({
							type: "error",
							title: $translate.instant("TOASTER.ERROR_DELETE_BODY", { template: $translate.instant("SETTING.USER") }),
							body: $translate.instant(response.data.description),
							showCloseButton: true,
						});
					}
				});
			}
		});
	};

	$scope.unlockUser = function (user){
		SweetAlert.swal({
			title: $translate.instant("SWEET.UNLOCK_TITLE"),
			type: "warning",
			showCancelButton: true,
			confirmButtonColor: "#DD6B55",
			confirmButtonText: $translate.instant("SWEET.UNLOCK_CONFIRM_BUTTON_TEXT"),
			cancelButtonText: $translate.instant("SWEET.CANCEL_BUTTON_TEXT"),
			closeOnConfirm: true,
			closeOnCancel: true
		},function (isConfirm) {
			if (isConfirm) {
				let headers = { "User-UUID": $scope.cur_user.uuid, "Token": $scope.cur_user.token };
				UserService.unlockUser(user, headers, function (response) {
					if (angular.isDefined(response.status) && response.status === 200) {
						toaster.pop({
							type: "success",
							title: $translate.instant("TOASTER.SUCCESS_TITLE"),
							body: $translate.instant("TOASTER.SUCCESS_UNLOCK_BODY", { template: $translate.instant("SETTING.USER") }),
							showCloseButton: true,
						});
						$scope.getAllUsers();
					} else {
						toaster.pop({
							type: "error",
							title: $translate.instant("TOASTER.ERROR_UNLOCK_BODY", { template: $translate.instant("SETTING.USER") }),
							body: $translate.instant(response.data.description),
							showCloseButton: true,
						});
					}
				});
			}
		});
	};

	$scope.$on('handleBroadcastNewUserChanged', function(event) {
		$scope.getAllUsers();
	});
	let searchDebounceTimer = null;
	function safeApply(scope) {
		if (!scope.$$phase && !scope.$root.$$phase) {
			scope.$apply();
		}
	}
	$scope.searchUser = function() {
		if (searchDebounceTimer) {
			clearTimeout(searchDebounceTimer);
		}

		searchDebounceTimer = setTimeout(() => {
			$scope.applyUserFilters();
			safeApply($scope);
		}, 300);
	};

	$scope.filterUsersByEnterpriseSpace = function () {
		$scope.applyUserFilters();
	};


	$scope.getAllUsers();
	$scope.getAllPrivileges();
	$scope.getAllMenuTemplates();
	$scope.getEnterpriseSpaces();

});

app.controller('NewUserController', function ($scope,
	$window,
	$uibModal,
	UserService,
	PrivilegeService,
	MenuTemplateService,
	SpaceService,
	toaster,
	$translate,
	SweetAlert) {
	$scope.cur_user = JSON.parse($window.localStorage.getItem("myems_admin_ui_current_user"));
	$scope.enterpriseSpaces = [];
	$scope.menuTemplates = [];
	$scope.getEnterpriseSpaces = function () {
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
	$scope.getAllNewUsers = function () {
		let headers = { "User-UUID": $scope.cur_user.uuid, "Token": $scope.cur_user.token };
		UserService.getAllNewUsers(headers, function (response) {
			if (angular.isDefined(response.status) && response.status === 200) {
				$scope.users = response.data;
			} else {
				$scope.users = [];
			}
		});
	};

	$scope.getAllPrivileges = function () {
		let headers = { "User-UUID": $scope.cur_user.uuid, "Token": $scope.cur_user.token };
		PrivilegeService.getAllPrivileges(headers, function (response) {
			if (angular.isDefined(response.status) && response.status === 200) {
				$scope.privileges = response.data;
			} else {
				$scope.privileges = [];
			}
		});

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

	$scope.approveUser = function (user) {
		var modalInstance = $uibModal.open({
			templateUrl: 'views/users/user/approve-user.html',
			controller: 'ModalApproveUserCtrl',
			windowClass: "animated fadeIn",
			resolve: {
				params: function () {
					return {
						user: angular.copy(user),
						privileges: angular.copy($scope.privileges),
						menuTemplates: angular.copy($scope.menuTemplates),
						currentUser: angular.copy($scope.cur_user),
						enterpriseSpaces: angular.copy($scope.enterpriseSpaces)
					};
				}
			}
		});
		modalInstance.result.then(function (user) {
			let headers = { "User-UUID": $scope.cur_user.uuid, "Token": $scope.cur_user.token };
			UserService.approveUser(user, headers, function (response) {
				if (angular.isDefined(response.status) && response.status === 201) {
					toaster.pop({
						type: "success",
						title: $translate.instant("TOASTER.SUCCESS_TITLE"),
						body: $translate.instant("TOASTER.SUCCESS_ADD_BODY", { template: $translate.instant("SETTING.USER") }),
						showCloseButton: true,
					});
					$scope.$emit('handleEmitNewUserChanged');
					$scope.getAllNewUsers();
				} else {
					toaster.pop({
						type: "error",
						title: $translate.instant("TOASTER.ERROR_ADD_BODY", { template: $translate.instant("SETTING.USER") }),
						body: $translate.instant(response.data.description),
						showCloseButton: true,
					});
				}
			});
		}, function () {

		});
	};

	$scope.deleteUser = function (user) {
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
				UserService.deleteNewUser(user, headers, function (response) {
					if (angular.isDefined(response.status) && response.status === 204) {
						toaster.pop({
							type: "success",
							title: $translate.instant("TOASTER.SUCCESS_TITLE"),
							body: $translate.instant("TOASTER.SUCCESS_DELETE_BODY", { template: $translate.instant("SETTING.USER") }),
							showCloseButton: true,
						});
						$scope.getAllNewUsers();
					} else {
						toaster.pop({
							type: "error",
							title: $translate.instant("TOASTER.ERROR_DELETE_BODY", { template: $translate.instant("SETTING.USER") }),
							body: $translate.instant(response.data.description),
							showCloseButton: true,
						});
					}
				});
			}
		});
	};

	$scope.getAllNewUsers();
	$scope.getAllPrivileges();
	$scope.getAllMenuTemplates();
	$scope.getEnterpriseSpaces();
});

app.controller('ModalAddUserCtrl', function ($scope, $uibModalInstance, params, toaster, $translate) {
	$scope.operation = "USER.ADD_USER";
	$scope.privileges = params.privileges;
	$scope.menuTemplates = params.menuTemplates || [];
	$scope.currentUser = params.currentUser || {};
	$scope.enterpriseSpaces = params.enterpriseSpaces || [];
	$scope.user = {
		is_admin: false,
		is_read_only: false,
		account_expiration_datetime:moment().add(1,'years'),
        password_expiration_datetime:moment().add(1,'years'),
		phone: '',
		menu_template_id: null,
		enterprise_space_id: $scope.currentUser.enterprise_space_id || null
	};
	$scope.dtOptions = {
        locale:{
            format: 'YYYY-MM-DD HH:mm:ss',
            applyLabel: "OK",
            cancelLabel: "Cancel",
        },
		drops: "up",
        timePicker: true,
        timePicker24Hour: true,
        timePickerIncrement: 15,
        singleDatePicker: true,
    };
	$scope.ok = function () {
		if ($scope.user.phone && $scope.user.phone.trim() && !/^\+?\d{8,}$/.test($scope.user.phone.trim())) {
			toaster.pop({
				type: "error",
				title: $translate.instant("TOASTER.ERROR_ADD_BODY", { template: $translate.instant("SETTING.USER") }),
				body: $translate.instant("TOASTER.ERROR_PHONE"),
				showCloseButton: true,
			});
			return;
		}
		if (!$scope.user.is_admin) {
			$scope.user.is_read_only = undefined;
		}
		$scope.user.account_expiration_datetime = $scope.user.account_expiration_datetime.format().slice(0,19);
        $scope.user.password_expiration_datetime = $scope.user.password_expiration_datetime.format().slice(0,19);
		$uibModalInstance.close($scope.user);
	};

	$scope.cancel = function () {
		$uibModalInstance.dismiss('cancel');
	};
});

app.controller('ModalEditUserCtrl', function ($scope, $uibModalInstance, params, toaster, $translate) {
	$scope.operation = "USER.EDIT_USER";
	$scope.user = params.user;
	$scope.privileges = params.privileges;
	$scope.menuTemplates = params.menuTemplates || [];
	$scope.currentUser = params.currentUser || {};
	$scope.enterpriseSpaces = params.enterpriseSpaces || [];
	if ($scope.user.privilege != null) {
		$scope.user.privilege_id = $scope.user.privilege.id;
	} else {
		$scope.user.privilege_id = undefined;
	}
	if ($scope.currentUser.enterprise_space_id != null) {
		$scope.user.enterprise_space_id = $scope.currentUser.enterprise_space_id;
	}
	if ($scope.user.menu_template != null) {
		$scope.user.menu_template_id = $scope.user.menu_template.id;
	}
	if (!$scope.user.hasOwnProperty('phone')) {
		$scope.user.phone = '';
	}
	$scope.dtOptions = {
        locale: {
            format: 'YYYY-MM-DD HH:mm:ss',
            applyLabel: "OK",
            cancelLabel: "Cancel",
        },
		drops: "up",
        timePicker: true,
        timePicker24Hour: true,
        timePickerIncrement: 15,
        singleDatePicker: true,
    };
	$scope.ok = function () {
		if ($scope.user.phone && $scope.user.phone.trim() && !/^\+?\d{8,}$/.test($scope.user.phone.trim())) {
			toaster.pop({
				type: "error",
				title: $translate.instant("TOASTER.ERROR_UPDATE_BODY", { template: $translate.instant("SETTING.USER") }),
				body: $translate.instant("TOASTER.ERROR_PHONE"),
				showCloseButton: true,
			});
			return;
		}
		if ($scope.user.is_admin) {
			if ($scope.user.is_read_only == null) {
				$scope.user.is_read_only = false
			}
		}else {
			$scope.user.is_read_only = undefined;
		}
		$scope.user.account_expiration_datetime = moment($scope.user.account_expiration_datetime).format().slice(0,19);
        $scope.user.password_expiration_datetime = moment($scope.user.password_expiration_datetime).format().slice(0,19);
        $uibModalInstance.close($scope.user);
	};

	$scope.cancel = function () {
		$uibModalInstance.dismiss('cancel');
	};
});

app.controller('ModalResetPasswordCtrl', function ($scope, $uibModalInstance, params) {
	$scope.user = params.user;

	$scope.ok = function () {
		$uibModalInstance.close($scope.user);
	};

	$scope.cancel = function () {
		$uibModalInstance.dismiss('cancel');
	};
});

app.controller('ModalChangePasswordCtrl', function ($scope, $uibModalInstance, params) {
	$scope.user = params.user;

	$scope.ok = function () {
		$uibModalInstance.close($scope.user);
	};

	$scope.cancel = function () {
		$uibModalInstance.dismiss('cancel');
	};
});

app.controller('ModalApproveUserCtrl', function ($scope, $uibModalInstance, params) {

	$scope.operation = "USER.APPROVE_USER";
	$scope.privileges = params.privileges;
	$scope.menuTemplates = params.menuTemplates || [];
	$scope.currentUser = params.currentUser || {};
	$scope.enterpriseSpaces = params.enterpriseSpaces || [];
	$scope.user = {
		...params.user,
		is_admin: false,
		is_read_only: false,
		account_expiration_datetime:moment().add(1,'years'),
        password_expiration_datetime:moment().add(1,'years'),
		phone: params.user.phone || '',
		menu_template_id: null,
		enterprise_space_id: $scope.currentUser.enterprise_space_id || null
	};
	$scope.dtOptions = {
        locale:{
            format: 'YYYY-MM-DD HH:mm:ss',
            applyLabel: "OK",
            cancelLabel: "Cancel",
        },
		drops: "up",
        timePicker: true,
        timePicker24Hour: true,
        timePickerIncrement: 15,
        singleDatePicker: true,
    };
	$scope.ok = function () {
		if ($scope.user.is_admin) {
		}else {
			$scope.user.is_read_only = undefined;
		}
		$scope.user.account_expiration_datetime = $scope.user.account_expiration_datetime.format().slice(0,19);
        $scope.user.password_expiration_datetime = $scope.user.password_expiration_datetime.format().slice(0,19);
		$uibModalInstance.close($scope.user);
	};

	$scope.cancel = function () {
		$uibModalInstance.dismiss('cancel');
	};
});