let hypercore = require('hypercore')
let multifeed = require('multifeed')

let discovery = require('discovery-swarm')
let pump = require('pump')

// Use the first parameter passed to the command-line app
// as the unique ID for this node/peer.
let nodeID = process.argv[2]

// Helpers.

// Returns a formatted time stamp from the passed date (or the current date)
function formattedDate (date = new Date()) {
  return `${date.toLocaleDateString('en-UK')} ${date.toLocaleTimeString('en-UK')}`
}

// Log to console with a timestamp prefix.
function log (msg, date = new Date()) {
  console.log(`${formattedDate(date)}: ${msg}`)
}

// Main.

// Set up discovery swarm.
let swarm = discovery()
swarm.on('connection', function (connection, info) {
  log(`📡 Connected: ${info.host}:${info.port}`)
  log(`📜 Count: ${multi.feeds().length}`)
  pump(connection, multi.replicate({live: true}), connection)
})

swarm.on('redundant-connection', function (connection, info) {
  log(`📡 Redundant: ${info.host}:${info.port}`)
})

swarm.on('connection-closed', function (connection, info) {
  log(`📡 Dropped: ${info.host}:${info.port}`)
})

// Set up multifeed.
let multi = multifeed(hypercore, `./multi-chat-${nodeID}`, { valueEncoding: 'json' })

multi.on('feed', function(feed, name) {
  log(`📜 New: ${name}. Registering for updates on it.`)

  feed.createReadStream({live: true}).on('data', function (data) {
    log(`💬 ${data.nickname}: ${data.text}`, new Date(data.timestamp))
  })
})

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

    // Note: it’s important to join the swarm only once
    // the local writer has been created so that when we
    // get the 'connection' event on the swarm, our local
    // feed is included in the list of feeds that multifeed
    // replicates. Otherwise, on first run, the symptom is
    // that the feeds do not appear to replicate but work
    // on subsequent runs.
    swarm.join('multi-chat-chitty-chitty-bang-bang')
  })
})

