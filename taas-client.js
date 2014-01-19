// a node.js module to interface with the Things-as-a-service, client-side
//   cf., http://thethingsystem.com/dev/Home.html

var events      = require('events')
  , fs          = require('fs')
  , https       = require('https')
  , mdns        = require('mdns')
  , os          = require('os')
  , url         = require('url')
  , util        = require('util')
  , ws          = require('ws')
  ;


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
  try {
    self.mdns = mdns.createBrowser(mdns.tcp('wss')).on('serviceUp', function(service) {
      for (i = 0; i < service.addresses.length; i++) {
        if (self.ifaddrs.indexOf(service.addresses[i]) !== -1) {
          service.localhost = true;
          break;
        }
      }

      self.hosts[service.host] = service;
    }).on('serviceDown', function(service) {
      delete(self.hosts[service.host]);
    }).on('serviceChanged', function(service) {
      self.hosts[service.host] = service;
    }).on('error', function(err) {
      self.logger.error('_wss._tcp', { event: 'mdns', diagnostic: err.message });
    });
    self.mdns.start();
  } catch(ex) {
    self.logger.error('_wss._tcp', { event: 'browse', diagnostic: ex.message });
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

  if (self.params.url) return self.console(self);

  if (!options.steward) throw new Error('options.steward must be specified');

  setTimeout(function() {
    var didP, entry, host;

    if ((options.steward.name === '127.0.0.1') || (options.steward.name === 'localhost')) {
      self.params.url = 'ws://' + options.steward.name + ':8887';
      return self.console(self);
    }

    if ((!!options.steward.name) && (options.steward.name.length === 0)) delete(options.steward.name);

    didP = false;
singleton.hosts = {};
    for (host in singleton.hosts) if (singleton.hosts.hasOwnProperty(host)) {
      didP = true;
      entry = singleton.hosts[host];

      if (   ((!!options.steward.name)
                  && (entry.host !== (options.steward.name + '.' + entry.replyDomain))
                  && (entry.txtRecord.name !== options.steward.name))
          || ((!!options.steward.uuid) && (entry.txtRecord.uuid !== options.steward.uuid))) continue;

      if ((entry.localhost) && (!options.steward.crtData) && (!options.steward.crtPath)) {
        self.params.url = 'ws://' + entry.host + ':8887';
        return self.console(self);
      }

      self.params.url = 'wss://' + entry.host + ':' + entry.port;
      if (util.isArray(options.steward.crtData)) options.steward.crtData = new Buffer(options.steward.crtData);
      self.params.ca = options.steward.crtData || fs.readFileSync(options.steward.crtPath);
      if (!!self.params.ca) self.params.ca = [ self.params.ca ];
      self.params.rejectUnauthorized = false;
      return self.console(self);
    }

    if ((!options.cloud) || (!options.steward.name)) {
      return self.emit('error', new Error(didP ? 'no matching stewards' : 'no visible stewards'));
    }

    self.params.url = 'wss://' + options.steward.name + '.' + options.cloud.service + ':443';
    if (util.isArray(options.cloud.crtData)) options.cloud.crtData = new Buffer(options.cloud.crtData);
    self.params.ca = options.cloud.crtData || fs.readFileSync(options.cloud.crtPath);
    if (!!self.params.ca) self.params.ca = [ self.params.ca ];
// TBD: WHY?
    self.params.rejectUnauthorized = false;
    self.cloud(self);
  }, 250);

  return self;
};
util.inherits(ClientAPI, events.EventEmitter);

ClientAPI.prototype.cloud = function(self) {
  var didP, options, u;

  var retry = function(secs) {
    if (didP) return;
    didP = true;

    setTimeout(function() { self.cloud(self); }, secs * 1000);
  };

  u = url.parse(self.params.url);
  options = { host    : u.hostname
            , port    : u.port
            , method  : 'GET'
            , path    : ''
            , agent   : false
            , ca      : self.params.ca
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

      self.params.origin = u.hostname + ':' + u.port;
      self.params.url = u.protocol + '//' + r.hostname + ':' + r.port;
console.log(self.params.url);
      self.console(self);
    }).on('close', function() {
      self.logger.warning('register', { event:'close', diagnostic: 'premature eof', retry: '1 second' });
      retry(1);
    });
  }).on('error', function(err) {
    self.logger.error('register', { event: 'error', diagnostic: err.message, retry: '10 seconds' });
    retry(10);
  }).end();
};


