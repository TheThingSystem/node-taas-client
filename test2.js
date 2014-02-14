var ClientAPI = require('./taas-client')
  ;

new ClientAPI.ClientAPI().on('open', function(channel, loginP) {
  if (loginP) throw new Error('script should be run locally');
}).on('ready', function(channel, data) {
  if (channel === 'management') return getToWork();

  if (data.indexOf('') === -1) throw new Error('script requires write access');
}).on('close', function(channel) {
  console.log(channel + ' close');
  process.exit(0);
}).on('error', function(err, channel) {
  console.log(channel + ' error: ' + err.message);
  process.exit(0);
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

var getToWork = function() {
    



};
