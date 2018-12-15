let hypercore = require('hypercore')
let multifeed = require('multifeed')

let discovery = require('discovery-swarm')
let pump = require('pump')

let nodeID = process.argv[2]

let multi = multifeed(hypercore, `./multi-chat-${nodeID}`, { valueEncoding: 'json' })

multi.ready(function() {

  multi.writer('local', function (err, feed) {
    if (err) throw err

    // You can do something with an individual feed here.
    process.stdin.on('data', function (data) {
      feed.append({
        type: 'chat-message',
        nickname: nodeID,
        text: data.toString().trim(),
        timestamp: new Date().toISOString()
      })
    })
  })

  let swarm = discovery()
  swarm.join('multi-chat-chitty-chitty-bang-bang')
  swarm.on('connection', function(connection, info) {
    console.log(`[PEER] Connected: ${info.host}:${info.port}`)
    pump(connection, multi.replicate({live: true}), connection)
  })

  swarm.on('redundant-connection', function(connection, info) {
    console.log(`[PEER] Redundant: ${info.host}:${info.port}`)
  })

  swarm.on('connection-closed', function (connection, info) {
    console.log(`[PEER] Dropped: ${info.host}:${info.port}`)
  })
})

multi.on('feed', function(feed, name) {
  console.log(`[New feed: ${name}. Registering for updates on it…]`)

  feed.createReadStream({live: true}).on('data', function(data) {
    console.log(`${data.timestamp} ${data.nickname}: ${data.text}`)
  })
})
