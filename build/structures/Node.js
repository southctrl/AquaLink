'use strict'

const WebSocket = require('ws')
const Rest = require('./Rest')
const { AqualinkEvents } = require('./AqualinkEvents')

const privateData = new WeakMap()

const WS_STATES = Object.freeze({ CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 })
const FATAL_CLOSE_CODES = Object.freeze([4003, 4004, 4010, 4011, 4012, 4015])
const WS_PATH = '/v4/websocket'
const LYRICS_PREFIX = 'Lyrics'
const OPS_STATS = 'stats'
const OPS_READY = 'ready'
const OPS_PLAYER_UPDATE = 'playerUpdate'
const OPS_EVENT = 'event'

const _functions = {
  buildWsUrl(host, port, ssl) {
    const needsBrackets = host.includes(':') && !host.startsWith('[')
    const h = needsBrackets ? `[${host}]` : host
    return `ws${ssl ? 's' : ''}://${h}:${port}${WS_PATH}`
  },

  isLyricsOp(op) {
    return typeof op === 'string' && op.startsWith(LYRICS_PREFIX)
  },

  reasonToString(reason) {
    if (!reason) return 'No reason provided'
    if (typeof reason === 'string') return reason
    if (Buffer.isBuffer(reason)) {
      try {
        return reason.toString('utf8')
      } catch {
        return String(reason)
      }
    }
    if (typeof reason === 'object') {
      return reason.message || reason.code || JSON.stringify(reason)
    }
    return String(reason)
  }
}

class Node {
  static BACKOFF_MULTIPLIER = 1.5
  static MAX_BACKOFF = 60000
  static DEFAULT_RECONNECT_TIMEOUT = 2000
  static DEFAULT_RESUME_TIMEOUT = 60
  static JITTER_MAX = 2000
  static JITTER_FACTOR = 0.2
  static WS_CLOSE_NORMAL = 1000
  static DEFAULT_MAX_PAYLOAD = 1048576
  static DEFAULT_HANDSHAKE_TIMEOUT = 15000

  constructor(aqua, connOptions, options = {}) {
    this.aqua = aqua

    this.host = connOptions.host || 'localhost'
    this.name = connOptions.name || this.host
    this.port = connOptions.port || 2333
    this.auth = connOptions.auth || 'youshallnotpass'
    this.sessionId = connOptions.sessionId || null
    this.regions = connOptions.regions || [
      'us-central', 'us-east', 'us-west', 'us-south',
      'eu-central', 'eu-west', 'eu-south', 'eu-north',
      'asia-central', 'asia-south', 'singapore', 'hongkong', 'japan', 'sydney',
      'brazil', 'india', 'southafrica'
    ]
    this.ssl = !!connOptions.ssl
    this.wsUrl = _functions.buildWsUrl(this.host, this.port, this.ssl)

    this.rest = new Rest(aqua, this)

    this.resumeTimeout = options.resumeTimeout ?? Node.DEFAULT_RESUME_TIMEOUT
    this.autoResume = options.autoResume ?? false
    this.reconnectTimeout = options.reconnectTimeout ?? Node.DEFAULT_RECONNECT_TIMEOUT
    this.reconnectTries = options.reconnectTries ?? 3
    this.infiniteReconnects = options.infiniteReconnects ?? false
    this.timeout = options.timeout ?? Node.DEFAULT_HANDSHAKE_TIMEOUT
    this.maxPayload = options.maxPayload ?? Node.DEFAULT_MAX_PAYLOAD
    this.skipUTF8Validation = options.skipUTF8Validation ?? true

    this.connected = false
    this.info = null
    this.ws = null
    this.reconnectAttempted = 0
    this.reconnectTimeoutId = null
    this.isDestroyed = false
    this._isConnecting = false

    this.stats = {
      players: 0,
      playingPlayers: 0,
      uptime: 0,
      ping: 0,
      memory: { free: 0, used: 0, allocated: 0, reservable: 0 },
      cpu: { cores: 0, systemLoad: 0, lavalinkLoad: 0 },
      frameStats: { sent: 0, nulled: 0, deficit: 0 }
    }

    this._clientName = `Aqua/${this.aqua.version} https://github.com/ToddyTheNoobDud/AquaLink`
    this._headers = this._buildHeaders()

    const handlers = {
      open: this._handleOpen.bind(this),
      error: this._handleError.bind(this),
      message: this._handleMessage.bind(this),
      close: this._handleClose.bind(this),
      connect: this.connect.bind(this)
    }

    privateData.set(this, { boundHandlers: handlers })
  }

