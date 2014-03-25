var argo = require('argo');
var express = require('express');
var request = require('request');
var usergrid = require('usergrid');
var router = require('argo-url-router');

var app = express();

console.log('Server started');

var proxy = argo()
    .use(function(handle) {
        handle('response', function(env, next) {
            env.response.setHeader('Access-Control-Allow-Origin', '*');
            next(env);
        });
    })
    .use(function(handle) {
        handle('response', function(env, next) {
            if (env.request.method === 'OPTIONS') {
                env.response.statusCode = 200;
                env.response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
                env.response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
                env.response.setHeader('Access-Control-Max-Age', '432000'); // 12 hours in seconds
            }

            next(env);
        });
    })
    .route('^/.+/apm/.*$', {
        methods: ['GET', 'POST']
    }, function(handle) {
        handle('request', function(env, next) {
            env.target.url = 'https://api.usergrid.com' + env.request.url;
            next(env);
        });
    })
    .post('/[A-Za-z0-9]*/[A-Za-z0-9]*/items/*', function(handle) {
        handle('request', function(env, next) {
            var org = env.request.url.split('/');
            var client = new usergrid.client({
                orgName: org[1],
                appName: org[2]
            });
            env.request.getBody(function(err, body) {
                if (err) {
                    console.log('Error: ' + err);
                } else {
                    var b = JSON.parse(body.toString());
                    request('http://maps.googleapis.com/maps/api/geocode/json?address=' + b.place + '&sensor=true',
                        function(err, result, body) {
                            b['location'] = {
                                'latitude': JSON.parse(body).results[0].geometry.location.lat,
                                'longitude': JSON.parse(body).results[0].geometry.location.lng
                            };
                            var entity = {
                                type: "items",
                                title: b.title,
                                place: b.place,
                                location: {
                                    latitude: b.location.latitude,
                                    longitude: b.location.longitude
                                }
                            };
                            client.createEntity(entity, function(err, res) {
                                if (err) {
                                    console.log('entity creation went boom');
                                } else {
                                    console.log('created entity');
                                    if (b.appUser) {
                                        var appUser = client.restoreEntity(b.appUser);
                                        appUser.connect("likes", res, function(error, data) {
                                            if (error) {
                                                console.log("An error occured while connecting the entity");
                                                next(env);
                                            } else {
                                                console.log('Entity connected');
                                                env.response.body = data;
                                                next(env);
                                            }
                                        });
                                    } else {
                                        next(env);
                                    }

                                }
                            });
                        });
                }
            });
        });
    })
    .build();

app.get('/hello', function(req, res) {
    res.send('Hello from Express');
});

app.all('*', proxy.run);

app.listen(3000);