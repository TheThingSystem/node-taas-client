// a node.js module to interface with the Things-as-a-service, client-side
//   cf., http://thethingsystem.com/dev/Home.html

var events      = require('events')
  , fs          = require('fs')
  , https       = require('https')
  , os          = require('os')
  , url         = require('url')
  , underscore  = require('underscore')
  , util        = require('util')
  , ws          = require('ws')
  ;

var mdns = null;
try {
	mdns = require('mdns')
}
catch(ex) {
	self.logger.warning('_wss._tcp','mdns is not installed. skipping...')
}

  
var DEFAULT_LOGGER = { error   : function(msg, props) { console.log(msg); if (!!props) console.log(props);             }
                     , warning : function(msg, props) { console.log(msg); if (!!props) console.log(props);             }
                     , notice  : function(msg, props) { console.log(msg); if (!!props) console.log(props);             }
                     , info    : function(msg, props) { console.log(msg); if (!!props) console.log(props);             }
                     , debug   : function(msg, props) { console.log(msg); if (!!props) console.log(props);             }
                     };


var Singleton = function(options) {
  var i, iface, ifaces, ifname, k;

  var self = this;

  if (!(self instanceof Singleton)) return new Singleton(options);

  self.options = options || {};

  self.logger = self.options.logger  || {};
  for (k in DEFAULT_LOGGER) {
    if ((DEFAULT_LOGGER.hasOwnProperty(k)) && (typeof self.logger[k] === 'undefined'))  self.logger[k] = DEFAULT_LOGGER[k];
  }

  ifaces = os.networkInterfaces();
  self.ifaddrs = [];
  for (ifname in ifaces) if (ifaces.hasOwnProperty(ifname)) {
    iface = ifaces[ifname];
    for (i = 0; i < iface.length; i++) {
      if ((!iface[i].internal) && (iface[i].family === 'IPv4')) self.ifaddrs.push(iface[i].address);
    }
  }

  self.hosts = {};
  if (mdns) {
    try {
      self.mdns = mdns.createBrowser(mdns.tcp('wss')).on('serviceUp', function (service) {
        for (i = 0; i < service.addresses.length; i++) {
          if (self.ifaddrs.indexOf(service.addresses[i]) !== -1) {
            service.localhost = true;
            break;
          }
        }

        self.hosts[service.host] = service;
      }).on('serviceDown', function (service) {
        delete (self.hosts[service.host]);
      }).on('serviceChanged', function (service) {
        self.hosts[service.host] = service;
      }).on('error', function (err) {
        self.logger.error('_wss._tcp', { event: 'mdns', diagnostic: err.message });
      });
      self.mdns.start();
    } catch (ex) {
      self.logger.error('_wss._tcp', { event: 'browse', diagnostic: ex.message });
    }
  }
};


var singleton = new Singleton();

/* options:

    for logging
      logger.*        : function(msg, props);

    for web sockets
      params.url      : complete 'ws:' or 'wss:' URL


    to identify steward
      steward.name    : e.g., IP address, 127.0.0.1/localhost, place1.name
      steward.uuid    : e.g., 2f402f80-da50-11e1-9b23-0123456789ab
      steward.crtData : steward's certificate (either as a buffer or array)
      steward.crtPath : pathname to file containing steward's certificate

    to find steward
      cloud.service  : e.g., taas.thethingsystem.net
      cloud.crtData  : cloud server's certificate (either as a buffer or array)
      cloud.crtPath  : pathname to file containing cloud server's certificate

 */