  _buildHeaders() {
    const headers = {
      'Authorization': this.auth,
      'User-Id': this.aqua.clientId,
      'Client-Name': this._clientName
    }
    if (this.sessionId) headers['Session-Id'] = this.sessionId
    return headers
  }

  get _boundHandlers() {
    return privateData.get(this)?.boundHandlers
  }

  async _handleOpen() {
    this.connected = true
    this._isConnecting = false
    this.reconnectAttempted = 0
    this._emitDebug('WebSocket connection established')

    if (!this.aqua?.bypassChecks?.nodeFetchInfo && !this.info) {
      const timeoutId = setTimeout(() => {
        this._emitError('Node info fetch timeout')
      }, 10000)
      timeoutId.unref?.()

      try {
        this.info = await this.rest.makeRequest('GET', '/v4/info')
        clearTimeout(timeoutId)
      } catch (err) {
        clearTimeout(timeoutId)
        this.info = null
        this._emitError(`Failed to fetch node info: ${err?.message || err}`)
      }
    }

    this.aqua.emit(AqualinkEvents.NodeConnect, this)
  }

  _handleError(error) {
    const err = error instanceof Error ? error : new Error(String(error))
    this.aqua.emit(AqualinkEvents.NodeError, this, err)
  }

  _handleMessage(data, isBinary) {
    if (isBinary) return

    const str = Buffer.isBuffer(data) ? data.toString('utf8') : data
    if (!str || typeof str !== 'string') return
    let payload
    try {
      payload = JSON.parse(str)
    } catch (err) {
      this._emitDebug(() => `Invalid JSON from Lavalink: ${err.message}`)
      return
    }

    const op = payload?.op
    if (!op) return

    // not gonna use switch this time (i think)
    // why? prob cuz an ordered IF statement is faster than a switch, right?
    // but im not sure abt that atp
    // because it can be slower or faster and depends on the op (idk)
    // so i ordered it with player updates first, since they are the most used, events for trackstart n stuff and the least used are stats and ready, and if we need handle the custom one
    if (op === OPS_PLAYER_UPDATE) {
      this._emitToPlayer(AqualinkEvents.PlayerUpdate, payload)
    } else if (op === OPS_EVENT) {
      this._emitToPlayer('event', payload)
    } else if (op === OPS_STATS) {
      this._updateStats(payload)
    } else if (op === OPS_READY) {
      this._handleReady(payload)
    } else {
      this._handleCustomStringOp(op, payload)
    }
  }

  _emitToPlayer(eventName, payload) {
    const guildId = payload?.guildId
    if (!guildId) return

    const player = this.aqua?.players?.get?.(guildId)
    if (!player?.emit) return

    try {
      player.emit(eventName, payload)
    } catch (err) {
      this._emitError(`Player emit error: ${err?.message || err}`)
    }
  }

  _handleCustomStringOp(op, payload) {
    if (_functions.isLyricsOp(op)) {
      const player = payload.guildId ? this.aqua?.players?.get?.(payload.guildId) : null
      this.aqua.emit(op, player, payload.track || null, payload)
      return
    }

    this.aqua.emit(AqualinkEvents.NodeCustomOp, this, op, payload)
    this._emitDebug(() => `Unknown op from Lavalink: ${op}`)
  }

