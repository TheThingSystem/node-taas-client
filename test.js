var ClientAPI = require('./taas-client');

var steward;

steward = new ClientAPI.ClientAPI({ steward : { name    : 'arden-arcade' }
                                  , cloud   : { service : 'taas.thethingsystem.net'
                                              , crtPath : 'cloud.crt'
                                              }
                                  }).on('open', function() {
            console.log('>>> open');
          }).on('close', function() {
            console.log('ClientAPI close');
          }).on('error', function(err) {
            console.log('ClientAPI error: ' + err.message);
          });
