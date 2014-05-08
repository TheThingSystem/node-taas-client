var ClientAPI  = require('./taas-client')
  , async      = require('async')
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

var activities =
{ activity1            :
  { name               : 'plugged-in at home'
  , event              : 'condition1'
  , task               : 'action1'
  }

, activity2            :
  { name               : 'plugged-in at charging station'
  , event              : 'condition2'
  , task               : 'action2'
  }

, activity3            :
  { name               : 'charging at charging station'
  , event              : 'condition3'
  , task               : 'action3'
  }

, activity4            :
  { name               : 'completion at charging station'
  , event              : 'condition4'
  , task               : 'action4'
  }

, activity5            :
  { name               : 'vehicle secured when not at home'
  , event              : 'condition5'
  , task               : 'action5'
  }
};

var events =
{ condition1           :
  { name               : 'charger not plugged in at home, at night'
  , operator           : 'and'
  , subordinates       : [ 'stoppedForAtLeast5m'
                         , 'atNight'
                         , 'needsChargeAtHome'
                         , 'notPluggedIn'
                         ]
  }

, condition2           :
  { name               : 'charger not plugged in at charging station'
  , operator           : 'and'
  , subordinates       : [ 'stoppedForAtLeast5m'
                         , 'needsChargeAway'
                         , 'notPluggedIn'
                         ]
  }

, condition3           :
  { name               : 'charger plugged in, but not charging'
  , operator           : 'and'
  , subordinates       : [ 'needsChargeAway'
                         , 'pluggedInNotCharging'
                         ]
  }

, condition4           :
  { name               : 'charging complete in about 5m'
  , operator           : 'and'
  , subordinates       : [ 'notAtHomeCharger'
                         , 'nowCharging'
                         , 'chargingDoneWithin5m'
                         ]
  }

, condition5           :
  { name               : 'vehicle secured when not at home'
  , operator           : 'and'
  , subordinates       : [ 'notAtHomeCharger'
                         , 'stoppedForAtLeast5m'
                         , 'notLockedAndClosed'
                         ]
  }

, stoppedForAtLeast5m  :
  { operator           : 'and'
  , subordinates       : [ 'stopped'
                         , 'sameCycleForAtLeast5m'
                         ]
  }

, stopped              :
  { condition          : { operator: 'equals',       operand1: '.[.velocity].',              operand2: 0                    }
  }

, sameCycleForAtLeast5m:
  { condition          : { operator: 'greater-than', operand1: '.[.cycleTime].',             operand2: 299                   }
  }

, atNight              :
  { condition          : { operator: 'equals',       operand1: '.[.location.solar].',        operand2: 'night'               }
  }

, atHomeCharger        :
  { condition          : { operator: 'less-than',    operand1: '.[.distance].',              operand2: 1                     }
  }

, notAtHomeCharger        :
  { condition          : { operator: 'greater-than', operand1: '.[.distance].',              operand2: 0                     }
  }

, needsChargeAtHome    :
  { operator           : 'and'
  , subordinates       : [ 'atHomeCharger'
                         , 'homeChargeLow'
                         ]
  }

, homeChargeLow        :
  { condition          : { operator: 'less-than',    operand1: '.[.batteryLevel.0].',        operand2: '.[.batteryLevel.1].' }
  }

, notPluggedIn         :
  { condition          : { operator: 'equals',       operand1: '.[.charger].',               operand2: 'disconnected'        }
  }

, atChargingStation    :
  { condition          : { operator: 'less-than',    operand1: '.[.station.distance].',      operand2: 1                     }
  }

, needsChargeAway      :
  { operator           : 'and'
  , subordinates       : [ 'atChargingStation'
                         , 'travelChargeLow'
                         ]
  }

, travelChargeLow      :
  { condition          : { operator: 'less-than',     operand1: '.[.batteryLevel.0].',        operand2: '.[.batteryLevel.2].' }
  }

, needsCharge          :
  { operator           : 'or'
  , subordinates       : [ 'needsChargeAtHome'
                         , 'needsChargeAway'
                         ]
  }

, pluggedInNotCharging :
  { condition          : { operator: 'equals',       operand1: '.[.charger].',               operand2: 'connected'           }
  }

, nowCharging          :
  { condition          : { operator: 'equals',       operand1: '.[.charger].',               operand2: 'charging'            }
  }

, chargingDoneWithin5m :
  { condition          : { operator: 'less-than',    operand1: '.[.batteryLevel.3].',        operand2: 301                   }
  }

, notLockedAndClosed   :
  { operator           : 'or'
  , subordinates       : [ 'doorsNotLocked'
                         , 'frunkOpen'
                         , 'trunkOpen'
                         , 'sunroofOpen'
                         ]
  }

, doorsNotLocked :
  { condition          : { operator: 'not-equals',  operand1: '.[.doors].',                 operand2: 'locked'               }
  }

, frunkOpen            :
  { condition          : { operator: 'equals',       operand1: '.[.frunk].',                 operand2: 'open'                }
  }

, trunkOpen            :
  { condition          : { operator: 'equals',       operand1: '.[.trunk].',                 operand2: 'open'                }
  }

, sunroofOpen          :
  { condition          : { operator: 'equals',       operand1: '.[.sunroof].',               operand2: 'open'                }
  }

// LATER: temperature adjustments, vehicle moving away from associated user(s)
};

