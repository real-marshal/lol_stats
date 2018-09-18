const express = require('express')
const bodyParser = require('body-parser')
const path = require('path')
const pug = require('pug');
const Auth = require('./Auth')
const Task = require('./Task')
const RequestManager = require('./RequestManager');
const MainLoop = require('./MainLoop')
const DB = require('./DB')

const router = express.Router()
const urlencodedParser = bodyParser.urlencoded({ extended: false })

router.use(Auth)

router.get('/', (req, res) => res.render('index', { status: MainLoop.status }))
router.get('/logout', (req, res) => res.redirect(401, 'back'))

router.post('/addLeagueId', urlencodedParser, (req, res) => { DB.addLeagueId(req.body.tier, req.body.leagueId); res.sendStatus(200) })
router.post('/addMatches', urlencodedParser, (req, res) => { MainLoop.addTask(new Task('addMatches', parseInt(req.body.numberOfSummoners))); res.sendStatus(200) })
router.post('/analyzeMatches', urlencodedParser, (req, res) => { MainLoop.addTask(new Task('analyzeMatches', parseInt(req.body.numberOfMatches))); res.sendStatus(200) })

router.get('/addLeagueIds', (req, res) => { MainLoop.addTask(new Task('addLeagueIds')); res.sendStatus(200) })
router.get('/addSummoners', (req, res) => { MainLoop.addTask(new Task('addSummoners')); res.sendStatus(200) })
router.get('/startMainLoop', (req, res) => { MainLoop.start(); res.sendStatus(200) })
router.get('/stopMainLoop', (req, res) => { MainLoop.stop(); res.sendStatus(200) })
router.get('/updateStaticData', (req, res) => { MainLoop.addTask(new Task('updateStaticData')); res.sendStatus(200) })
router.get('/updateRateLimits', (req, res) => { MainLoop.addTask(new Task('updateRateLimits')); res.sendStatus(200) })
router.get('/startStandardLoop', (req, res) => { MainLoop.startStandardLoop(); res.sendStatus(200) })

module.exports = router
