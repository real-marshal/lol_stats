const logger = require('./Logger')
const Task = require('./Task')

class MainLoop {

  static delay = 5000

  static taskStack = []
  static task = null
  static interval = null
  static isStarted = false
  static isStopping = false
  static status = ''


  static start() {

    if (!MainLoop.isStarted) {
      logger.info('Starting main loop...')

      MainLoop.interval = setInterval(() => MainLoop.checkTasks(), MainLoop.delay)

      logger.info('Started executing tasks')
      MainLoop.isStarted = true
      return
    }
    logger.warn('Main loop has already been started')
  }

  static stop() {
    if (MainLoop.isStarted) {
      logger.info('Stopping main loop...')
      MainLoop.isStopping = true
      return
    }
    logger.warn('Main loop has not been started yet')
  }

  static checkTasks() {

    if (MainLoop.task)
      return

    if (MainLoop.isStopping) {
      clearInterval(MainLoop.interval)
      MainLoop.isStarted = false
      MainLoop.isStopping = false
      logger.info('Main loop was stopped')
      return
    }

    MainLoop.task = MainLoop.getTask()
    if (MainLoop.task) {
      MainLoop.status = `Executing task ${MainLoop.task.name}`
      logger.info('Executing new task...')

      MainLoop.task.onFinish().then(result => {
        MainLoop.task.clearTask()
        MainLoop.task = null
      })

      MainLoop.task.execute()

      return
    }

    MainLoop.status = 'Waiting...'
    logger.info(MainLoop.status)
  }

  static addTask(task) {
    MainLoop.taskStack.push(task)
    return task
  }

  static getTask() {
    return MainLoop.taskStack.pop()
  }

  static async startStandardLoop() {
    await MainLoop.addTask(new Task('updateRateLimits')).onFinish()
    await MainLoop.addTask(new Task('updateStaticData')).onFinish()

    while(true) {
      let result = await MainLoop.addTask(new Task('analyzeMatches', 1000)).onFinish()
      if (result.success) continue

      await MainLoop.addTask(new Task('addMatches', 100)).onFinish()
    }
  }

}

module.exports = MainLoop
