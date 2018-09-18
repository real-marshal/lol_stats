const logger = require('./Logger')
const DB = require('./DB')

class TaskActions {


  static updateRateLimits() {
    logger.info('Updating rate limits...')

    let appRateLimitPromise = this.riotAPI.requestManager.axiosInstance
      .get(this.riotAPI.requestManager.endpointsList[0])
      .then(res => this.riotAPI.requestManager.rateLimits.appRateLimits = res.headers['x-app-rate-limit'])
      .catch(err => logger.error(`Error getting app rate limits:\n ${err.stack}`))

    let promises = this.riotAPI.requestManager.endpointsList.reduce((promiseArr, endpointURL) => {
      let requestURL = endpointURL

      if (requestURL.charAt(requestURL.length - 1) === '/')
        requestURL += this.riotAPI.requestManager.defaultParameters[endpointURL]

      let promise = this.riotAPI.requestManager.axiosInstance
        .get(requestURL)
        .then(res => this.riotAPI.requestManager.rateLimits.endpointsRateLimits[endpointURL] = res.headers['x-method-rate-limit'])
        .catch(err => logger.error(`Error getting headers for URL ${requestURL}:\n ${err.stack}`))
      return [...promiseArr, promise]
    }, [])

    Promise.all([...promises, appRateLimitPromise]).then(() => this.finish({ success: true }))
  }

  static async updateStaticData() {
    logger.info('Getting static data...')

    try {
      let versions = await this.riotAPI.requestManager.axiosInstance.get("/lol/static-data/v3/versions")
      let latestVersion = versions.data[0]
      let championsData = await this.riotAPI.requestManager.axiosInstance
                                  .get(`/lol/static-data/v3/champions?locale=ru_RU&dataById=true&version=${latestVersion}`)
      let championsObj = championsData.data.data
      let champions = []

      for (let champId in championsObj)
        champions.push(championsObj[champId])

      DB.staticData = {
        patch: latestVersion,
        champions
      }

      logger.info(`New data recieved for patch ${latestVersion}`)

    } catch(err) {
      logger.error(`Error getting static data:\n${err}`)
    }

    this.finish({ success: true })
  }

  static addLeagueIds() {
    logger.info('Adding leagueIds...')

    this.riotAPI.getSummonersFromFeaturedGames()
      .then(summoners => { logger.info(summoners); return this.riotAPI.getSummonersIds(summoners) })
      .then(summonersIds => { logger.info(summonersIds); return this.riotAPI.getLeaguesIds(summonersIds) })
      .then(leagueIds => { logger.info(leagueIds); return DB.addLeagueIds(leagueIds) })
      .then(() => this.finish({ success: true }))
      .catch(err => logger.error(err))
  }


  static addSummoners() {
    logger.info('Adding summoners...')

    DB.getCurrentLeagueId()
      .then(leagueId => { logger.info(leagueId); return this.riotAPI.getSummonersByLeague(leagueId) })
      .then(summoners => { logger.info(summoners); return this.riotAPI.getAccountIds(summoners) })
      .then(filledSummoners => { logger.info(filledSummoners); return DB.addSummoners(filledSummoners) })
      .then(() => this.finish({ success: true }))
      .catch(err => logger.error(err))
  }


  static addMatches(numberOfSummoners) {
    logger.info('Adding matches...')

    let successfulSummoners = 0

    DB.getCurrentSummoners(numberOfSummoners)
      .then(summoners => {
        if (summoners.length === 0) {
          logger.info('No summoners left to add matches\nResetting summonersIndex...')
          DB.resetSummonersIndex()
          return Promise.resolve()
        }
        let promises = summoners.reduce((promiseArr, summoner) => {
          let promise = this.riotAPI.getMatchesByAccountId(summoner.accountid)
            .then(matches => {
              successfulSummoners++
              DB.addMatches(matches)
            })
            .catch(err => logger.error(err))
          return [...promiseArr, promise]
        }, [])
        return Promise.all(promises)
      })
      .then(() => { logger.info(`Matches of ${successfulSummoners} summoners out of ${numberOfSummoners} were added`); this.finish({ success: true }); })
      .catch(err => logger.error(err))
  }


