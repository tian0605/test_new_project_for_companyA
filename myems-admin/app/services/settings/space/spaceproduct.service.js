'use strict';
app.factory('SpaceProductService', function($http) {
    return {
        addPair: function(spaceID, productID, headers, callback) {
            $http.post(getAPI() + 'spaces/' + spaceID + '/products', { data: { 'product_id': productID } }, { headers })
            .then(function(response) {
                callback(response);
            }, function(response) {
                callback(response);
            });
        },

        deletePair: function(spaceID, productID, headers, callback) {
            $http.delete(getAPI() + 'spaces/' + spaceID + '/products/' + productID, { headers })
            .then(function(response) {
                callback(response);
            }, function(response) {
                callback(response);
            });
        },

        getProductsBySpaceID: function(id, headers, callback) {
            $http.get(getAPI() + 'spaces/' + id + '/products', { headers })
            .then(function(response) {
                callback(response);
            }, function(response) {
                callback(response);
            });
        }
    };
});