var ClientAPI = function(options) {
  var k;

  var self = this;

  if (!(self instanceof ClientAPI)) return new ClientAPI(options);

  self.options = options || {};

  self.logger = self.options.logger  || {};
  for (k in DEFAULT_LOGGER) {
    if ((DEFAULT_LOGGER.hasOwnProperty(k)) && (typeof self.logger[k] === 'undefined'))  self.logger[k] = DEFAULT_LOGGER[k];
  }
  if (!singleton.options.logger) {
    singleton.options.logger = self.logger;
    singleton.logger = self.logger;
  }

  self.params = self.options.params || {};

  if (!!self.params.url) return self._console(self);

  if (!self.options.steward) self.options.steward = {};

  self.timer = setInterval(function() {
    var ca, didP, entry, host;

    if ((self.options.steward.name === '127.0.0.1') || (self.options.steward.name === 'localhost')) {
      self.params.url = 'ws://localhost:8887';

      clearInterval(self.timer);
      return self._console(self);
    }

    if ((!!self.options.steward.name) && (self.options.steward.name.length === 0)) delete(self.options.steward.name);

    didP = false;
    for (host in singleton.hosts) if (singleton.hosts.hasOwnProperty(host)) {
      didP = true;
      entry = singleton.hosts[host];

      if (   ((!!self.options.steward.name)
                  && (entry.host !== (self.options.steward.name + '.' + entry.replyDomain))
                  && (entry.name + '.' + entry.replyDomain !== self.options.steward.name + '.')
                  && (entry.txtRecord.name !== self.options.steward.name))
          || ((!!self.options.steward.uuid) && (entry.txtRecord.uuid !== self.options.steward.uuid))) continue;

      if ((!self.options.steward.crtData) && (!self.options.steward.crtPath)) {
        self.params.url = 'ws://' + entry.host + ':8887';
      } else {
        self.params.url = 'wss://' + entry.host + ':' + entry.port;
      }

      clearInterval(self.timer);
      return self._console(self);
    }

    if ((!self.options.cloud) || (!self.options.steward.name)) {
      if (!didP) return;

      clearInterval(self.timer);      
      return self.emit('error', new Error('no matching stewards'));
    }

    self.params.url = 'wss://' + self.options.steward.name + '.' + self.options.cloud.service + ':443';

    ca = self.options.cloud.crtData;
    if (util.isArray(ca)) ca = new Buffer(ca);
    if ((!ca) && (!!self.options.cloud.crtPath)) ca = fs.readFileSync(self.options.cloud.crtPath);
    if (!!ca) ca = [ ca ];

    clearInterval(self.timer);
    self._cloud(self, ca);
  }, 250);

  return self;
};
util.inherits(ClientAPI, events.EventEmitter);


ClientAPI.prototype._cloud = function(self, ca) {
  var didP, options, u;

  var retry = function(secs) {
    if (didP) return;
    didP = true;

    setTimeout(function() { self._cloud(self, ca); }, secs * 1000);
  };

  u = url.parse(self.params.url);
  options = { host    : u.hostname
            , port    : u.port
            , method  : 'GET'
            , path    : ''
            , agent   : false
            , ca      : ca
            };

  didP = false;
  https.request(options, function(response) {
    var r;

    r = url.parse(response.headers.location);
    response.setEncoding('utf8');
    response.on('data', function(chunk) {/* jshint unused: false */
    }).on('end', function() {
      if (response.statusCode !== 307) {
        self.logger.error('register', { event: 'response', code: response.statusCode, retry: '15 seconds' });
        return retry(15);
      }

      self.params.url = u.protocol + '//' + r.hostname + ':' + r.port;
      self._console(self);
    }).on('close', function() {
      self.logger.warning('register', { event:'close', diagnostic: 'premature eof', retry: '1 second' });
      retry(1);
    });
  }).on('error', function(err) {
    self.logger.error('register', { event: 'error', diagnostic: err.message, retry: '10 seconds' });
    retry(10);
  }).end();
};


ClientAPI.prototype._console = function(self) {
  self.logger.info('console', { event: 'establish', url: self.params.url + '/console' });

  if (util.isArray(self.options.steward.crtData)) self.options.steward.crtData = new Buffer(self.options.steward.crtData);
  self.params.ca = self.options.steward.crtData;
  if ((!self.params.ca) && (!!self.options.steward.crtPath)) self.params.ca = fs.readFileSync(self.options.steward.crtPath);
  if (!!self.params.ca) self.params.ca = [ self.params.ca ];

  self.console = new ws(self.params.url + '/console', self.params).on('open', function() {
    self.emit('open', 'console', false);

    self.actors = {};
    self.permissions = [];
    self._manage(self);
  }).on('message', function(data, flags) {
    var category, i, logs, message;

    if ((!!flags) && (flags.binary === true)) return self.emit('error', new Error('binary console message'), 'console');

    try { message = JSON.parse(data.toString()); } catch(ex) {
      return self.emit('error', new Error('error parsing console message'), 'console');
    }
    if (!!message.requestID) return;

    for (category in message) if (message.hasOwnProperty(category)) {
      logs = message[category];

      if (!util.isArray(logs)) {
        if ((category === 'notice') && (util.isArray(logs.permissions))) {
          self.permissions = logs.permissions;
          self.emit('ready', 'console', self.permissions);
          continue;
        }
        logs = [ logs ];
      }
      if (category !== '.updates') continue;

      for (i = 0; i< logs.length; i++) self._merge(self, logs[i]);
    }
  }).on('close', function() {
    self.emit('close', 'console');
  }).on('error', function(err) {
    self.emit('error', err, 'console');
  });

  return self;
};

