const logger = require('./Logger')
const Request = require('./Request')
const RequestManager = require('./RequestManager')
const DB = require('./DB')

class RiotAPI {

  constructor(requestManager = new RequestManager()) {
    this.requestManager = requestManager
  }

  static rankedSoloQueueId = 420

  getSummonersFromFeaturedGames() {
    logger.info('Getting summoners from featured games...')
    return this.requestManager
      .add(Request.create('/lol/spectator/v3/featured-games'))
      .then(res => {
        const games = res.data.gameList
        let summonersDB = []

        games.forEach(game => {
          if (game.platformId === this.requestManager.region.toUpperCase()) {
            const participants = game.participants.reduce((players, player) => { return [...players, player.summonerName] }, [])
            summonersDB = summonersDB.concat(participants)
          }
        })
        return summonersDB
      })
      .catch(err => logger.error(`Error getting featured games:\n ${err}`))
  }

  getSummonersIds(summoners) {
    logger.info('Getting summonersIds...')
    let summonerIds = []
    let promises = summoners.reduce((promiseArr, summoner) => {
      let promise = this.requestManager
        .add(Request.create(`/lol/summoner/v3/summoners/by-name/${encodeURI(summoner)}`))
        .then(res => summonerIds.push(res.data.id))
        .catch(err => logger.error(`Error getting summonerId by summonerName ${summoner}:\n ${err}`))
      return [...promiseArr, promise]
    }, [])
    return Promise.all(promises).then(() => summonerIds)
  }

  getLeaguesIds(summonersIds) {
    logger.info('Getting leagueIds...')
    let leagueIds = {
      bronze: new Set(),
      silver: new Set(),
      gold: new Set(),
      platinum: new Set(),
      diamond: new Set()
    }
    let promises = summonersIds.reduce((promiseArr, summonerId) => {
      let promise = this.requestManager
        .add(Request.create(`/lol/league/v3/positions/by-summoner/${summonerId}`))
        .then(res => {
          for (let queue of res.data) {
            if (queue.queueType === 'RANKED_SOLO_5x5') {
              leagueIds[queue.tier.toLowerCase()].add(queue.leagueId)
              break
            }
          }
        })
        .catch(err => logger.error(`Error getting leagueId by summonerId ${summonerId}:\n ${err}`))
      return [...promiseArr, promise]
    }, [])
    return Promise.all(promises).then(() => leagueIds)
  }

  getLeaguePositions(summonersIds) {
    let summoners = []
    let promises = summonersIds.reduce((promiseArr, summonerId) => {
      let promise = this.requestManager
        .add(Request.create(`/lol/league/v3/positions/by-summoner/${summonerId}`))
        .then(res => {
          for (let queue of res.data) {
            if (queue.queueType === 'RANKED_SOLO_5x5') {
              summoners.push({
                summonerId,
                tier: queue.tier,
                rank: queue.rank,
                leagueId: queue.leagueId,
                summonerName: queue.playerOrTeamName
              })
              break
            }
          }
        })
        .catch(err => logger.error(`Error getting leagueId by summonerId ${summonerId}:\n ${err}`))
      return [...promiseArr, promise]
    }, [])
    return Promise.all(promises).then(() => summoners)
  }

  getSummonersByLeague(leagueId) {
    logger.info('Getting summoners from league...')
    let summoners = []
    return this.requestManager
      .add(Request.create(`/lol/league/v3/leagues/${leagueId}`))
      .then(res => {
        for (let summoner of res.data.entries) {
          summoners.push({
            tier: res.data.tier,
            leagueId: res.data.leagueId,
            rank: summoner.rank,
            summonerName: summoner.playerOrTeamName,
            summonerId: summoner.playerOrTeamId
          })
        }
        return summoners
      })
      .catch(err => logger.error(`Error getting summoners from league ${leagueId}:\n ${err}`))
  }

  getAccountIds(summoners) {
    logger.info('Getting accountIds of summoners...')
    let filledSummoners = []
    let promises = summoners.reduce((promiseArr, summoner) => {
      let promise = this.requestManager
        .add(Request.create(`/lol/summoner/v3/summoners/${summoner.summonerId}`))
        .then(res => {
          filledSummoners.push({
            tier: summoner.tier,
            leagueId: summoner.leagueId,
            rank: summoner.rank,
            summonerName: summoner.summonerName,
            summonerId: summoner.summonerId,
            accountId: res.data.accountId,
            profileIcon: res.data.profileIconId
          })
        })
        .catch(err => logger.error(`Error getting accountId of summoner ${summoner.summonerName}:\n ${err}`))
      return [...promiseArr, promise]
    }, [])
    return Promise.all(promises).then(() => filledSummoners)
  }

  getMatchesByAccountId(accountId) {
    logger.info(`Getting matches by accountId ${accountId}`)
    let endTime = Date.now()
    // Use max possible range (week) according to Riot API
    let beginTime = endTime - 7 * 24 * 60 * 60 * 1000
    return this.requestManager
      .add(Request.create(`/lol/match/v3/matchlists/by-account/${accountId}?endTime=${endTime}&beginTime=${beginTime}&queue=${RiotAPI.rankedSoloQueueId}`))
      .then(res => res.data.matches)
      .catch(err => Promise.reject(`Error getting matches by accountId ${accountId}:\n ${err}`))
  }

  getMatchesByIds(matchesIds) {
    logger.info('Getting matches...')

    let matches = []

    let promises = matchesIds.reduce((promiseArr, matchId) => {
      let promise = this.requestManager
        .add(Request.create(`/lol/match/v3/matches/${matchId}`))
        .then(res => matches.push(res.data))
        .catch(err => {
          logger.error(`Error getting match by matchId ${matchId}:\n ${err}`)
          // Remove matches with wrong gameIds (supposedly tournamentIds)
          if (err.response && err.response.status === 404) {
            DB.deleteWrongMatchId(matchId)
            logger.warn(`MatchId ${matchId} was considered as wrong and deleted from DB`)
          }
        })
      return [...promiseArr, promise]
    }, [])
    return Promise.all(promises).then(() => matches)
  }
}

module.exports = RiotAPI
