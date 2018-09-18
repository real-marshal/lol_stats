const express = require('express')
const DB = require('./DB')

const router = express.Router()

router.get('/getPatchStats', async (req,res) => res.json(await DB.getPatchStats()))
router.get('/getTierStats', async (req,res) => res.json(await DB.getTierStats()))
router.get('/getChampStats', async (req,res) => res.json(await DB.getChampStats()))
router.get('/getRoleStats', async (req,res) => res.json(await DB.getRoleStats()))
router.get('/getChampsData', (req, res) => res.json(DB.staticData))

module.exports = router
