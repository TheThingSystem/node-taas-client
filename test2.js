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

  if (channel === 'management') crazyflie();
}).on('close', function(channel) {
  console.log(channel + ' close');
  process.exit(0);
}).on('error', function(channel, err) {
  console.log(channel + ' error: ' + err.message);
  process.exit(0);
});


var crazyflie = function() {
  var actor, drones, entity, next;

// whenveer there's a state change for an actor, this event is emitted
  steward.on('actor', function(whoami, whatami) {
    var now;

    // if it's not a nano-quadcopter, ignore it
    if (whatami !== '/device/motive/crazyflie/3d') return;

    // if it's one we're already piloting, simply print out the state (at most every second)
    if (drones.indexOf(whoami) !== -1) {
      now = new Date().getTime ();

      if (now >= next) {
        console.log(util.inspect(steward.actors[whoami], { depth: null }));
        next = now + 1000;
      }
      return;
    }

    // otherwise, it's new, so start piloting it!
    drones.push(whoami);
    pilot(whoami);
  });

  drones = [];
  next = new Date().getTime() + 1000;

// look for all nano-quadcopters currently being managed by the steward and start piloting them
  for (actor in steward.actors) {
    if (!steward.actors.hasOwnProperty(actor)) continue;
    entity = steward.actors[actor];
    if ((entity.whatami !== '/device/motive/crazyflie/3d') || (drones.indexOf(entity.whoami) !== -1)) continue;

    drones.push(entity.whoami);
    pilot(entity.whoami);
  }
};


// you could use a sequence here instead of nested callbacks, but i'm old school...

var pilot = function(whoami) {
  var deviceID = whoami.split('/')[1];

  console.log(whoami + ' takeoff');
  steward.performDevice(deviceID, 'takeoff', null, function(message) {
    if (!!message.error) return console.log(whoami + ' takeoff error: ' + message.error.diagnostic);

  console.log(whoami + ' hover');
    steward.performDevice(deviceID, 'hover', null, function(message) {
      if (!!message.error) return console.log(whoami + ' hover error: ' + message.error.diagnostic);

      setTimeout (function() {
        console.log(whoami + ' land');
        steward.performDevice(deviceID, 'land', null, function(message) {
          if (!!message.error) return console.log(whoami + ' land error: ' + message.error.diagnostic);
        });
      }, 3 * 1000);
    });
  });
};