ClientAPI.prototype._manage = function(self) {
  self.manage = new ws(self.params.url + '/manage', self.params).on('open', function() {
    self.reqno = 1;
    self.callbacks = {};

    self.addCallback = function(cb, atMost) {
      self.callbacks[self.reqno.toString()] = { callback: cb, times: atMost };
      return self.reqno++;
    };

    self.emit('open', 'management', self.permissions.length === 0);
    if ((self.permissions.indexOf('read') !== -1) || (self.permissions.indexOf('developer') !== -1)) self._list(self);
  }).on('message', function(data, flags) {
    var callback, doneP, message, requestID;

    if ((!!flags) && (flags.binary === true)) return self.emit('error', new Error('binary management message'), 'management');

    try { message = JSON.parse(data.toString()); } catch(ex) {
      return self.emit('error', new Error('error parsing management message'), 'management');
    }
    self.logger.debug('management', message);

    requestID = message.requestID.toString();

    if (!self.callbacks[requestID]) return;

    callback = self.callbacks[requestID].callback;
    doneP = (self.callbacks[requestID].times-- < 2) || (!!message.error);
    if (doneP) delete(self.callbacks[requestID]);
    callback(message, doneP);
  }).on('close', function() {
    self.emit('close', 'management');
  }).on('error', function(err) {
    self.emit('error', err, 'management');
  });

  return self;
};

ClientAPI.prototype._list = function(self) {
  self.listActors('', { depth: 'all' }, function(message) {
    var deviceID, devices, deviceType, entry;

    for (deviceType in message.result) {
      if ((!message.result.hasOwnProperty(deviceType))
              || ((deviceType.indexOf('/device/') !== 0) && (deviceType.indexOf('/place/') !== 0))) continue;

      devices = message.result[deviceType];
      for (deviceID in devices) if (devices.hasOwnProperty(deviceID)) {
        entry = devices[deviceID];
        entry.whatami = deviceType;
        entry.whoami = deviceID;
        self._merge(self, entry);
      }
    }

    self.readyP = true;
    if (!self.user) self.user = { role: 'monitor' };
    self.emit('ready', 'management', self.user);
  });
};

ClientAPI.prototype._merge = function(self, entry) {
  var actor, whoami;

  whoami = entry.whoami;
  actor = self.actors[whoami];

  self.actors[whoami] = entry;
  if ((self.readyP) && ((!actor) || (!underscore.isEqual(entry, actor)))) self.emit('actor', whoami, entry.whatami);
};


ClientAPI.prototype.login = function(clientID, loginCode, callback) {
  var json;

  var self = this;

  if (!self.console) throw new Error('console channel not open');
  if (!self.manage)  throw new Error('management channel not open');

  json = { path      : '/api/v1/user/authenticate/' + clientID
         , response  : loginCode
         , requestID : clientID
         };

  self.console.send(JSON.stringify(json));

  return self._send(json, function(message) {
    if (!!message.error) return callback(new Error(message.error.diagnostic), message.error);

    self.user = message.result;
    callback(null, null);
    self._list(self);
  }, true);
};

ClientAPI.prototype._send = function(json, callback, onceP) {
  var self = this;

  if (!self.manage) throw new Error('management channel not open');

  json.requestID = self.addCallback(callback, onceP ? 1 : 2);
  self.logger.debug('management', json);
  self.manage.send(JSON.stringify(json));

  return self;
};


ClientAPI.prototype.createActivity = function(name, uuid, event, task, armed, comments, cb) {
  if ((!name)  || (name.length === 0))  throw new Error('name must be non-empty');
  if ((!uuid)  || (uuid.length === 0))  throw new Error('uuid must be non-empty');
  if ((!event) || (event.length === 0)) throw new Error('event must be non-empty');
  if ((!task)  || (task.length === 0))  throw new Error('task must be non-empty');

  return this._send({ path      : '/api/v1/activity/create/' + name
                    , name      : name
                    , uuid      : uuid
                    , event     : event
                    , task      : task
                    , armed     : armed
                    , comments  : comments
                    }, cb);
};