  _handleClose(code, reason) {
    this.connected = false
    this._isConnecting = false

    const reasonStr = _functions.reasonToString(reason)
    this.aqua.emit(AqualinkEvents.NodeDisconnect, this, { code, reason: reasonStr })

    if (this.isDestroyed) return

    const isFatal = FATAL_CLOSE_CODES.includes(code)
    const shouldReconnect = (code !== Node.WS_CLOSE_NORMAL || this.infiniteReconnects) && !isFatal

    if (!shouldReconnect) {
      if (code === 4011) {
        this.sessionId = null
        delete this._headers['Session-Id']
      }
      this._emitError(new Error(`WebSocket closed (code ${code}). Not reconnecting.`))
      this.destroy(true)
      return
    }

    this.aqua.handleNodeFailover?.(this)
    this._scheduleReconnect()
  }

  _scheduleReconnect() {
    this._clearReconnectTimeout()

    if (this.infiniteReconnects) {
      const attempt = ++this.reconnectAttempted
      const backoffTime = 10000
      this.aqua.emit(AqualinkEvents.NodeReconnect, this, { infinite: true, attempt, backoffTime })
      this.reconnectTimeoutId = setTimeout(this._boundHandlers.connect, backoffTime)
      this.reconnectTimeoutId.unref?.()
      return
    }

    if (this.reconnectAttempted >= this.reconnectTries) {
      this._emitError(new Error(`Max reconnection attempts reached (${this.reconnectTries})`))
      this.destroy(true)
      return
    }

    const attempt = ++this.reconnectAttempted
    const backoffTime = this._calcBackoff(attempt)

    this.aqua.emit(AqualinkEvents.NodeReconnect, this, { infinite: false, attempt, backoffTime })
    this.reconnectTimeoutId = setTimeout(this._boundHandlers.connect, backoffTime)
    this.reconnectTimeoutId.unref?.()
  }

  _calcBackoff(attempt) {
    const exp = Math.min(attempt, 10)
    const baseBackoff = this.reconnectTimeout * Math.pow(Node.BACKOFF_MULTIPLIER, exp)
    const maxJitter = Math.min(Node.JITTER_MAX, baseBackoff * Node.JITTER_FACTOR)
    const jitter = Math.random() * maxJitter
    return Math.min(baseBackoff + jitter, Node.MAX_BACKOFF)
  }

