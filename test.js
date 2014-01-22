var ClientAPI = require('./taas-client')
  , util      = require('util')
  ;

var steward = new ClientAPI.ClientAPI(
{ steward : { name    : 'zephyr'
            , crtPath : 'server.crt'
            }
, cloud   : { service : 'taas.thethingsystem.net'
            , crtPath : 'cloud.crt'
            }
}).on('open', function(channel, loginP) {
  console.log('open ' + channel);

  if (!loginP) return;

  steward.login('root/1', '000000', function(err, error) {
    if (!!err) {
      console.log('login error: ' + JSON.stringify(error));
      process.exit(0);
    }

    console.log('logged in');
  });
}).on('ready', function(channel, data) {
  console.log('ready ' + channel + ' data='+ JSON.stringify(data));

  if (channel === 'management') console.log('ready, set, go!');
}).on('close', function(channel) {
  console.log(channel + ' close');
  process.exit(0);
}).on('error', function(channel, err) {
  console.log(channel + ' error: ' + err.message);
  process.exit(0);
});
};