ClientAPI.prototype.createDevice = function(name, uuid, whatami, info, comments, cb) {
  if ((!name)    || (name.length === 0))    throw new Error('name must be non-empty');
  if ((!uuid)    || (uuid.length === 0))    throw new Error('uuid must be non-empty');
  if ((!whatami) || (whatami.length === 0)) throw new Error('whatami must be non-empty');

  return this._send({ path      : '/api/v1/device/create/' + name
                    , name      : name
                    , uuid      : uuid
                    , whatami   : whatami
                    , info      : info || {}
                    , comments  : comments
                    }, cb);
};

ClientAPI.prototype.createEvent = function(name, uuid, actor, observe, parameter, comments, cb) {
  if ((!name)    || (name.length === 0))    throw new Error('name must be non-empty');
  if ((!uuid)    || (uuid.length === 0))    throw new Error('uuid must be non-empty');
  if ((!actor)   || (actor.length === 0))   throw new Error('actor must be non-empty');
  if ((!observe) || (observe.length === 0)) throw new Error('observe must be non-empty');

  return this._send({ path      : '/api/v1/event/create/' + name
                    , name      : name
                    , uuid      : uuid
                    , actor     : actor
                    , observe   : observe
                    , parameter : JSON.stringify(parameter || {})
                    , comments  : comments
                    }, cb);
};

ClientAPI.prototype.createGroup = function(name, uuid, type, operator, members, comments, cb) {
  if ((!name)    || (name.length === 0))    throw new Error('name must be non-empty');
  if ((!uuid)    || (uuid.length === 0))    throw new Error('uuid must be non-empty');

  return this._send({ path      : '/api/v1/group/create/' + name
                    , name      : name
                    , uuid      : uuid
                    , type      : type     || ''
                    , operator  : operator || ''
                    , members   : members  || []
                    , comments  : comments
                    }, cb);
};

ClientAPI.prototype.createTask = function(name, uuid, actor, perform, parameter, comments, cb) {
  if ((!name)    || (name.length === 0))    throw new Error('name must be non-empty');
  if ((!uuid)    || (uuid.length === 0))    throw new Error('uuid must be non-empty');
  if ((!actor)   || (actor.length === 0))   throw new Error('actor must be non-empty');
  if ((!perform) || (perform.length === 0)) throw new Error('perform must be non-empty');

  return this._send({ path      : '/api/v1/task/create/' + name
                    , name      : name
                    , actor     : actor
                    , perform   : perform
                    , parameter : JSON.stringify(parameter || {})
                    , comments  : comments
                    }, cb);
};

ClientAPI.prototype.createUser = function(name, uuid, role, clientName, comments, cb) {
  if ((!name) || (name.length === 0)) throw new Error('name must be non-empty');
  if ((!uuid) || (uuid.length === 0)) throw new Error('uuid must be non-empty');

  return this._send({ path       : '/api/v1/user/create/' + name
                    , name       : name
                    , uuid       : uuid
                    , comments   : comments
                    , role       : role || ' monitor'
                    , clientName : clientName
                    }, cb);
};


ClientAPI.prototype.listActivity = function(activityID, options, cb) {
  if (!activityID) activityID = ''; else if (parseInt(activityID, 10) <= 0) throw new Error('eventID must be positive integer');

  return this._send({ path      : '/api/v1/activity/list/' + activityID
                    , options   : options || {}
                    }, cb, true);
};

ClientAPI.prototype.listActors = function(prefix, options, cb) {
  if (!prefix) prefix = '';

  return this._send({ path      : '/api/v1/actor/list/' + prefix
                    , options   : options || {}
                    }, cb, true);
};

ClientAPI.prototype.listDevice = function(deviceID, options, cb) {
  if (!deviceID) deviceID = ''; else if (parseInt(deviceID, 10) <= 0) throw new Error('eventID must be positive integer');

  return this._send({ path      : '/api/v1/device/list/' + deviceID
                    , options   : options || {}
                    }, cb, true);
};

ClientAPI.prototype.listEvent = function(eventID, options, cb) {
  if (!eventID) eventID = ''; else if (parseInt(eventID, 10) <= 0) throw new Error('eventID must be positive integer');

  return this._send({ path      : '/api/v1/event/list/' + eventID
                    , options   : options || {}
                    }, cb, true);
};

ClientAPI.prototype.listGroup = function(groupID, options, cb) {
  if (!groupID) groupID = ''; else if (parseInt(groupID, 10) <= 0) throw new Error('groupID must be positive integer');

  return this._send({ path      : '/api/v1/group/list/' + groupID
                    , options   : options || {}
                    }, cb, true);
};