var tasks =
{ action1              :
  { name               : 'charger not plugged in at home, at night'
  , behavior           : { perform   : 'growl'
                         , parameter : { priority: 'warning', message: 'not plugged into home charger' }
                         }
  }

, action2              :
  { name               : 'charger not plugged in at charging station'
  , behavior           : { perform   : 'growl'
                         , parameter : { priority: 'warning', message: 'not plugged in at charging station' }
                         }
  }

, action3              :
  { name               : 'charger plugged in, but not charging'
  , behavior           : { perform   : 'growl'
                         , parameter : { priority: 'warning', message: 'charger plugged in, but not charging' }
                         }
  }

, action4              :
  { name               : 'charging complete in about 5m'
  , behavior           : { perform   : 'growl'
                         , parameter : { priority: 'warning', message: 'charging complete in about 5m' }
                         }
  }

, action5              :
  { name               : 'vehicle not secured'
  , behavior           : { perform   : 'growl'
                         , parameter : { priority: 'warning', message: 'vehicle not secured' }
                         }
  }
};


var getToWork = function(client) {
  var actor, entry, foundP;

  if (!preflight(client)) process.exit(1);

  foundP = false;
  for (actor in client.actors) {
    if (!client.actors.hasOwnProperty(actor)) continue;
    entry = client.actors[actor];

    if (entry.whatami !== '/device/motive/tesla/model-s') continue;

    getToWorkOn(client, entry);
    foundP = true;
  }
  if (foundP) return;

  console.log('no Tesla Motors sedans found!');
  process.exit(1);
};


var preflight = function(client) {
  var activity, activityID, actor, entry, eventID, failP, growler, taskID;

  for (eventID in events) if (events.hasOwnProperty(eventID)) events[eventID].id = eventID;

  for (actor in client.actors) {
    if (!client.actors.hasOwnProperty(actor)) continue;
    entry = client.actors[actor];
    if (entry.whatami.indexOf('/device/indicator/') !== 0) continue;
    if (entry.whatami.lastIndexOf('/text') !== (entry.whatami.length - 5)) continue;

    growler = entry.whoami;
    break;
  }
  if (!growler) {
    console.log('no growl performers found!');
    return false;
  }
  for (taskID in tasks) if (tasks.hasOwnProperty(taskID)) {
    tasks[taskID].id = taskID;
    if (!!tasks[taskID].behavior) tasks[taskID].behavior.actor = growler;
  }

  failP = false;
  for (activityID in activities) if (activities.hasOwnProperty(activityID)) {
    activity = activities[activityID];
    activity.id = activityID;
    if ((!findEvent(events, activity.event)) || (!findTask(tasks, activity.task))) failP = true;
  }

  return !failP;
};


var active = 0;
var uuid  = 'b31e1ff0-d63a-11e3-9c1a-0800200c9a66';

var getToWorkOn = function(client, entry) {
  var activityID, c1, c2;

  entry.deviceID = entry.whoami.split('/')[1];
  c1 = clone(events);
  c2 = clone(tasks);
  for (activityID in activities) if (activities.hasOwnProperty(activityID)) {
    getToWorkOnWithActivity(client, entry, activities[activityID], c1, c2);
  }
};

var getToWorkOnWithActivity = function(client, entry, activity, events, tasks) {
  var event, task;

  active++;

  event = findEvent(events, activity.event);
  task = findTask(tasks, activity.task);
  async.series(
    [ function(callback) {
        active++;

        createEvent(client, entry, event, events, function(err) {
          active--;
          callback(err);
        });
      }

    , function(callback) {
        active++;

        createTask(client, entry, task, tasks, function(err) {
          active--;
          callback(err);
        });
      }

    , function(callback) {
        active++;

        client.createActivity('monitor ' + entry.name + ' ' + activity.name,
                              uuid + ':activity:' + activity.id + ':' + entry.deviceID, event.actor, task.actor, true, '',
                              function(message) {
          if ((!message.result)  && (!message.error))            return;

          active--;
          if ((!!message.result) && (!!message.result.activity)) return callback(null, 'activity/' + message.result.activity);
          if ((!!message.error)  && (!!message.error.videlicet)) return callback(null, message.error.videlicet);
          callback(new Error('create ' + activity.name + ' returns ' + JSON.stringify(message)));
        });
      }
    ],

    function(err, results) {
      if (!!err) return console.error(err);

      if (!!results) console.log(entry.name + ' ' + activity.name + ': ' + results[results.length - 1]);

      active--;
      if (active !== 0) return;

      console.log('done.');
      process.exit(0);
    });
};

