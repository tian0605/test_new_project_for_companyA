'use strict';
app.factory('EvaluationRuleService', function($http) {
    return {
        getAllEvaluationRules:function(headers, callback){
            $http.get(getAPI()+'evaluationrules', {headers})
            .then(function (response) {
                callback(response);
            }, function (response) {
                callback(response);
            });
        },
        getEvaluationRule: function(id, headers, callback) {
            $http.get(getAPI()+'evaluationrules/'+id, {headers})
            .then(function (response) {
                callback(response);
            }, function (response) {
                callback(response);
            });
        },
        addEvaluationRule: function(rule, headers, callback) {
            $http.post(getAPI()+'evaluationrules', {data:rule}, {headers})
            .then(function (response) {
                callback(response);
            }, function (response) {
                callback(response);
            });
        },
        editEvaluationRule: function(rule, headers, callback) {
            $http.put(getAPI()+'evaluationrules/'+rule.id, {data:rule}, {headers})
            .then(function (response) {
                callback(response);
            }, function (response) {
                callback(response);
            });
        },
        deleteEvaluationRule: function(rule, headers, callback) {
            $http.delete(getAPI()+'evaluationrules/'+rule.id, {headers})
            .then(function (response) {
                callback(response);
            }, function (response) {
                callback(response);
            });
        },
        cloneEvaluationRule: function(rule, headers, callback) {
            $http.post(getAPI()+'evaluationrules/'+rule.id+'/clone', {data:null}, {headers})
            .then(function (response) {
                callback(response);
            }, function (response) {
                callback(response);
            });
        },
        exportEvaluationRule: function(rule, headers, callback) {
            $http.get(getAPI()+'evaluationrules/'+rule.id+'/export', {headers})
            .then(function (response) {
                callback(response);
            }, function (response) {
                callback(response);
            });
        },
        importEvaluationRule: function(importdata, headers, callback) {
            $http.post(getAPI()+'evaluationrules/import', JSON.parse(importdata), {headers})
            .then(function (response) {
                callback(response);
            }, function (response) {
                callback(response);
            });
        }
    };
});
