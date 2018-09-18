const winston = require('winston')


const logFormat = winston.format.printf(info => `${new Date(info.timestamp).toTimeString().split(' ')[0]} [${info.level}] ${info.message}`)

const logger = winston.createLogger({
  format: winston.format.combine(winston.format.timestamp(), winston.format.colorize(), logFormat),
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error', handleExceptions: true }),
    new winston.transports.File({ filename: 'logs/combined.log', handleExceptions: true }),
    new winston.transports.Console({handleExceptions: true})
  ]
})

module.exports = logger
