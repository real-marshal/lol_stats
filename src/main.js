const express = require('express')
const AdminRouter = require('./AdminRouter')
const APIRouter = require('./APIRouter')
const MainLoop = require('./MainLoop')
const logger = require('./Logger')

const port = process.env.PORT || 3000

const app = express()

app.set('view engine', 'pug')
app.set('views', './public')

app.use('/admin', AdminRouter)
app.use('/api', APIRouter)

app.listen(port, () => logger.info(`Listening on port ${port}`))

MainLoop.start()
