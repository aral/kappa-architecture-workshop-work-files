const network = require('@hyperswarm/network')
const kappacore = require('kappa-core')
const list = require('kappa-view-list')
const memdb = require('memdb')

const pump = require('pump')
const crypto = require('crypto')

// Use the first parameter passed to the command-line app
// as the unique topic ID and the second as the unique ID
// for this node/peer.
if (process.argv.length != 4) {
  throw new Error('Syntax: node kappa-chat "{topic to join}" "{your handle}"')
}

const slug = (s) => s.trim().toLocaleLowerCase().replace(/ /g, '-')

const unsafeTopicTitle = process.argv[2]
const safeTopicTitle = slug(unsafeTopicTitle)
const node = slug(process.argv[3])

const topicDiscoveryKey = crypto.createHash('sha256')
  .update(safeTopicTitle)
  .digest()

log (`Topic: ${unsafeTopicTitle}`)

// Views.

const timestampView = list(memdb(), (msg, next) => {
  if (msg.value.timestamp && typeof msg.value.timestamp === 'string') {
    // Sort on the timestamp field (list must expect us to emit the fields we want to sort on)
    next(null, [msg.value.timestamp])
  } else {
    next()
  }
})

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

// Set up hyperswarm network.

const net = network()

net.on('connection', function (socket, details) {

  // Note details.peer is null if details.client === false
  let locality = 'n/a'
  let host = 'n/a'
  let port = 'n/a'
  if (details.client) {
    locality = details.peer.local ? 'LAN' : 'WAN'
    host = details.peer.host
    port = details.peer.port
  }
  const clientType = details.client ? 'we initiated' : 'they initiated'

  log(`📡 Connected: (${details.type}) ${host}:${port} (${locality}, ${clientType} connection)`)
  log(`📜 Count: ${core.feeds().length}`)
  pump(socket, core.replicate({live: true}), socket)
})

// Set up kappa-core.
const databasePath = `./multi-chat-${safeTopicTitle}-${node}`
const core = kappacore(databasePath, { valueEncoding: 'json' })

core.use('chats', timestampView)

// Note: the data value is in the 'value' property.
core.api.chats.read().on('data', (data) => {
  log(`💫 ${data.value.nickname}: ${data.value.text}`, new Date(data.value.timestamp))
})

// core.on('feed', function(feed, name) {
//   log(`📜 New: ${name}. Registering for updates on it.`)

//   feed.createReadStream({live: true}).on('data', function (data) {
//     log(`💬 ${data.nickname}: ${data.text}`, new Date(data.timestamp))
//   })
// })

// Note: unlike multifeed, kappa-core takes the name of a view (or views)
// ===== in its ready function. The function will fire when the view (or views)
//       has caught up.
core.ready('chats', function() {

  log("Chats view is ready.")

  // For any newly-received messages, show them as they arrive.
  // Note: Here, data is returned as an array of objects.
  core.api.chats.tail(1, (data) => {
    log(`💬 ${data[0].value.nickname}: ${data[0].value.text}`, new Date(data[0].value.timestamp))
  })

  core.feed('local', function (err, feed) {
    if (err) throw err

    log('Local feed is ready.')

    // You can do something with an individual feed here.
    process.stdin.on('data', function (data) {
      feed.append({
        type: 'chat-message',
        nickname: node,
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
    net.join(topicDiscoveryKey, {
      lookup: true, // find and connect to peers.
      announce: true // optional: announce self as a connection target.
    })
  })
})