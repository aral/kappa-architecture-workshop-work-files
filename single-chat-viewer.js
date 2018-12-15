var discovery = require('discovery-swarm')
var hypercore = require('hypercore')
var pump = require('pump')

var feed = hypercore('./single-chat-feed-clone', 'a1af8c71af90cdf37b0513492a64c9936bf73c7370515d708523fb12e2f369e2', {valueEncoding: 'json'})

feed
  .createReadStream({ live: true })
  .on('data', function (data) {
    console.log(`${data.timestamp} ${data.nickname}: ${data.text}`)
  })

var swarm = discovery()

feed.ready(function() {
  console.log('Joining swarm for ', feed.discoveryKey.toString('hex'))
  swarm.join(feed.discoveryKey)
  swarm.on('connection', function (connection) {
    console.log('(New peer connected!)')

    // Pump module does stream error handling, unlike
    // stream.pipe(otherStream), which does not.

    pump(connection, feed.replicate({live: true}), connection)
  })
})