ClientAPI.prototype.listTask = function(taskID, options, cb) {
  if (!taskID) taskID = ''; else if (parseInt(taskID, 10) <= 0) throw new Error('taskID must be positive integer');

  return this._send({ path      : '/api/v1/task/list/' + taskID
                    , options   : options || {}
                    }, cb, true);
};

ClientAPI.prototype.listUser = function(userID, options ,cb) {
  if (!userID) userID = '';

  return this._send({ path      : '/api/v1/user/list/' + userID
                    , options   : options || {}
                    }, cb);
};


ClientAPI.prototype.modifyActivity = function(activityID, name, armed, event, task, cb) {
  if (parseInt(activityID, 10) <= 0) throw new Error('groupID activityID be positive integer');

  return this._send({ path      : '/api/v1/activity/modify/' + activityID
                    , name      : name
                    , armed     : armed
                    , event     : event
                    , task      : task
                    }, cb);
};

ClientAPI.prototype.modifyGroup = function(groupID, name, type, operator, members, cb) {
  if (parseInt(groupID, 10) <= 0) throw new Error('groupID must be positive integer');

  return this._send({ path      : '/api/v1/group/modify/' + groupID
                    , name      : name
                    , type      : type     || ''
                    , operator  : operator || ''
                    , members   : members  || []
                    }, cb);
};


ClientAPI.prototype.performActivity = function(activityID, cb) {
  if (parseInt(activityID, 10) <= 0) throw new Error('activityID must be positive integer');

  return this._send({ path      : '/api/v1/activity/perform/' + activityID
                    }, cb, true);
};

ClientAPI.prototype.performActors = function(prefix, perform, parameter, cb) {
  if (!prefix) prefix = '';

  return this._send({ path      : '/api/v1/actor/perform/' + prefix
                    , perform   : perform
                    , parameter : JSON.stringify(parameter || {})
                    }, cb, true);
};

ClientAPI.prototype.performDevice = function(deviceID, perform, parameter, cb) {
  if (parseInt(deviceID, 10) <= 0) throw new Error('deviceID must be positive integer');

  return this._send({ path      : '/api/v1/device/perform/' + deviceID
                    , perform   : perform
                    , parameter : JSON.stringify(parameter || {})
                    }, cb, true);
};

ClientAPI.prototype.performGroup = function(groupID, perform, parameter, cb) {
  if (parseInt(groupID, 10) <= 0) throw new Error('groupID must be positive integer');

  return this._send({ path      : '/api/v1/group/perform/' + groupID
                    , perform   : perform
                    , parameter : JSON.stringify(parameter || {})
                    }, cb, true);
};

ClientAPI.prototype.performTask = function(taskID, cb) {
  if (parseInt(taskID, 10) <= 0) throw new Error('taskID must be positive integer');

  return this._send({ path      : '/api/v1/task/perform/' + taskID
                    }, cb, true);
};


ClientAPI.prototype.deleteActivity = function(activityID, cb) {
  if (parseInt(activityID, 10) <= 0) throw new Error('activityID must be positive integer');

  return this._send({ path      : '/api/v1/activity/delete/' + activityID
                    }, cb);
};

/* not yet!
ClientAPI.prototype.deleteDevice = function(deviceID, cb) {
  if (parseInt(deviceID, 10) <= 0) throw new Error('deviceID must be positive integer');

  return this._send({ path      : '/api/v1/device/delete/' + deviceID
                    }, cb);
};
 */

ClientAPI.prototype.deleteEvent = function(eventID, cb) {
  if (parseInt(eventID, 10) <= 0) throw new Error('eventID must be positive integer');

  return this._send({ path      : '/api/v1/event/delete/' + eventID
                    }, cb);
};

ClientAPI.prototype.deleteGroup = function(groupID, cb) {
  if (parseInt(groupID, 10) <= 0) throw new Error('groupID must be positive integer');

  return this._send({ path      : '/api/v1/group/delete/' + groupID
                    }, cb);
};

ClientAPI.prototype.deleteTask = function(taskID, cb) {
  if (parseInt(taskID, 10) <= 0) throw new Error('taskID must be positive integer');

  return this._send({ path      : '/api/v1/task/delete/' + taskID
                    }, cb);
};


exports.ClientAPI = ClientAPI;