var createGroup = function(client, entry, type, group, parent, callback) {
  var f, i, subordinates;

  if (!!group.actor) return callback(null, group.actor);

  subordinates = [];
  if (type === 'event') {
    f = createEvent;
    for (i = 0; i < group.subordinates.length; i++) subordinates.push(findEvent(parent, group.subordinates[i]));
  } else {
    f = createTask;
    for (i = 0; i < group.subordinates.length; i++) subordinates.push(findTask(parent, group.subordinates[i]));
  }

  async.map(subordinates, function(e, cb) { f(client, entry, e, parent, cb); }, function(err, results) {
    for (i = 0; i < group.subordinates.length; i++) group.subordinates[i].actor = results[i];

    client.createGroup(entry.name + ' ' + group.id, uuid + ':group:' + group.id + ':' + entry.deviceID, type, group.operator,
                       results, '', function(message) {
     if ((!message.result) && (!message.error)) return;

     if ((!!message.result) && (!!message.result.group)) {
       group.actor = 'group/' + message.result.group;
       return callback(null, group.actor);
     }
     if ((!!message.error) && (!!message.error.videlicet)) {
       group.actor = message.error.videlicet;
       return callback(null, group.actor);
     }

     callback(new Error('create ' + group.	dname + ' returns ' + JSON.stringify(message)));
    });
  });
};

var createEvent = function(client, entry, event, events, callback) {
  if (!!event.operator) return createGroup(client, entry, 'event', event, events, callback);

  if (!!event.actor) return callback(null, event.actor);

  client.createEvent(entry.name + ' ' + event.id, uuid + ':event:' + event.id + ':' + entry.deviceID, entry.whoami,
                     '.condition', event.condition, '', function(message) {
     if ((!message.result) && (!message.error)) return;

     if ((!!message.result) && (!!message.result.event)) {
       event.actor = 'event/' + message.result.event;
       return callback(null, event.actor);
     }
     if ((!!message.error) && (!!message.error.videlicet)) {
       event.actor = message.error.videlicet;
       return callback(null, event.actor);
     }

     callback(new Error('create ' + event.id + ' returns ' + JSON.stringify(message)));
  });
};

var createTask = function(client, entry, task, tasks, callback) {
  if (!!task.operator) return createGroup(client, entry, 'task', task, tasks, callback);

  if (!!task.actor) return callback(null, task.actor);

  task.behavior.parameter.message = entry.name + ' ' + task.behavior.parameter.message;
  client.createTask(entry.name + ' ' + task.id, uuid + ':task:' + task.id + ':' + entry.deviceID, task.behavior.actor,
                     task.behavior.perform, task.behavior.parameter, '', function(message) {
     if ((!message.result) && (!message.error)) return;

     if ((!!message.result) && (!!message.result.task)) {
       task.actor = 'task/' + message.result.task;
       return callback(null, task.actor);
     }
     if ((!!message.error) && (!!message.error.videlicet)) {
       task.actor = message.error.videlicet;
       return callback(null, task.actor);
     }

     callback(new Error('create ' + task.id + ' returns ' + JSON.stringify(message)));
  });
};


var findEvent = function(events, eventID) {
  var event, i;

  event = events[eventID];
  if (!event) {
    console.log('no eventID: ' + eventID);
    return;
  }

  if (!!event.operator) for (i = 0; i < event.subordinates.length; i++) if (!findEvent(events, event.subordinates[i])) return;
  return event;
};

var findTask = function(tasks, taskID) {
  var i, task;

  task = tasks[taskID];
  if (!task) {
    console.log('no taskID: ' + taskID);
    return;
  }

  if (!!task.operator) for (i = 0; i < task.subordinates.length; i++) if (!findTask(tasks, task.subordinates[i])) return;
  return task;
};

var clone = function(o) {
  var prop, result;

  if ((!o) || ((typeof o) !== 'object')) return o;

  result = util.isArray(o) ? [] : {};
  for (prop in o) if (o.hasOwnProperty(prop)) result[prop] = clone(o[prop]);
  return result;
};
