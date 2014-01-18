var ClientAPI = require('./taas-client');

var steward;

steward = new ClientAPI.ClientAPI({ steward: { name: 'zekariah' } }).on('open', function() {
            console.log('>>> open');
          }).on('error', function(err) {
            console.log('ClientAPI error: ' + err.message);
          });
