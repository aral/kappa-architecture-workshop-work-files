const EventEmitter = require('events').EventEmitter
const assert = require('assert')

class LocalLog extends EventEmitter
{
  constructor () {
    super()
    this._log = []
    this._eventHandlers = []
  }

  push (message) {
    this._log.push (message)

    this.emit('add', message)
  }

  tail (numberOfLines, callback) {
    assert(typeof numberOfLines === 'number')
    assert(typeof callback === 'function')
    numberOfLines = parseInt(`${numberOfLines}`)

    this.on('add', () => {
      const _tail = this._log.slice(-1 * numberOfLines).join("\n")
      callback(_tail)
    })
  }

  dump () {
    console.log(this._log)
  }
}

module.exports = LocalLog

// Test

// const log = new LocalLog()

// log.on('add', (message) => {
//   console.log(`[LOG] Add: ${message}`)
// })

// log.tail (3, (lines) => {
//   console.log("\n===")
//   console.log(lines)
//   console.log("===")
// })

// log.push('First message')
// log.push('Second message')
// log.push('Third message')
// log.push('Fourth message')
// log.push('Fifth message')

// log.dump()
