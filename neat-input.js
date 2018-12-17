var input = require('neat-input')({style: style})
var diff = require('ansi-diff-stream')()

var names = []
var seconds = 0

diff.pipe(process.stdout)

input.on('enter', function (line) {
  names.push(line)
})

setInterval(function () {
  seconds++
  update()
}, 1000)

input.on('update', update)
update()

function style (start, cursor, end) {
  if (!cursor) cursor = ' '
  return start + '[' + cursor + ']' + end
}

function update () {
  diff.write(`
    Welcome to name input. It has been ${seconds} since you started.

    Please enter your name: ${input.line()}
    Cursor position is ${input.cursor}

    Previously entered names: ${names.join(', ')}
  `)
}
