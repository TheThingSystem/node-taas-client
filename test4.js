var ClientAPI  = require('./taas-client')
  , util       = require('util')
  ;

new ClientAPI.ClientAPI({ steward: { name: '127.0.0.1' } }).on('open', function(channel, loginP) {
  if (loginP) throw new Error('script should be run locally');
}).on('ready', function(channel, data) {
  if (channel === 'management') return getToWork(this);

  if (data.indexOf('read') !== -1) throw new Error('script requires write access');
}).on('close', function(channel) {
  console.log(channel + ' close');
  process.exit(1);
}).on('error', function(err, channel) {
  console.log(channel + ' error: ' + err.message);
  process.exit(1);
});

var getToWork = function(client) {
  var actor, count, deviceID, entry;

  var spoke = function(entry) {
    return function(response) {
      console.log(entry.whoami + ' responds:');
      console.log(util.inspect(response, { depth: null }));

      done();
    };
  };

  var done = function() {
    if (--count < 1) process.exit(0);
  };

  count = 1;

  for (actor in client.actors) {
    if (!client.actors.hasOwnProperty(actor)) continue;
    entry = client.actors[actor];
    if (entry.whatami.indexOf('/device/sensor/macguffin/sound') !== 0) continue;

    deviceID = entry.whoami.split('/')[1];
    console.log('telling ' + entry.whoami + ' to speak.');
    count++;
    client.performDevice(deviceID, 'speak', 'hello world.', spoke(entry));
  }

  done();
};
