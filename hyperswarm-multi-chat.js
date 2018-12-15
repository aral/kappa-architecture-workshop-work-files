// Chat with multifeed. One possible solution to exercises 8 and 9
// in the Kappa Architecture Workshop by @noffle et al.
// https://kappa-db.github.io/workshop/build/01.html

// Note: this does not build a chronological view over messages.
// The timestamps will not be in order. At startup, your local messages
// will be shown first, followed by the messages from any found peers.
// Similarly, if any peers go offline and return, their messages
// will be displayed out of order.

const hypercore = require('hypercore')
const multifeed = require('multifeed')
const network = require('@hyperswarm/network')
const crypto = require('crypto')
const pump = require('pump')

// Use the first parameter passed to the command-line app
// as the unique topic ID and the second as the unique ID
// for this node/peer.
if (process.argv.length != 4) {
  throw new Error('Syntax: node multi-chat "{topic to join}" "{your handle}"')
}

// Note: unlike discovery-swarm, in hyperswarm network, the topic _must_
// be a 32-byte buffer. (Normally, in DAT, this will be your discovery key.
// Here, it is a hash of the topic you pass in via the command-line. Note: this
// may clash with existing test topics that others have created, in which case
// the behaviour will be unpredictable as we’re not doing any error checking on
// the data structure. This is not an issue in DAT proper.)
const slug = (s) => s.trim().toLocaleLowerCase().replace(' ', '-')

const topic = crypto.createHash('sha256')
  .update(slug(process.argv[2]))
  .digest()

const node = slug(process.argv[3])

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
  log(`📜 Count: ${multi.feeds().length}`)
  pump(socket, multi.replicate({live: true}), socket)
})

// Set up multifeed.
let multi = multifeed(hypercore, `./multi-chat-${topic}-${node}`, { valueEncoding: 'json' })

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
    net.join(topic, {
      lookup: true, // find and connect to peers.
      announce: true // optional: announce self as a connection target.
    })
  })
})
