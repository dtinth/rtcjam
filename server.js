const path = require('path')
const Peer = require('simple-peer')
const wrtc = require('wrtc')
const { fastify } = require('fastify')
const dgram = require('dgram')

const app = fastify({
  logger: true,
})

app.log.info('rtcjam server')

app.register(require('fastify-static'), {
  root: path.join(__dirname, 'public'),
  prefix: '/',
})

app.register(require('fastify-cors'), { 
})

app.post('/rtc', async (request, reply) => {
  const offer = request.body.offer
  const peer = new Peer({
    initiator: false,
    wrtc,
    trickle: false,
    channelConfig: {
      ordered: false,
      maxRetransmits: 0,
    },
  })

  // Create a UDP socket
  const socket = dgram.createSocket('udp4')
  const listeningPromise = new Promise((resolve, reject) => {
    socket.on('listening', resolve)
    socket.on('error', reject)
  })
  socket.bind(0)
  await listeningPromise
  const socketAddress = socket.address()
  request.log.info(`Assigned client to port ${socketAddress.port}`)

  // Create a WebRTC peer
  request.log.info('Got WebRTC offer:', offer)
  const answerPromise = new Promise((resolve, reject) => {
    peer.on('signal', resolve)
    peer.on('error', reject)
  })
  peer.signal(offer)
  const answer = await answerPromise

  // Some state
  let canSend = true
  let closed = false

  socket.on('message', (msg, rinfo) => {
    if (canSend) {
      try {
        peer.send(msg)
      } catch (err) {
        request.log.error(err, 'Send error')
      }
    }
  })
  peer.on('connect', () => {
    request.log.info('WebRTC peer connected')
    canSend = true
  })
  peer.on('data', (chunk) => {
    // Forwards data to UDP
    socket.send(chunk, 22124, '127.0.0.1')
  })
  peer.on('close', () => {
    request.log.info('WebRTC peer closed')
    closed = true
    canSend = false
    socket.close()
  })
  peer.on('error', (err) => {
    request.log.error(err, 'WebRTC peer error')
  })

  return { answer }
})

app.listen(3010, function (err, address) {
  if (err) {
    app.log.error(err)
    process.exit(1)
  }
})
