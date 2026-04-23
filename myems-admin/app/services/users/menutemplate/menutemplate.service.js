'use strict';
app.factory('MenuTemplateService', function($http) {
    return {
        getAllMenuTemplates:function(headers, callback){
            $http.get(getAPI()+'menu-templates', {headers})
            .then(function (response) {
                callback(response);
            }, function (response) {
                callback(response);
            });
        },
        addMenuTemplate: function(menuTemplate, headers, callback) {
            $http.post(getAPI()+'menu-templates', {data:menuTemplate}, {headers})
            .then(function (response) {
                callback(response);
            }, function (response) {
                callback(response);
            });
        },
        editMenuTemplate: function(menuTemplate, headers, callback) {
            $http.put(getAPI()+'menu-templates/'+menuTemplate.id, {data:menuTemplate}, {headers})
            .then(function (response) {
                callback(response);
            }, function (response) {
                callback(response);
            });
        },
        deleteMenuTemplate: function(menuTemplate, headers, callback) {
            $http.delete(getAPI()+'menu-templates/'+menuTemplate.id, {headers})
            .then(function (response) {
                callback(response);
            }, function (response) {
                callback(response);
            });
        }
    };
});