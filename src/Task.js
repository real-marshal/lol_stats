const logger = require('./Logger')
const TaskActions = require('./TaskActions')
const RiotAPI = require('./RiotAPI')

const EventEmitter = require('events')

class Task extends EventEmitter {

  static defaultRiotAPI = new RiotAPI()

  constructor(action, ...args) {
      super()
      this.oldOn = this.on
      this.on = (eventName) => new Promise((resolve, reject) => {
        this.oldOn(eventName, arg => resolve(arg))
      })
      this.action = TaskActions[action]
      this.name = action
      this.args = args
      this.setRiotAPI(Task.defaultRiotAPI)
  }

  setRiotAPI(riotAPI) {
    this.riotAPI = riotAPI
  }

  execute() {
    this.action.bind(this)(...this.args)
    this.riotAPI.requestManager.startExecuting(this)
  }

  finish(result) {
    this.emit('finish', result)
  }

  onFinish() {
    return this.on('finish')
  }

  clearTask() {
    clearInterval(this.riotAPI.requestManager.endpointsInterval)
    this.riotAPI.requestManager.requests = {}
    logger.info('Cleared endpointsInterval & requests')
  }
}

module.exports = Task
