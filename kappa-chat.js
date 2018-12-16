const network = require('@hyperswarm/network')
const kappacore = require('kappa-core')
const list = require('kappa-view-list')
const memdb = require('memdb')

const pump = require('pump')
const crypto = require('crypto')

// Very basic command-line argument validation: Use the first
// string parameter passed to the command-line app as topic
// and the second as the unique name of the participant.
if (process.argv.length != 4) {
  throw new Error('Syntax: node kappa-chat "{topic to join}" "{your handle}"')
}

// Helpers.
// ========

// Returns a formatted time stamp from the passed date (or the current date)
const formattedDate = (date = new Date()) => `${date.toLocaleDateString('en-UK')} ${date.toLocaleTimeString('en-UK')}`

// Log to console with a timestamp prefix.
const log = (msg, date = new Date()) => console.log(`${formattedDate(date)}: ${msg}`)

// “Sluggifies” the passed string: removes spaces and replaces inter-word spaces with dashes.
const slug = (s) => s.trim().toLocaleLowerCase().replace(/ /g, '-')

// Constants.
// ==========

const topic = process.argv[2]
const topicSlug = slug(topic)
const node = slug(process.argv[3])

// The discovery key is a 32-byte hash based on the topic slug.
const topicDiscoveryKey = crypto.createHash('sha256').update(topicSlug).digest()

// Views.
// ======

// A list of messages, lexographically ordered by timestamp.
const timestampView = list(memdb(), (msg, next) => {
  if (msg.value.timestamp && typeof msg.value.timestamp === 'string') {
    // Ask to sort on the timestamp field.
    next(null, [msg.value.timestamp])
  } else {
    next()
  }
})

// Discovery and replication.
// ==========================

// Set up hyperswarm network.
const net = network()

net.on('connection', (socket, details) => {

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

  // Start replicating the core with the newly-discovered socket.
  pump(socket, core.replicate({live: true}), socket)
})

// Kappa Core.
// ===========

// Set up kappa-core.
const databasePath = `./multi-chat-${topicSlug}-${node}`
const core = kappacore(databasePath, { valueEncoding: 'json' })

core.use('chats', timestampView)

// Note: the data value is in the 'value' property.
core.api.chats.read().on('data', (data) => {
  log(`💫 ${data.value.nickname}: ${data.value.text}`, new Date(data.value.timestamp))
})

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

  core.feed('local', (err, feed) => {
    if (err) throw err

    log('Local feed is ready.')

    // You can do something with an individual feed here.
    process.stdin.on('data', (data) => {
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
