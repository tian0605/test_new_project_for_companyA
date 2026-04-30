'use strict';
app.factory('ProductService', function($http) {
    return {
        getAllProducts: function(headers, callback) {
            $http.get(getAPI() + 'products', { headers })
            .then(function(response) {
                callback(response);
            }, function(response) {
                callback(response);
            });
        },
        searchProducts: function(query, headers, callback) {
            $http.get(getAPI() + 'products', {
                params: { q: query },
                headers: headers
            })
            .then(function(response) {
                callback(response);
            }, function(response) {
                callback(response);
            });
        },
        addProduct: function(product, headers, callback) {
            $http.post(getAPI() + 'products', { data: product }, { headers })
            .then(function(response) {
                callback(response);
            }, function(response) {
                callback(response);
            });
        },
        editProduct: function(product, headers, callback) {
            $http.put(getAPI() + 'products/' + product.id, { data: product }, { headers })
            .then(function(response) {
                callback(response);
            }, function(response) {
                callback(response);
            });
        },
        deleteProduct: function(product, headers, callback) {
            $http.delete(getAPI() + 'products/' + product.id, { headers })
            .then(function(response) {
                callback(response);
            }, function(response) {
                callback(response);
            });
        }
    };
});