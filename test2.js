// NB: humans won't be using the API like this, there will be, of course, a higher-level library that manages this detail...

var ClientAPI = require('./taas-client')
  , async     = require('async')
//, util      = require('util')
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


/*

activity
  event = group, operator and
    device/1 .condition { operator: 'equals', operand: '.[.status].', operand2: 'on' }
    device/2 .condition { operator: 'equals', operand: '.[.status].', operand2: 'off' }
  task = group, operator and
    device/1 off
    device/2 on

activity
  event = group, operator and
    device/1 .condition { operator: 'equals', operand: '.[.status].', operand2: 'on' }
    device/2 .condition { operator: 'equals', operand: '.[.status].', operand2: 'on' }
  task = group, operator and
    device/1 off
    device/2 off

 */

var getToWork = function(client) {
  var actor, entry, s1, s2, switches, uuid;

  var e1, e2, e3, g1, g2, g3, g4, t1, t2, t3;

  switches = [];
  for (actor in client.actors) {
    if (!client.actors.hasOwnProperty(actor)) continue;
    entry = client.actors[actor];

    if (entry.whatami.indexOf('/device/switch/wemo/') === 0) switches.push(entry);
  }
  switches.sort(function(a, b) {
    return (parseInt(a.whoami.substr(a.whoami.indexOf('/') + 1), 10)
                - parseInt(b.whoami.substr(b.whoami.indexOf('/') + 1), 10));
  });

  uuid = 'dd9a3b20-9ad9-11t1-a5e2-0800200c9a66';

  var  fetchActivity = function(message, tag, callback) {
          if ((!message.result) && (!message.error))             return;
          if ((!!message.result) && (!!message.result.activity)) return 'activity/' + message.result.activity;
          if ((!!message.error) && (!!message.error.videlicet))  return message.error.videlicet;
          callback(tag + ' returns ' + JSON.stringify(message));
        }
      , fetchEvent = function(message, tag, callback) {
          if ((!message.result) && (!message.error))             return;
          if ((!!message.result) && (!!message.result.event))    return 'event/' + message.result.event;
          if ((!!message.error) && (!!message.error.videlicet))  return message.error.videlicet;
          callback(tag + ' returns ' + JSON.stringify(message));
        }
      , fetchGroup = function(message, tag, callback) {
          if ((!message.result) && (!message.error))             return;
          if ((!!message.result) && (!!message.result.group))    return 'group/' + message.result.group;
          if ((!!message.error) && (!!message.error.videlicet))  return message.error.videlicet;
          callback(tag + ' returns ' + JSON.stringify(message));
        }
      , fetchTask = function(message, tag, callback) {
          if ((!message.result) && (!message.error))             return;
          if ((!!message.result) && (!!message.result.task))     return 'task/' + message.result.task;
          if ((!!message.error) && (!!message.error.videlicet))  return message.error.videlicet;
          callback(tag + ' returns ' + JSON.stringify(message));
        }
      ;

  async.waterfall(
    [ function(callback) {
        var doneP = function() { if ((!!e1) && (!!e2) && (!!e3) && (!!t1) && (!!t2) && (!!t3)) callback(null); };

        e1 = e2 = e3 = t1 = t2 = t3 = null;

        if (switches.length !== 2) {
          return callback(new Error('found ' + switches.length + ' WeMo switch' + (switches.length !== 1 ? 'es' : '')));
        }
        s1 = switches[0];
        s2 = switches[1];

        client.createEvent('when ' + s1.name + ' is on', uuid + ':event:switch1:on',
                           s1.whoami, '.condition', { operator: "equals", operand1: ".[.status].", operand2: "on" }, '',
                           function(message) {
          e1 = fetchEvent(message, 'create :event:switch2:on', callback);
          doneP();
         }).createEvent('when ' + s2.name + ' is off', uuid + ':event:switch2:off',
                           s2.whoami, '.condition', { operator: "equals", operand1: ".[.status].", operand2: "off" }, '',
                           function(message) {
          e2 = fetchEvent(message, 'create :event:switch2:off', callback);
          doneP();
         }).createEvent('when ' + s2.name + ' is on', uuid + ':event:switch2:on',
                           s2.whoami, '.condition', { operator: "equals", operand1: ".[.status].", operand2: "on" }, '',
                           function(message) {
          e3 = fetchEvent(message, 'create :event:switch2:on', callback);
          doneP();
         }).createTask('turn ' + s1.name + ' off', uuid + ':task:switch1:off',
                       s1.whoami, 'off', null, '', function(message) {
          t1 = fetchTask(message, 'create :task:switch1:off', callback);
          doneP();
         }).createTask('turn ' + s2.name + ' on', uuid + ':task:switch2:on',
                       s2.whoami, 'on', null, '', function(message) {
          t2 = fetchTask(message, 'create :task:switch2:on', callback);
          doneP();
         }).createTask('turn ' + s2.name + ' off', uuid + ':task:switch2:off',
                       s2.whoami, 'off', null, '', function(message) {
          t3 = fetchTask(message, 'create :task:switch2:off', callback);
          doneP();
         });
      }
    , function(callback) {
        var doneP = function() { if ((!!g1) && (!!g2) && (!!g3) && (!!g4)) callback(null); };

        g1 = g2 = g3 = g4 = null;

        client.createGroup('when ' + s1.name + ' is on and ' + s2.name + ' is off', uuid + ':events:phase1',
                           'event', 'and', [ e1, e2 ], '', function(message) {
          g1 = fetchGroup(message, 'create :events:phase1', callback);
          doneP();
        }).createGroup('turn ' + s1.name + ' off, turn ' + s2.name + ' on',  uuid + ':tasks:phase1',
                           'task', 'and', [ t1, t2 ], '', function(message) {
          g2 = fetchGroup(message, 'create :tasks:phase1', callback);
          doneP();
        }).createGroup('when ' + s1.name + ' is on and ' + s2.name + ' is on', uuid + ':events:phase2',
                           'event', 'and', [ e1, e3 ], '', function(message) {
          g3 = fetchGroup(message, 'create :events:phase2', callback);
          doneP();
        }).createGroup('turn ' + s1.name + ' off, turn ' + s2.name + ' off',  uuid + ':tasks:phase2',
                           'task', 'and', [ t1, t3 ], '', function(message) {
          g4 = fetchGroup(message, 'create :tasks:phase2', callback);
          doneP();
        });
      }

    , function(callback) {
        var a1, a2;

        var doneP = function() { if ((!!a1) && (!!a2)) callback(null); };

        client.createActivity('phase1: 1=on/2=off -> 1=off,2=on', uuid + ':activity:phase1',
                              g1, g2, true, '', function(message) {
          a1 = fetchActivity(message, 'create :activity:phase1', callback);
          doneP();
        }).createActivity('phase2: 1=on/2=on -> 1=off,2=off', uuid + ':activity:phase2',
                              g3, g4, true, '', function(message) {
          a2 = fetchActivity(message, 'create :activity:phase2', callback);
          doneP();
        });
      }
    ],

    function(err, results) {
      if (!!err) return console.error(err);

      if (!!results) console.log(results);
      console.log('done.');
      process.exit(0);
    });
};
