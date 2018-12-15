let hypercore = require('hypercore')
let discovery = require('discovery-swarm')
let pump = require('pump')

let feed = hypercore('./single-chat-feed', { valueEncoding: 'json' })

let swarm = discovery()

feed.ready(function() {
  console.log('Joining swarm for ', feed.discoveryKey.toString('hex'))
  swarm.join(feed.discoveryKey)
})

swarm.on('connection', function(connection) {
  console.log('(New peer connected!)')
  pump(connection, feed.replicate({live: true}), connection)
})

process.stdin.on('data', function (data) {
  feed.append({
    type: 'chat-message',
    nickname: 'aral',
    text: data.toString().trim(),
    timestamp: new Date().toISOString()
  })
})

feed.createReadStream({live: true}).on('data', function(data) {
  console.log(`${data.timestamp} ${data.nickname}: ${data.text}`)
})
