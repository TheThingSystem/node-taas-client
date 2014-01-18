// TAAS client API

var events      = require('events')
  , fs          = require('fs')
  , mdns        = require('mdns')
  , os          = require('os')
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

  if (self.params.url) return self.open(self);

  if (!options.steward) throw new Error('options.steward must be specified');

  setTimeout(function() {
    var didP, entry, host;

    if ((options.steward.name === '127.0.0.1') || (options.steward.name === 'localhost')) {
      self.params.url = 'ws://' + options.steward.name + ':8887';
      return self.open(self);
    }

    if ((!!options.steward.name) && (options.steward.name.length === 0)) delete(options.steward.name);

    didP = false;
    for (host in singleton.hosts) if (singleton.hosts.hasOwnProperty(host)) {
      didP = true;
      entry = singleton.hosts[host];
      if ((!!options.steward.name) && (entry.host !== (options.steward.name + '.' + entry.replyDomain))) continue;
      if ((!!options.steward.uuid) && (entry.txtRecord.uuid !== options.steward.uuid)) continue;

      if ((entry.localhost) && (!options.steward.crtData) && (!options.steward.crtPath)) {
        self.params.url = 'ws://' + entry.host + ':8887';
        return self.open(self);
      }

      self.params.url = 'wss://' + entry.host + ':' + entry.port;
      if (util.isArray(options.steward.crtData)) options.steward.crtData = new Buffer(options.steward.crtData);
      self.params.ca = options.steward.crtData || fs.readFileSync(options.steward.crtPath);
      return self.open(self);
    }

    if ((!options.cloud) || (!options.steward.name)) {
      return self.emit('error', new Error(didP ? 'no matching stewards' : 'no visible stewards'));
    }

    self.params.url = 'wss://' + options.steward.name + '.' + options.cloud.service + ':443';
    if (util.isArray(options.cloud.crtData)) options.cloud.crtData = new Buffer(options.cloud.crtData);
    self.params.ca = options.cloud.crtData || fs.readFileSync(options.cloud.crtPath);
    self.open(self);
  }, 250);

  return self;
};
util.inherits(ClientAPI, events.EventEmitter);


ClientAPI.prototype.open = function(self) {
console.log('>>> url='+self.params.url);
  self.ws = new ws(self.params.url + '/manage', self.params).on('open', function() {
    self.emit('open');
  }).on('message', function(data, flags) {
console.log('>>> message');
  }).on('close', function() {
console.log('>>> close');
  }).on('error', function(err) {
    self.emit('error', err);
  });
  
  return self;
};

ClientAPI.prototype.login = function(steward, clientID, callback) {
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


ClientAPI.prototype.roundtrip = function(method, path, json, callback) {
  var self = this;

  if ((!callback) && (typeof json === 'function')) {
    callback = json;
    json = null;
  }

  return self.invoke(method, path, json, function(err, code, results) {
    callback(err, results);
  });
};

ClientAPI.prototype.invoke = function(method, path, json, callback) {
  var self = this;

  return self;
};


exports.ClientAPI = ClientAPI;
