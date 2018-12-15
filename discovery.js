const discovery = require('discovery-swarm')
const swarm = discovery()

const nickname = 'person' +  Math.floor(Math.random() * 42) + 1

swarm.join('my-very-very-simple-p2p-app')

swarm.on('connection', function (connection, info) {
  console.log(`Found a peer: ${info.host}:${info.port}`)

  process.stdin.on('data', function (data) {
    connection.write(JSON.stringify({
      type: 'chat-message',
      nickname,
      text: data.toString().trim(),
      timestamp: new Date().toISOString()
    }))
  })

  connection.on('data', function (data) {
    data = JSON.parse(data)
    console.log(`${data.timestamp} ${data.nickname}: ${data.text}`)
  })
})
