
const EventEmitter = require('events').EventEmitter
class LocalLog extends EventEmitter
{
  constructor () {
    super()
    this._log = []
  }

  push (message) {
    this._log.push (message)

    this.emit('add', message)
  }

  dump () {
    console.log(this._log)
  }
}

// Test

const log = new LocalLog()

log.on('add', (message) => {
  console.log(`[LOG] Add: ${message}`)
})

log.push('This is a message (really!)')

log.dump()