  static async analyzeMatches(numberOfMatches) {
    logger.info('Analyzing matches...')

    const matchesIds = await DB.getCurrentMatches(numberOfMatches)

    if (matchesIds.length === 0) {
      logger.info('No matches to analyze')
      this.finish({ success: false })
      return
    }

    const matches = await this.riotAPI.getMatchesByIds(matchesIds)

    let participants = []

    for (let match of matches) {
      match.participantIdentities.forEach(participant => participants.push(participant.player))
    }

    const summonerIds = participants.map(participant => participant.summonerId)

    let summonersFromDB = await DB.getSummoners(summonerIds)
    let summonersIdsToGet = [], summoners = {}
    summonersFromDB.forEach(summoner => {
      if (summoner.error) {
        summonersIdsToGet.push(summoner.id)
      } else {
        summoners[summoner.summonerid] = summoner
      }
    })
    let recievedSummoners = await this.riotAPI.getLeaguePositions(summonersIdsToGet)
    let filledSummoners = await this.riotAPI.getAccountIds(recievedSummoners)
    DB.addSummoners(filledSummoners)
    recievedSummoners.forEach(summoner => summoners[summoner.summonerId] = summoner)

    let statsArr = []

    matches.forEach(match => {
      // Between 3:00 and 4:00 vote for remake can be started + 30s to vote
      const maxTimeIfRemake = 270

      let stats = {},
          winner = {},
          loser = {}

      if (match.teams[0].win === 'Win') {
        winner = match.teams[0]
        loser = match.teams[1]
      } else {
        winner = match.teams[1]
        loser = match.teams[0]
      }

      const patch = match.gameVersion.split('.').splice(0,2).join('.')

      stats.general = {
        gameDuration: match.gameDuration,
        patch,
        baronKills: winner.baronKills + loser.baronKills,
        towerKills: winner.towerKills + loser.towerKills,
        dragonKills: winner.dragonKills + loser.dragonKills,
        winsFirstTower: winner.firstTower ? 1 : 0,
        winsFirstInhibitor: winner.firstInhibitor ? 1 : 0,
        winsFirstBlood: winner.firstBlood ? 1 : 0,
        winsFirstDragon: winner.firstDragon ? 1 : 0
      }
      stats.general.gamesKilledBaron = stats.general.baronKills ? 1 : 0

      if (stats.general.gameDuration <= maxTimeIfRemake)
        return

      stats.general.winsFirstBaron = winner.firstBaron ? 1 : 0

      if (winner.firstRiftHerald) {
        stats.general.gamesKilledRiftHerald = 1
        stats.general.winsFirstRiftHerald = 1
      } else {
        if (loser.firstRiftHerald) {
          stats.general.gamesKilledRiftHerald = 1
          stats.general.winsFirstRiftHerald = 0
        } else {
          stats.general.gamesKilledRiftHerald = 0
          stats.general.winsFirstRiftHerald = 0
        }
      }


      stats.bans = [...winner.bans, ...loser.bans].map(ban => ban.championId)

      let players = match.participants

      // Start with 1 to get minimal tier bronze even when there are too many unrankeds
      let tiers = [
        'UNRANKED',
        'BRONZE',
        'SILVER',
        'GOLD',
        'PLATINUM',
        'DIAMOND',
        'MASTER',
        'CHALLENGER']
      let sumTier = 0

      stats.players = []
      players.forEach((player, index) => {
        const summonerId = match.participantIdentities[index].player.summonerId
        if (summoners[summonerId]) {
          sumTier += tiers.indexOf(summoners[summonerId].tier)
        }

        stats.players[index] = {
          kills: player.stats.kills,
          deaths: player.stats.deaths,
          assists: player.stats.assists,
          visionScore: player.stats.visionScore,
          doubleKills: player.stats.doubleKills,
          tripleKills: player.stats.tripleKills,
          quadraKills: player.stats.quadraKills,
          pentaKills: player.stats.pentaKills,
          wardsKilled: player.stats.wardsKilled,
          wardsPlaced: player.stats.wardsPlaced,
          visionWardsBought: player.stats.visionWardsBoughtInGame,
          damageDealtToObjectives: player.stats.damageDealtToObjectives,
          damageDealtToChampions: player.stats.totalDamageDealtToChampions,
          damageTaken: player.stats.totalDamageTaken,
          goldEarned: player.stats.goldEarned,
          minionsKilled: player.stats.totalMinionsKilled
        }

        if (index === 0) {
          for (let stat in stats.players[index]) {
            stats.general[stat] = 0
          }
        }

        for (let stat in stats.players[index]) {
          stats.general[stat] += stats.players[index][stat]
        }

        stats.players[index].role = player.timeline.lane !== 'BOTTOM' ? player.timeline.lane : player.timeline.role.split('_')[1] || 'no role'
        stats.players[index].championId = player.championId
        stats.players[index].patch = patch
        stats.players[index].win = player.stats.win ? 1 : 0
        stats.players[index].lose = player.stats.win ? 0 : 1
      })

      stats.general.tier = tiers[Math.floor(sumTier / 10)].toLowerCase()
      statsArr.push(stats)
    })

    let promise = await DB.saveStats(statsArr)
    this.finish({ success: true })
  }

}

module.exports = TaskActions
