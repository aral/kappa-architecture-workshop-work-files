// One possible solution to Exercise 13.
// A hack of kappa-chat.js and ui.js.

const network = require('@hyperswarm/network')
const kappacore = require('kappa-core')
const list = require('kappa-view-list')
const kv = require('kappa-view-kv')
const memdb = require('memdb')

const pump = require('pump')
const crypto = require('crypto')

const neatLog = require('neat-log')
const blit = require('txt-blit')

// Very basic command-line argument validation: Use the first
// string parameter passed to the command-line app as topic
// and the second as the unique name of the participant.
if (process.argv.length != 4) {
  throw new Error('Syntax: node --no-warnings kappa-chat-interface "{topic to join}" "{your handle}"')
}

// Helpers.
// ========

// Returns a formatted time stamp from the passed date (or the current date)
const formattedDate = (date = new Date()) => {
  if (typeof date.toLocaleDateString === 'function') {
    return `${date.toLocaleDateString('en-UK')} ${date.toLocaleTimeString('en-UK')}`
  }
}

// Format and return a chat message
const formattedMessage = (date = new Date(), nickname, message) => `${formattedDate(date)} ${nickname}: ${message}`

// Log to console with a timestamp prefix.
const log = (date = new Date(), nickname, message) => console.log(formattedMessage(date, nickname, message))

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
const timestampView = list(memdb(), (message, next) => {
  if (message.value.timestamp && typeof message.value.timestamp === 'string') {
    // Ask to sort on the timestamp field.
    next(null, [message.value.timestamp])
  } else {
    next()
  }
})

// Key-value view of player movements.
const playerView = kv(memdb(), (message, next) => {
  if (!message.value.id) next()

  const operations = []
  const messageId = `${message.key}@${message.seq/*uence*/}`

  operations.push({
    key: message.value.id,
    id: messageId,
    links: message.value.links || []
  })

  next(null, operations)
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

  // log(`📡 Connected: (${details.type}) ${host}:${port} (${locality}, ${clientType} connection)`)
  // log(`📜 Count: ${core.feeds().length}`)

  // Start replicating the core with the newly-discovered socket.
  pump(socket, core.replicate({live: true}), socket)
})

// Kappa Core.
// ===========

// Set up kappa-core.
const databasePath = `./db-${topicSlug}`
const core = kappacore(databasePath, { valueEncoding: 'json' })

core.use('chats', timestampView)
core.use('players', playerView)

// Note: the data value is in the 'value' property.
// core.api.chats.read().on('data', (data) => {
//   log(`💫 ${data.value.nickname}: ${data.value.text}`, new Date(data.value.timestamp))
// })

////////////////////////////////////////////////////////
// Interface
////////////////////////////////////////////////////////

const termWidth = process.stdout.columns
const termHeight = process.stdout.rows
const textAreaHeight = Math.min(termHeight - 3, 10)
const numberOfLines = textAreaHeight - 2

const people = {}

const drawScreen = (data) => {


  const topRow = `╔${new Array(termWidth - 2).fill('═').join('')}╗`
  const bottomRow = `╚${new Array(termWidth - 2).fill('═').join('')}╝`

  let rows = []

  // console.log(people)
  for (key in people) {
    let person = people[key]
    rows.push(`${person.nickname}: ${person.x}, ${person.y}`)
  }

  data.forEach ((datum) => {
    const value = datum.value
    let formattedRow = formattedMessage(new Date(value.timestamp), value.nickname, value.text)

    // Currently not handling rows that overflow line width.
    let horizontalPadding = ''
    if (formattedRow.length < (termWidth - 3)) {
      horizontalPadding = Array((termWidth - formattedRow.length) - 3).fill(' ').join('')
    }
    formattedRow = `║ ${formattedRow}${horizontalPadding}║`

    rows.push(formattedRow)
  })

  // If there aren’t enough rows, pad the top.
  let verticalPadding = Array((textAreaHeight - rows.length - 2)).fill(`║ ${Array(termWidth-4).fill(' ').join('')} ║`)
  rows = verticalPadding.concat(rows)

  // Add the top and bottom of the text area frame.
  rows.unshift(topRow)
  rows.push(bottomRow)

  // Add the input prompt
  rows.push('')
  rows.push(`> ${app.input.line()}`)

  return rows
}

const view = (state) => {
  var screen = []

  blit(screen, drawScreen(state.data), 0, 0)

  return screen.join('\n')
}

const app = neatLog(view, {
  fullscreen: true,

  // Input style for integrated neat-input.
  style: (start, cursor, end) => {
    return start + (cursor + "|") + end
  }
})

const viewController = (state, bus) => {

  // Initialise
  let _data = []
  state.data = _data
  bus.emit('render')

  // Update display on input.
  app.input.on('update', () => {
    state.data = _data
    bus.emit('render')
  })

  // Update display when the chat feed is updated.
  core.api.chats.tail(numberOfLines, (data) => {
    _data = data
    state.data = data
    bus.emit('render')
  })

  // Update display when player positions change.
  core.api.players.onUpdate((key, value) => {
    if (value.value.type === 'movement-message') {
      core.api.players.get(key, (error, values) => {
        if (error) throw error
        if (values.length > 1) {
          throw new Error('Panic! Player position conflicts are currently not handled.')
        }
        let value = values[0]
        if (typeof people[value.value.nickname] === 'undefined') {
          people[value.value.nickname] = {nickname: value.value.nickname}
        }
        people[value.value.nickname].x = value.value.x
        people[value.value.nickname].y = value.value.y
        // console.log(people[value.key])
        //console.log(`> Seq: ${value.seq} - x: ${value.value.x}, y: ${value.value.y}`)
        bus.emit('render')
      })
    }
  })
}

app.use(viewController)

// Note: unlike multifeed, kappa-core takes the name of a view (or views)
// ===== in its ready function. The function will fire when the view (or views)
//       has caught up.
core.ready(['chats', 'players'], function() {

  core.feed('local', (err, feed) => {
    if (err) throw err

    // log('Local feed is ready.')

    // Start processing input.
    app.input.on('enter', (line) => {
      feed.append({
        type: 'chat-message',
        nickname: node,
        text: line.trim(),
        timestamp: new Date().toISOString()
      })
    })

    const myId = node //feed.key.toString('hex')

    // Initial location
    let myX = Math.floor(termWidth/2)
    let myY = Math.floor(termHeight/2)

    people[myId] = {nickname: node, character: '@', x: myX, y: myY}

    // console.log(people[myId])

    const updatePosition = (deltaX = 0, deltaY = 0) => {

      // TODO: Bounds checking
      myX += deltaX
      myY += deltaY

      // TODO: Get the last position from the feed and
      // add that as the link for this.
      core.api.players.get(myId, (error, values) => {
        let link = feed.key.toString('hex')
        if (error === null) {
          // Set the link to update the latest local value.
          link = `${link}@${values[values.length-1].seq}`
        }
        feed.append({
          type: 'movement-message',
          id: myId,
          nickname: node,
          x: myX,
          y: myY,
          links: [link]
        })
      })
    }

    app.input.on('left', () => updatePosition(-1, 0))
    app.input.on('right', () => updatePosition(1, 0))
    app.input.on('up', () => updatePosition(0, -1))
    app.input.on('down', () => updatePosition(0, 1))

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
