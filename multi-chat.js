let hypercore = require('hypercore')
let multifeed = require('multifeed')

let discovery = require('discovery-swarm')
let pump = require('pump')

let personID = process.argv[2]

let multi = multifeed(hypercore, `./multi-chat-${personID}`, { valueEncoding: 'json' })

let swarm = discovery()
swarm.join('multi-chat-chitty-chitty-bang-bang')
swarm.on('connection', function(peer) {
  console.log('(New peer connected!)')
  pump(peer, multi.replicate({live: true}), peer)
})

multi.writer('local', function (err, feed) {
  if (err) throw err

  // You can do something with an individual feed here.
  process.stdin.on('data', function (data) {
    feed.append({
      type: 'chat-message',
      nickname: personID,
      text: data.toString().trim(),
      timestamp: new Date().toISOString()
    })
  })

})

multi.ready(function() {
  let feeds = multi.feeds()
  feeds.forEach(function(feed) {
    console.log('Listening for updates on feed ', feed)

    feed.createReadStream({live: true}).on('data', function(data) {
      console.log(`${data.timestamp} ${data.nickname}: ${data.text}`)
    })
  })
})

