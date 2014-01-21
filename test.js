var ClientAPI = require('./taas-client')
  , util      = require('util')
  ;

var steward = new ClientAPI.ClientAPI(
{ steward : { name    : 'arden-arcade'
            , crtPath : 'server.crt'
            }
, cloud   : { service : 'taas.thethingsystem.net'
            , crtPath : 'cloud.crt'
            }
}).on('open', function(channel, loginP) {
  console.log('open ' + channel);

  if (!loginP) return;

  steward.login('mrose/7', '429305', function(err, error) {
    if (!!err) {
      console.log('login error: ' + JSON.stringify(error));
      process.exit(0);
    }

    console.log('logged in');
  });
}).on('ready', function(channel, data) {
  console.log('ready ' + channel + ' data='+ JSON.stringify(data));

  if (channel === 'management') console.log('ready, set, go!');
}).on('actor', function(whoami, whatami) {
  if (whoami === 'place/1') return console.log('actor ' + whoami);

  if (whatami !== '/device/motive/crazyflie/3d') return;

  console.log(util.inspect(steward.actors[whoami], { depth: null }));
}).on('close', function(channel) {
  console.log(channel + ' close');
  process.exit(0);
}).on('error', function(channel, err) {
  console.log(channel + ' error: ' + err.message);
  process.exit(0);
});