ClientAPI.prototype.console = function(self) {
  self.console = new ws(self.params.url + '/console', self.params).on('open', function() {
    self.emit('open');

    self.actors = {};
    self.manage(self);
  }).on('message', function(data, flags) {
    var category, entry, i, logs, message;

    if ((!!flags) && (flags.binary === true)) return self.emit(new Error('error binary console message'));

    try { message = JSON.parse(data.toString()); } catch(ex) { return self.emit(new Error('error parsing console message')); }
console.log('.');

    for (category in message) if (message.hasOwnProperty(category)) {
      logs = message[category];

      if (!util.isArray(logs)) {
        if ((category === 'notice') && (util.isArray(logs.permissions))) {
          self.permissions = logs.permissions;
          continue;
        }
        logs = [ logs ];
      }
      if (category !== '.updates') continue;

      for (i = 0; i< logs.length; i++) {
        entry = logs[i];
        self.actors[entry.whoami] = entry;
      }
    }
  }).on('close', function() {
    self.emit('close');
  }).on('error', function(err) {
    self.emit('error', err);
  });
  
  return self;
};

ClientAPI.prototype.manage = function(self) {
  self.manage = new ws(self.params.url + '/manage', self.params).on('open', function() {
    self.emit('open');

    self.reqno = 1;
    self.callbacks = {};

    self.addCallback = function(cb) {
      self.callbacks[self.reqno.toString()] = cb;
      return self.reqno++;
    };

self.listActors('', { depth: 'all' }, function(message) { console.log(util.inspect(message, { depth: null })); });
  }).on('message', function(data, flags) {
    var message, requestID;

    if ((!!flags) && (flags.binary === true)) return self.emit(new Error('error binary console message'));

    try { message = JSON.parse(data.toString()); } catch(ex) { return self.emit(new Error('error parsing console message')); }

    requestID = message.requestID.toString();
    if ((!!self.callbacks[requestID]) && ((self.callbacks[requestID])(message))) delete(self.callbacks[requestID]);
  }).on('close', function() {
    self.emit('close');
  }).on('error', function(err) {
    self.emit('error', err);
  });
  
  return self;
};


ClientAPI.prototype.login = function(clientID, callback) {/* jshint unused: false */
  var self = this;

/*
{
  "requestID": "7",
  "result": {
    "uuid": "mrose",
    "name": "mrose",
    "comments": "Marshall Rose",
    "role": "master",
    "lastLogin": "2014-01-18T11:03:06.842Z",
    "client": {
      "uuid": "8",
      "name": "MTR's iPhone 5s",
      "comments": "",
      "lastLogin": "2014-01-18T11:03:06.842Z",
      "clientID": "mrose\/7"
    }
  }
}
*/

  return self;
};


ClientAPI.prototype.createActivity = function(name, armed, event, task, cb) {
  return this.send({ path      : '/api/v1/activity/create/' + name
                   , name      : name
                   , armed     : armed
                   , event     : event
                   , task      : task
                   }, cb);
};

ClientAPI.prototype.createDevice = function(name, whatami, info, cb) {
  return this.send({ path      : '/api/v1/device/create/' + name
                   , name      : name
                   , whatami   : whatami
                   , info      : info || {}
                   }, cb);
};

ClientAPI.prototype.createEvent = function(name, actor, observe, parameter, cb) {
  return this.send({ path      : '/api/v1/event/create/' + name
                   , name      : name
                   , actor     : actor
                   , observe   : observe
                   , parameter : JSON.stringify(parameter) || ''
                   }, cb);
};

ClientAPI.prototype.createGroup = function(name, type, operator, members, cb) {
  return this.send({ path      : '/api/v1/group/create/' + name
                   , name      : name
                   , type      : type     || ''
                   , operator  : operator || ''
                   , members   : members  || []
                   }, cb);
};

ClientAPI.prototype.createTask = function(name, actor, perform, parameter, cb) {
  return this.send({ path      : '/api/v1/task/create/' + name
                   , name      : name
                   , actor     : actor
                   , perform   : perform
                   , parameter : JSON.stringify(parameter) || ''
                   }, cb);
};

ClientAPI.prototype.listActivity = function(activityID, options, cb) {
  if ((activityID !== '') && (parseInt(activityID, 10) <= 0)) throw new Error('activityID must be positive integer');

  return this.send({ path      : '/api/v1/activity/list/' + activityID
                   , options   : options || {}
                   }, cb);
};

ClientAPI.prototype.listActors = function(prefix, options, cb) {
  return this.send({ path      : '/api/v1/actor/list/' + prefix
                   , options   : options || {}
                   }, cb);
};

ClientAPI.prototype.listDevice = function(deviceID, options, cb) {
  if ((deviceID !== '') && (parseInt(deviceID, 10) <= 0)) throw new Error('deviceID must be positive integer');

  return this.send({ path      : '/api/v1/device/list/' + deviceID
                   , options   : options || {}
                   }, cb);
};

