const axios = require('axios')
const logger = require('./Logger')

class RequestManager {

  static apiKey = process.env.API_KEY
  static defaultRegion = 'ru'
  static defaultEndpoints = [
    '/lol/spectator/v3/featured-games',
    '/lol/summoner/v3/summoners/by-name/',
    '/lol/league/v3/positions/by-summoner/',
    '/lol/league/v3/leagues/',
    '/lol/match/v3/matchlists/by-account/',
    '/lol/match/v3/matches/',
    '/lol/summoner/v3/summoners/'
  ]
  static defaultParameters = {
    '/lol/summoner/v3/summoners/by-name/': 'RealMarshal',
    '/lol/league/v3/positions/by-summoner/': '9342085',
    '/lol/league/v3/leagues/': '3151c270-1a14-11e8-9ef3-0616f4b03a17',
    '/lol/match/v3/matchlists/by-account/': '203229690',
    '/lol/match/v3/matches/': '164891101',
    '/lol/summoner/v3/summoners/': '9342085'
  }

  constructor(region = RequestManager.defaultRegion, endpoints = RequestManager.defaultEndpoints, parameters = RequestManager.defaultParameters) {
    this.region = region
    this.axiosInstance = axios.create({
      baseURL: `https://${this.region}.api.riotgames.com/`,
      timeout: 10000,
      headers: {'X-Riot-Token': RequestManager.apiKey}
    })
    this.endpointsList = endpoints
    this.defaultParameters = parameters
    this.requests = {}
    this.rateLimitExcesses = 0
    this.rateLimits = { appRateLimits: '', endpointsRateLimits: {} }

    this.axiosInstance.interceptors.response.use((res) => {
      logger.info(res.config.url)
      logger.info(`App Rate Limit: ${res.headers['x-app-rate-limit-count']} out of ${res.headers['x-app-rate-limit']}`)
      logger.info(`Method Rate Limit: ${res.headers['x-method-rate-limit-count']} out of ${res.headers['x-method-rate-limit']}\n`)
      return res
    }, (err) => {
      if (err.response && err.response.status === 429) {
        this.rateLimitExcesses++
        logger.warn('Unhandled Limit Excess')
      }
      return Promise.reject(err)
    })
  }

  startExecuting(task) {
    const delayBetweenEndpoints = 1000

    let endpointIndex = 0
    let currentRequests = null
    let requestsLoop = null

    this.endpointsInterval = setInterval(() => {
      currentRequests = Object.values(this.requests)[endpointIndex]

      if (currentRequests)
        if (currentRequests.length === 1) {
          currentRequests[0].execute(this.axiosInstance)
          endpointIndex++
        } else if (!requestsLoop) {
            const endpointURL = Object.keys(this.requests)[endpointIndex]
            const delayBetweenRequests = this.computeMaxDelay(endpointURL) * 1000

            let requestIndex = 0

            requestsLoop = setInterval(() => {
              currentRequests[requestIndex].execute(this.axiosInstance)
              if (++requestIndex === currentRequests.length) {
                clearInterval(requestsLoop)
                requestsLoop = null
                endpointIndex++
                logger.info('Cleared requestsLoop')
              }
            }, delayBetweenRequests)
        }
    }, delayBetweenEndpoints)
  }

  computeMaxDelay(endpoint) {

    const methodDelays = this.parseRateLimitHeader(this.rateLimits.endpointsRateLimits[endpoint]).map(limit => Math.ceil(limit.time / limit.requests * 100) / 100 )
    const maxMethodDelay = Math.max(...methodDelays)
    const appDelays = this.parseRateLimitHeader(this.rateLimits.appRateLimits).map(limit => limit.time / limit.requests )
    const maxAppDelay = Math.max(...appDelays)
    logger.info(`Delay for endpoint ${endpoint} is ${maxMethodDelay}, computed max delay is ${Math.max(maxMethodDelay, maxAppDelay)}`)
    return Math.max(maxMethodDelay, maxAppDelay)
  }

  parseRateLimitHeader(header) {
    let rateLimitsArray = []
    let rateLimits = header.split(',')
    rateLimits.forEach(rateLimit => {
      let requests = rateLimit.split(':')[0]
      let time = rateLimit.split(':')[1]
      rateLimitsArray.push({ requests, time })
    })
    return rateLimitsArray
  }

  add(request) {
    const possibleUrlExcludingParams = request.url.slice(0, request.url.lastIndexOf('/') + 1)

    if (this.requests[request.url]) {
      this.requests[request.url].push(request)
      return request
    }

    if (this.requests[possibleUrlExcludingParams]) {
      this.requests[possibleUrlExcludingParams].push(request)
      return request
    }

    if (this.endpointsList.includes(request.url)) {
      this.requests[request.url] = []
      this.requests[request.url].push(request)
    } else {
      this.requests[possibleUrlExcludingParams] = []
      this.requests[possibleUrlExcludingParams].push(request)
    }
    return request
  }

}

module.exports = RequestManager
