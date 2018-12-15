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
const discovery = require('discovery-swarm')
const pump = require('pump')

// Use the first parameter passed to the command-line app
// as the unique topic ID and the second as the unique ID
// for this node/peer.
if (process.argv.length != 4) {
  throw new Error('Syntax: node multi-chat "{topic to join}" "{your handle}"')
}

const slug = (s) => s.trim().toLocaleLowerCase().replace(' ', '-')
const topicID = slug(process.argv[2])
const nodeID = slug(process.argv[3])

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
const swarm = discovery()
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
let multi = multifeed(hypercore, `./multi-chat-${topicID}-${nodeID}`, { valueEncoding: 'json' })

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
    swarm.join(topicID)
  })
})