ClientAPI.prototype.listEvent = function(eventID, options, cb) {
  if ((eventID !== '') && (parseInt(eventID, 10) <= 0)) throw new Error('eventID must be positive integer');

  return this.send({ path      : '/api/v1/event/list/' + eventID
                   , options   : options || {}
                   }, cb);
};

ClientAPI.prototype.listGroup = function(groupID, options, cb) {
  if ((groupID !== '') && (parseInt(groupID, 10) <= 0)) throw new Error('groupID must be positive integer');

  return this.send({ path      : '/api/v1/group/list/' + groupID
                   , options   : options || {}
                   }, cb);
};

ClientAPI.prototype.listTask = function(taskID, options, cb) {
  if ((taskID !== '') && (parseInt(taskID, 10) <= 0)) throw new Error('taskID must be positive integer');

  return this.send({ path      : '/api/v1/task/list/' + taskID
                   , options   : options || {}
                   }, cb);
};

ClientAPI.prototype.modifyActivity = function(activityID, name, armed, event, task, cb) {
  return this.send({ path      : '/api/v1/activity/modify/' + activityID
                   , name      : name
                   , armed     : armed
                   , event     : event
                   , task      : task
                   }, cb);
};

ClientAPI.prototype.modifyGroup = function(groupID, name, type, operator, members, cb) {
  return this.send({ path      : '/api/v1/group/modify/' + groupID
                   , name      : name
                   , type      : type     || ''
                   , operator  : operator || ''
                   , members   : members  || []
                   }, cb);
};

ClientAPI.prototype.performActivity = function(activityID, cb) {
  if (parseInt(activityID, 10) <= 0) throw new Error('activityID must be positive integer');

  return this.send({ path      : '/api/v1/activity/perform/' + activityID
                   }, cb);
};

ClientAPI.prototype.perform_actors = function(prefix, perform, parameter, cb) {
  return this.send({ path      : '/api/v1/actor/perform/' + prefix
                   , perform   : perform
                   , parameter : JSON.stringify(parameter) || ''
                   }, cb);
};

ClientAPI.prototype.performDevice = function(deviceID, perform, parameter, cb) {
  if (parseInt(deviceID, 10) <= 0) throw new Error('deviceID must be positive integer');

  return this.send({ path      : '/api/v1/device/perform/' + deviceID
                   , perform   : perform
                   , parameter : JSON.stringify(parameter) || ''
                   }, cb);
};

ClientAPI.prototype.performGroup = function(groupID, perform, parameter, cb) {
  if (parseInt(groupID, 10) <= 0) throw new Error('groupID must be positive integer');

  return this.send({ path      : '/api/v1/group/perform/' + groupID
                   , perform   : perform
                   , parameter : JSON.stringify(parameter) || ''
                   }, cb);
};

ClientAPI.prototype.performTask = function(taskID, cb) {
  if (parseInt(taskID, 10) <= 0) throw new Error('taskID must be positive integer');

  return this.send({ path      : '/api/v1/task/perform/' + taskID
                   }, cb);
};

ClientAPI.prototype.delete_activity = function(activityID, cb) {
  if (parseInt(activityID, 10) <= 0) throw new Error('activityID must be positive integer');

  return this.send({ path      : '/api/v1/activity/delete/' + activityID
                   }, cb);
};

ClientAPI.prototype.delete_device = function(deviceID, cb) {
  if (parseInt(deviceID, 10) <= 0) throw new Error('deviceID must be positive integer');

  return this.send({ path      : '/api/v1/device/delete/' + deviceID
                   }, cb);
};

ClientAPI.prototype.delete_event = function(eventID, cb) {
  if (parseInt(eventID, 10) <= 0) throw new Error('eventID must be positive integer');

  return this.send({ path      : '/api/v1/event/delete/' + eventID
                   }, cb);
};

ClientAPI.prototype.delete_group = function(groupID, cb) {
  if (parseInt(groupID, 10) <= 0) throw new Error('groupID must be positive integer');

  return this.send({ path      : '/api/v1/group/delete/' + groupID
                   }, cb);
};

ClientAPI.prototype.delete_task = function(taskID, cb) {
  if (parseInt(taskID, 10) <= 0) throw new Error('taskID must be positive integer');

  return this.send({ path      : '/api/v1/task/delete/' + taskID
                   }, cb);
};


ClientAPI.prototype.send = function(json, callback) {
  var self = this;

  if (!self.manage) throw new Error('management port not open');

  json.requestID = self.addCallback(callback);
  self.manage.send(JSON.stringify(json));
  return self;
};


exports.ClientAPI = ClientAPI;