  _clearReconnectTimeout() {
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId)
      this.reconnectTimeoutId = null
    }
  }

  connect() {
    if (this.isDestroyed || this._isConnecting) return

    const currentState = this.ws?.readyState
    if (currentState === WS_STATES.OPEN) {
      this._emitDebug('WebSocket already connected')
      return
    }
    if (currentState === WS_STATES.CONNECTING || currentState === WS_STATES.CLOSING) {
      this._emitDebug('WebSocket is connecting/closing; skipping new connect')
      return
    }

    this._isConnecting = true
    this._cleanup()

    try {
      const ws = new WebSocket(this.wsUrl, {
        headers: this._headers,
        perMessageDeflate: true,
        handshakeTimeout: this.timeout,
        maxPayload: this.maxPayload,
        skipUTF8Validation: this.skipUTF8Validation
      })

      ws.binaryType = 'nodebuffer'

      const h = this._boundHandlers
      ws.once('open', h.open)
      ws.once('error', h.error)
      ws.on('message', h.message)
      ws.once('close', h.close)

      this.ws = ws
    } catch (err) {
      this._isConnecting = false
      this._emitError(`Failed to create WebSocket: ${err?.message || err}`)
      this._scheduleReconnect()
    }
  }

  _cleanup() {
    const ws = this.ws
    if (!ws) return

    ws.removeAllListeners()

    try {
      const state = ws.readyState
      if (state === WS_STATES.OPEN) {
        ws.close(Node.WS_CLOSE_NORMAL)
      } else if (state !== WS_STATES.CLOSED) {
        ws.terminate()
      }
    } catch (err) {
      this._emitError(`WebSocket cleanup error: ${err?.message || err}`)
    }

    this.ws = null
  }

  destroy(clean = false) {
    if (this.isDestroyed) return

    this.isDestroyed = true
    this._isConnecting = false
    this._clearReconnectTimeout()
    this._cleanup()

    if (!clean) {
      this.aqua.handleNodeFailover?.(this)
    }

    this.connected = false
    this.aqua.destroyNode?.(this.name)
    this.aqua.emit(AqualinkEvents.NodeDestroy, this)

    if (this.rest?.destroy) {
      this.rest.destroy()
    }

    this.info = null
    this.rest = null
    this.aqua = null
    this._headers = null
    this.stats = null

    privateData.delete(this)
  }

  async getStats() {
    if (this.connected) return this.stats

    try {
      const newStats = await this.rest.getStats()
      if (newStats) this._updateStats(newStats)
    } catch (err) {
      this._emitError(`Failed to fetch node stats: ${err?.message || err}`)
    }

    return this.stats
  }

  _updateStats(payload) {
    if (!payload) return

    const s = this.stats

    if (payload.players !== undefined) s.players = payload.players
    if (payload.playingPlayers !== undefined) s.playingPlayers = payload.playingPlayers
    if (payload.uptime !== undefined) s.uptime = payload.uptime
    if (payload.ping !== undefined) s.ping = payload.ping

    if (payload.memory) {
      const m = s.memory
      if (payload.memory.free !== undefined) m.free = payload.memory.free
      if (payload.memory.used !== undefined) m.used = payload.memory.used
      if (payload.memory.allocated !== undefined) m.allocated = payload.memory.allocated
      if (payload.memory.reservable !== undefined) m.reservable = payload.memory.reservable
    }

    if (payload.cpu) {
      const c = s.cpu
      if (payload.cpu.cores !== undefined) c.cores = payload.cpu.cores
      if (payload.cpu.systemLoad !== undefined) c.systemLoad = payload.cpu.systemLoad
      if (payload.cpu.lavalinkLoad !== undefined) c.lavalinkLoad = payload.cpu.lavalinkLoad
    }

    if (payload.frameStats) {
      const f = s.frameStats
      if (payload.frameStats.sent !== undefined) f.sent = payload.frameStats.sent
      if (payload.frameStats.nulled !== undefined) f.nulled = payload.frameStats.nulled
      if (payload.frameStats.deficit !== undefined) f.deficit = payload.frameStats.deficit
    }
  }

  async _handleReady(payload) {
    const sessionId = payload?.sessionId
    if (!sessionId) {
      this._emitError('Ready payload missing sessionId')
      return
    }

    this.sessionId = sessionId
    this.rest.setSessionId(sessionId)
    this._headers['Session-Id'] = sessionId

    this.aqua.emit(AqualinkEvents.NodeReady, this, { resumed: !!payload.resumed })
    this.aqua.emit(AqualinkEvents.NodeConnect, this)

    if (this.autoResume) {
      setImmediate(() => {
        this._resumePlayers().catch(err => {
          this._emitError(`_resumePlayers failed: ${err?.message || err}`)
        })
      })
    }
  }

  async _resumePlayers() {
    if (!this.sessionId) return

    try {
      await this.rest.makeRequest('PATCH', `/v4/sessions/${this.sessionId}`, {
        resuming: true,
        timeout: this.resumeTimeout
      })

      if (this.aqua.loadPlayers) {
        await this.aqua.loadPlayers()
      }

      this._emitDebug('Session resumed successfully')
    } catch (err) {
      this._emitError(`Failed to resume session: ${err?.message || err}`)
      throw err
    }
  }

  _emitError(error) {
    const errorObj = error instanceof Error ? error : new Error(String(error))
    this.aqua.emit(AqualinkEvents.Error, this, errorObj)
  }

  _emitDebug(message) {
    if ((this.aqua?.listenerCount?.(AqualinkEvents.Debug) || 0) === 0) return
    const out = typeof message === 'function' ? message() : message
    this.aqua.emit(AqualinkEvents.Debug, this.name, out)
  }
}

module.exports = Node
