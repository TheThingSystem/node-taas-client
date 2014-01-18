TAAS-client
===========
Things-as-a-service, client-side.

This package implements a node.js module for [#thethingsystem](http://thethingsystem.com/) clients,
talking either directly to the steward or through a [TAAS server](http://github.com/TheThingsystem/TAAS-server).


Install
-------

    npm install TAAS-client

API
---

### Load

    var ClientAPI = require('TAAS-client');

### Login to steward

    var userName     = '...'
      , passPhrase   = '...'
      , steward
      ;

    steward = new ClientAPI.ClientAPI({ })
                .login(function(clientID, function(err, user)) {
      if (!!err) return console.log('login error: ' + err.message);

      // otherwise, good to go!
      console.log('user: '); console.log(user);
      console.log('scopes: '); console.log(scopes);
    }).on('totp', function(err, clientID, callback) {
      if (!!err) console.log('invalid code');

      // query user for six-digit time-based one-time password for clientID
      callback(null, 'nnnnnn');
    }).on('error', function(err) {
      console.log('background error: ' + err.message);
    });
