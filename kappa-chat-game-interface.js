// Player movement.
// (One possible solution to Exercises 15-17.)

const network = require('@hyperswarm/network')
const kappacore = require('kappa-core')
const list = require('kappa-view-list')
const kv = require('kappa-view-kv')
const memdb = require('memdb')

const pump = require('pump')
const crypto = require('crypto')

const neatLog = require('neat-log')
const blit = require('txt-blit')

const log = new (require('./LocalLog'))()

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
  const messageId = `${message.key}@${message.seq}`

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

  log.push(`Connected: (${details.type}) ${host}:${port} (${locality}, ${clientType} connection)`)
  log.push(`Count: ${core.feeds().length}`)

  // Start replicating the core with the newly-discovered socket.
  pump(socket, core.replicate({live: true}), socket)
})

// Kappa Core.
// ===========

// Set up kappa-core.
const databasePath = `./db-${topicSlug}-${node}`
const core = kappacore(databasePath, { valueEncoding: 'json' })

core.use('chats', timestampView)
core.use('players', playerView)

////////////////////////////////////////////////////////
// Interface
////////////////////////////////////////////////////////

// Note: these measurements are not infallible; might explode if console is not tall enough.
const termWidth = process.stdout.columns
const termHeight = process.stdout.rows
const otherAreaHeight = 2
const logAreaHeight = 6
const textAreaHeight = Math.min(termHeight - otherAreaHeight - logAreaHeight, 10)
const numberOfLines = textAreaHeight - 2
const numberOfLogLines = logAreaHeight - 2

// Initialise players.
let players = {}

const myId = node //feed.key.toString('hex')

// Blit doesn’t handle multi-char apparently.
// const characters = ['🐇', '🐈', '🐒', '🐛', '🐞', '🐥', '🐩', '🐧', '🐠']
const characters = ['☻', '✿', '☎', '♫', '❤', '☂', '☀', '♞']

// Initial location
const myInitialX = Math.floor(termWidth/2)
const myInitialY = Math.floor(termHeight/2)

// Always get the same character for a given node name.
// (This is not the place/way to do this – see TODO, below.)
const characterOffset = parseInt(node.split('').reduce((e, c) => e + c.charCodeAt(0).toString(), '')) % characters.length
let myCharacter = characters[characterOffset]
// let myCharacter = characters[Math.floor(Math.random() * characters.length)]

players[myId] = {nickname: node, character: myCharacter, x: myInitialX, y: myInitialY}


const messageLineFormatter = (value) => {
  return formattedMessage(new Date(value.timestamp), value.nickname, value.text)
}

const textRectangle = (rectangleHeightInLines, lineFormatterFunction, data) => {
  const topRow = `╔${new Array(termWidth - 2).fill('═').join('')}╗`
  const bottomRow = `╚${new Array(termWidth - 2).fill('═').join('')}╝`

  let rows = []

  data.forEach ((datum) => {
    let formattedRow = datum

    if (typeof datum !== 'string') {
      formattedRow = lineFormatterFunction(datum.value)
    }

    // Currently not handling rows that overflow line width.
    let horizontalPadding = ''
    if (formattedRow.length < (termWidth - 3)) {
      horizontalPadding = Array((termWidth - formattedRow.length) - 3).fill(' ').join('')
    }
    formattedRow = `║ ${formattedRow}${horizontalPadding}║`

    rows.push(formattedRow)
  })

  // If there aren’t enough rows, pad the top.
  let verticalPadding = Array((rectangleHeightInLines - rows.length - 2)).fill(`║ ${Array(termWidth-4).fill(' ').join('')} ║`)
  rows = verticalPadding.concat(rows)

  // Add the top and bottom of the text area frame.
  rows.unshift(topRow)
  rows.push(bottomRow)

  return rows
}

const drawPlayerPositionsRow = (state) => {
  let positions = ''
  for (key in state.players) {
    let person = state.players[key]
    positions += `${person.nickname}: ${person.x}, ${person.y} `
  }

  return positions
}

const drawScreen = (state) => {

  let rows = []

  // Draw the player positions row.
  const playerPositionsRow = drawPlayerPositionsRow(state)
  rows.push(playerPositionsRow)
  rows.push('')

  // Draw the local log.
  const localLogRectangle = textRectangle(logAreaHeight, null, state.lines)
  rows = rows.concat(localLogRectangle)

  // Draw the messages.
  const messagesTextRectangle = textRectangle(textAreaHeight, messageLineFormatter, state.data)
  rows = rows.concat(messagesTextRectangle)

  // Add the input prompt
  rows.push('')
  rows.push(`> ${app.input.line()}`)

  return rows
}

const view = (state) => {
  var screen = []

  // Draw the players
  for (key in state.players) {
    let person = state.players[key]
    blit(screen, person.character, person.x, person.y)
  }

  let screenY = termHeight - textAreaHeight - otherAreaHeight - logAreaHeight
  blit(screen, drawScreen(state), 0, screenY)

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
  state.data = []
  state.lines = []
  state.players = players
  bus.emit('render')

  // Update display on input.
  app.input.on('update', () => {
    bus.emit('render')
  })

  // Update display when the chat feed is updated.
  core.api.chats.tail(numberOfLines, (data) => {
    state.data = data
    bus.emit('render')
  })

  log.tail(numberOfLogLines, (lines) => {
    state.lines = lines
    bus.emit('render')
  })

  // Update display when player positions change.
  core.api.players.onUpdate((key, value) => {
    if (value.value.type === 'movement-message') {
      core.api.players.get(key, (error, values) => {
        if (error) throw error
        // Take the last value (last writer wins)
        let value = values[values.length-1].value
        let nickname = value.nickname
        let character = value.character
        if (typeof state.players[nickname] === 'undefined') {
          state.players[nickname] = {
            nickname,
            character
          }
        }
        let person = state.players[nickname]
        person.x = value.x
        person.y = value.y
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

  log.push('Kappa core views are ready.')

  core.feed('local', (err, feed) => {
    if (err) throw err

    log.push('Local feed is ready.')

    // Start processing input.
    app.input.on('enter', (line) => {
      feed.append({
        type: 'chat-message',
        nickname: node,
        text: line.trim(),
        timestamp: new Date().toISOString()
      })
    })

    const updatePosition = (deltaX = 0, deltaY = 0) => {

      // TODO: The player should be initialised here if non-existent.
      core.api.players.get(myId, (error, values) => {

        let myX = players[myId].x + deltaX
        let myY = players[myId].y + deltaY

        // Wrap around if necessary.
        const screenLeft = 1
        const screenRight = termWidth - 1
        const screenTop = 2
        const screenBottom = termHeight - textAreaHeight - otherAreaHeight - logAreaHeight - 1
        if (myX > screenRight) myX = screenLeft
        if (myX < screenLeft) myX = screenRight
        if (myY > screenBottom) myY = screenTop
        if (myY < screenTop) myY = screenBottom

        let link = feed.key.toString('hex')
        if (error === null) {
          // Set the link to update the latest local value.
          link = `${link}@${values[values.length-1].seq}`
        }

        players[myId].x = myX
        players[myId].y = myY

        feed.append({
          type: 'movement-message',
          id: myId,
          nickname: node,
          character: myCharacter,
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
