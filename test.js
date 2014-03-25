var ClientAPI = require('./taas-client')
  , speakeasy = require('speakeasy')
  ;

var steward = new ClientAPI.ClientAPI(
{ steward : { name    : 'steward.local'
            , crtPath : 'server.crt'
            }
, cloud   : { service : 'taas.thethingsystem.net'
            , crtPath : 'cloud.crt'
            }
}).on('open', function(channel, loginP) {
  console.log('open ' + channel);

  if (!loginP) return;

// fill-these in please...
  var clientID = '.../...'
    , loginCode = speakeasy.totp({ key      : '................................................................'
                                 , length   : 6
                                 , encoding : 'base32'
                                 , step     : 30 })
    ;

  steward.login(clientID, loginCode, function(err, result) {
    if (!!err) {
      console.log('login error: ' + JSON.stringify(result));
      process.exit(0);
    }

    console.log('logged in');
  });
}).on('ready', function(channel, data) {
  console.log('ready ' + channel + ' data='+ JSON.stringify(data));

  if (channel !== 'management') return;

  console.log('ready, set, go!');
  steward.listActors(null, { depth: 'all' }, function(message) {
    console.log(require('util').inspect(message, { depth: null }));
  });
}).on('actor', function(whoami, whatami) {
  console.log('actor ' + whoami + ': ' + whatami);
}).on('close', function(channel) {
  console.log(channel + ' close');
  process.exit(0);
}).on('error', function(err, channel) {
  console.log(channel + ' error: ' + err.message);
  process.exit(0);
});
