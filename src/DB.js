const pgp = require('pg-promise')()
const currentIndexes = require('../currentIndexes')
const fs = require('fs')
const logger = require('./Logger')
const utils = require('./utils')

class DB {

  static connection = {
      host: 'lolstats-postgres.cds3flwpo5gk.eu-central-1.rds.amazonaws.com',
      port: 5432,
      database: 'lol_stats',
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD
  }

  static region = 'ru'

  static db = pgp(DB.connection)

  static staticData = null

  static addLeagueId(tier, leagueId) {
    return this.db
      .none('INSERT INTO league_ids(region, tier, leagueId) VALUES ($1, $2, $3) ON CONFLICT (leagueId) DO NOTHING', [this.region, tier, leagueId])
      .catch(err => logger.error(err))
  }

  static addLeagueIds(leagueIds) {
    let promises = []
    for (let tier in leagueIds)
      promises += Array.from(leagueIds[tier]).reduce((promiseArr, leagueId) => {
        let promise = this.addLeagueId(tier, leagueId)
        return [...promiseArr, promise]
      }, [])
    return Promise.all(promises).then(() => logger.info('LeagueIds were added to DB'))
  }

  static getCurrentLeagueId() {
    return this.db
      .one('SELECT leagueid FROM league_ids ORDER BY id ASC LIMIT 1 OFFSET $1', currentIndexes.leagueIdsIndex)
      .then(res => { currentIndexes.leagueIdsIndex++; this.saveCurrentIndexes(); return res.leagueid })
      .catch(err => logger.error(err))
  }

  static getSummoner(id) {
    return this.db
      .one('SELECT summonerid, tier, leagueid FROM summoners WHERE summonerid = $1', id)
      .catch(err => ({error: 'no data', id}))
  }

  static getSummoners(ids) {
    return this.db
      .task(t => {
        let promises = ids.reduce((promiseArr, id) => {
          let promise = this.getSummoner(id)
          return [...promiseArr, promise]
        }, [])
        return Promise.all(promises)
      })
      .catch(err => logger.error(err))
  }

  static getCurrentSummoners(numberOfSummoners) {
    return this.db
      .any('SELECT * FROM summoners ORDER BY id ASC LIMIT $1 OFFSET $2', [numberOfSummoners, currentIndexes.summonersIndex])
      .then(res => { currentIndexes.summonersIndex += numberOfSummoners; this.saveCurrentIndexes(); return res })
      .catch(err => logger.error(err))
  }

  static saveCurrentIndexes() {
    fs.writeFile('currentIndexes.json', JSON.stringify(currentIndexes), err => {
     if (err) logger.error(err)
    })
  }

  static resetSummonersIndex() {
    currentIndexes.summonersIndex = 0
    fs.writeFile('currentIndexes.json', JSON.stringify(currentIndexes), err => {
     if (err) logger.error(err)
    })
  }

  static addSummoner(summoner) {
    return this.db
      .none('INSERT INTO summoners(region, name, summonerId, accountId, profileIcon, tier, rank, leagueId) VALUES (${region}, ${summonerName}, ${summonerId}, ${accountId}, ${profileIcon}, ${tier}, ${rank}, ${leagueId}) ON CONFLICT(summonerid) DO NOTHING', {...summoner, region: this.region })
      .catch(err => logger.error(err))
  }

  static addSummoners(summoners) {
    return this.db
      .task(t => {
        let promises = summoners.reduce((promiseArr, summoner) => {
          let promise = this.addSummoner(summoner)
          return [...promiseArr, promise]
        }, [])
        return Promise.all(promises)
      })
      .then(() => logger.info('Summoners were added to DB'))
      .catch(err => logger.error(`Error adding summoners to DB:\n ${err}`))

  }

  static addMatches(matches) {
    if (!matches) {
      logger.info('No matches to add')
      return
    }
    return this.db
      .task(t => {
        let promises = matches.reduce((promiseArr, match) => {
          let promise = this.db
            .none('INSERT INTO matches(id) VALUES ($1) ON CONFLICT(id) DO NOTHING', match.gameId)
            .catch((err) => logger.error(err))
          return [...promiseArr, promise]
        }, [])
        return Promise.all(promises)
      })
      .then(() => logger.info('Matches were added to DB'))
      .catch(err => logger.error(`Error adding matches to DB:\n ${err}`))
  }

  static getCurrentMatches(numberOfMatches) {
    return this.db
      .any('SELECT id FROM matches ORDER BY id ASC LIMIT $1 OFFSET $2', [numberOfMatches, currentIndexes.matchesIndex])
      .then(matches => {
        currentIndexes.matchesIndex += matches.length
        this.saveCurrentIndexes()
        return matches.map(match => match.id)
      })
      .catch(err => logger.error(err))
  }

  static deleteWrongMatchId(matchId) {
    return this.db
      .none('DELETE FROM matches WHERE id = $1', matchId)
      .catch(err => logger.error(err))
  }

  static saveStats(statsArr) {
    return this.db
      .task(t => {
        let promises = statsArr.reduce((promiseArr, stats) => {
          let patchStatsPromise = this.db
            .none('INSERT INTO patch_stats(region, patch, matches, gameskilledriftherald, winsfirstriftherald, gameskilledbaron, winsfirstbaron, winsfirstinhibitor, winsfirstblood, winsfirsttower, winsfirstdragon, baronkills, dragonkills, towerkills, visionscore, doublekills, triplekills, quadrakills, pentakills, wardsplaced, visionwardsbought, wardskilled, damagedealttoobjectives, damagedealttochampions, damagetaken, kills, assists, deaths, goldearned, minionskilled, gameduration) VALUES (${region}, ${patch}, 1, ${gamesKilledRiftHerald}, ${winsFirstRiftHerald}, ${gamesKilledBaron}, ${winsFirstBaron}, ${winsFirstInhibitor}, ${winsFirstBlood}, ${winsFirstTower}, ${winsFirstDragon}, ${baronKills}, ${dragonKills}, ${towerKills}, ${visionScore}, ${doubleKills}, ${tripleKills}, ${quadraKills}, ${pentaKills}, ${wardsPlaced}, ${visionWardsBought}, ${wardsKilled}, ${damageDealtToObjectives}, ${damageDealtToChampions}, ${damageTaken}, ${kills}, ${assists}, ${deaths}, ${goldEarned}, ${minionsKilled}, ${gameDuration}) ON CONFLICT(region, patch) DO UPDATE SET matches = patch_stats.matches + 1, gameskilledriftherald = patch_stats.gameskilledriftherald + ${gamesKilledRiftHerald}, winsfirstriftherald = patch_stats.winsfirstriftherald + ${winsFirstRiftHerald}, gameskilledbaron = patch_stats.gameskilledbaron + ${gamesKilledBaron}, winsfirstbaron = patch_stats.winsfirstbaron + ${winsFirstBaron}, winsfirstinhibitor = patch_stats.winsfirstinhibitor + ${winsFirstInhibitor}, winsfirstblood = patch_stats.winsfirstblood + ${winsFirstBlood}, winsfirsttower = patch_stats.winsfirsttower + ${winsFirstTower}, winsfirstdragon = patch_stats.winsfirstdragon + ${winsFirstDragon}, baronkills = patch_stats.baronkills + ${baronKills}, dragonkills = patch_stats.dragonkills + ${dragonKills}, towerkills = patch_stats.towerkills + ${towerKills}, visionscore = patch_stats.visionscore + ${visionScore}, doublekills = patch_stats.doublekills + ${doubleKills}, triplekills = patch_stats.triplekills + ${tripleKills}, quadrakills = patch_stats.quadrakills + ${quadraKills}, pentakills = patch_stats.pentakills + ${pentaKills}, wardsplaced = patch_stats.wardsplaced + ${wardsPlaced}, visionwardsbought = patch_stats.visionwardsbought + ${visionWardsBought}, wardskilled = patch_stats.wardskilled + ${wardsKilled}, damagedealttoobjectives = patch_stats.damagedealttoobjectives + ${damageDealtToObjectives}, damagedealttochampions = patch_stats.damagedealttochampions + ${damageDealtToChampions}, damagetaken = patch_stats.damagetaken + ${damageTaken}, kills = patch_stats.kills + ${kills}, assists = patch_stats.assists + ${assists}, deaths = patch_stats.deaths + ${deaths}, goldearned = patch_stats.goldearned + ${goldEarned}, minionskilled = patch_stats.minionskilled + ${minionsKilled}, gameduration = patch_stats.gameduration + ${gameDuration} WHERE patch_stats.region = ${region} AND patch_stats.patch = ${patch}', {...stats.general, region: this.region })
            .catch((err) => logger.error(err))
          let tierStatsPromise = this.db
            .none('INSERT INTO tier_stats(region, patch, tier, matches, gameskilledriftherald, winsfirstriftherald, gameskilledbaron, winsfirstbaron, winsfirstinhibitor, winsfirstblood, winsfirsttower, winsfirstdragon, baronkills, dragonkills, towerkills, visionscore, doublekills, triplekills, quadrakills, pentakills, wardsplaced, visionwardsbought, wardskilled, damagedealttoobjectives, damagedealttochampions, damagetaken, kills, assists, deaths, goldearned, minionskilled, gameduration) VALUES (${region}, ${patch}, ${tier}, 1, ${gamesKilledRiftHerald}, ${winsFirstRiftHerald}, ${gamesKilledBaron}, ${winsFirstBaron}, ${winsFirstInhibitor}, ${winsFirstBlood}, ${winsFirstTower}, ${winsFirstDragon}, ${baronKills}, ${dragonKills}, ${towerKills}, ${visionScore}, ${doubleKills}, ${tripleKills}, ${quadraKills}, ${pentaKills}, ${wardsPlaced}, ${visionWardsBought}, ${wardsKilled}, ${damageDealtToObjectives}, ${damageDealtToChampions}, ${damageTaken}, ${kills}, ${assists}, ${deaths}, ${goldEarned}, ${minionsKilled}, ${gameDuration}) ON CONFLICT(region, patch, tier) DO UPDATE SET matches = tier_stats.matches + 1, gameskilledriftherald = tier_stats.gameskilledriftherald + ${gamesKilledRiftHerald}, winsfirstriftherald = tier_stats.winsfirstriftherald + ${winsFirstRiftHerald}, gameskilledbaron = tier_stats.gameskilledbaron + ${gamesKilledBaron}, winsfirstbaron = tier_stats.winsfirstbaron + ${winsFirstBaron}, winsfirstinhibitor = tier_stats.winsfirstinhibitor + ${winsFirstInhibitor}, winsfirstblood = tier_stats.winsfirstblood + ${winsFirstBlood}, winsfirsttower = tier_stats.winsfirsttower + ${winsFirstTower}, winsfirstdragon = tier_stats.winsfirstdragon + ${winsFirstDragon}, baronkills = tier_stats.baronkills + ${baronKills}, dragonkills = tier_stats.dragonkills + ${dragonKills}, towerkills = tier_stats.towerkills + ${towerKills}, visionscore = tier_stats.visionscore + ${visionScore}, doublekills = tier_stats.doublekills + ${doubleKills}, triplekills = tier_stats.triplekills + ${tripleKills}, quadrakills = tier_stats.quadrakills + ${quadraKills}, pentakills = tier_stats.pentakills + ${pentaKills}, wardsplaced = tier_stats.wardsplaced + ${wardsPlaced}, visionwardsbought = tier_stats.visionwardsbought + ${visionWardsBought}, wardskilled = tier_stats.wardskilled + ${wardsKilled}, damagedealttoobjectives = tier_stats.damagedealttoobjectives + ${damageDealtToObjectives}, damagedealttochampions = tier_stats.damagedealttochampions + ${damageDealtToChampions}, damagetaken = tier_stats.damagetaken + ${damageTaken}, kills = tier_stats.kills + ${kills}, assists = tier_stats.assists + ${assists}, deaths = tier_stats.deaths + ${deaths}, goldearned = tier_stats.goldearned + ${goldEarned}, minionskilled = tier_stats.minionskilled + ${minionsKilled}, gameduration = tier_stats.gameduration + ${gameDuration} WHERE tier_stats.region = ${region} AND tier_stats.tier = ${tier} AND tier_stats.patch = ${patch}', {...stats.general, region: this.region })
            .catch((err) => logger.error(err))
          let roleStatsPromise = stats.players.reduce((promiseArr, player) => {
            let promise = this.db
              .none('INSERT INTO role_stats(region, patch, name, records, visionscore, doublekills, triplekills, quadrakills, pentakills, wardsplaced, visionwardsbought, wardskilled, damagedealttoobjectives, damagedealttochampions, damagetaken, kills, assists, deaths, goldearned, minionskilled) VALUES (${region}, ${patch}, ${role}, 1, ${visionScore}, ${doubleKills}, ${tripleKills}, ${quadraKills}, ${pentaKills}, ${wardsPlaced}, ${visionWardsBought}, ${wardsKilled}, ${damageDealtToObjectives}, ${damageDealtToChampions}, ${damageTaken}, ${kills}, ${assists}, ${deaths}, ${goldEarned}, ${minionsKilled}) ON CONFLICT(region, patch, name) DO UPDATE SET records = role_stats.records + 1, visionscore = role_stats.visionscore + ${visionScore}, doublekills = role_stats.doublekills + ${doubleKills}, triplekills = role_stats.triplekills + ${tripleKills}, quadrakills = role_stats.quadrakills + ${quadraKills}, pentakills = role_stats.pentakills + ${pentaKills}, wardsplaced = role_stats.wardsplaced + ${wardsPlaced}, visionwardsbought = role_stats.visionwardsbought + ${visionWardsBought}, wardskilled = role_stats.wardskilled + ${wardsKilled}, damagedealttoobjectives = role_stats.damagedealttoobjectives + ${damageDealtToObjectives}, damagedealttochampions = role_stats.damagedealttochampions + ${damageDealtToChampions}, damagetaken = role_stats.damagetaken + ${damageTaken}, kills = role_stats.kills + ${kills}, assists = role_stats.assists + ${assists}, deaths = role_stats.deaths + ${deaths}, goldearned = role_stats.goldearned + ${goldEarned}, minionskilled = role_stats.minionskilled + ${minionsKilled} WHERE role_stats.region = ${region} AND role_stats.name = ${role} AND role_stats.patch = ${patch}', {...player, region: this.region })
              .catch((err) => logger.error(err))
            return [...promiseArr, promise]
          }, [])
          let champStatsPromise = stats.players.reduce((promiseArr, player) => {
            let tier = stats.general.tier
            let playedIn = {
              playedInBronze: 0,
              playedInSilver: 0,
              playedInGold: 0,
              playedInPlatinum: 0,
              playedInDiamond: 0,
              playedInMaster: 0,
              playedInChallenger: 0
            }
            playedIn[`playedIn${tier[0].toUpperCase() + tier.substr(1)}`] = 1
            let promise = this.db
              .none('INSERT INTO champion_stats(region, patch, id, matches, wins, losses, visionscore, doublekills, triplekills, quadrakills, pentakills, wardsplaced, visionwardsbought, wardskilled, damagedealttoobjectives, damagedealttochampions, damagetaken, kills, assists, deaths, goldearned, minionskilled, playedinbronze, playedinsilver, playedingold, playedinplatinum, playedindiamond, playedinmaster, playedinchallenger, totalbanned, bannedinbronze, bannedinsilver, bannedingold, bannedinplatinum, bannedindiamond, bannedinmaster, bannedinchallenger) VALUES (${region}, ${patch}, ${championId}, 1, ${win}, ${lose}, ${visionScore}, ${doubleKills}, ${tripleKills}, ${quadraKills}, ${pentaKills}, ${wardsPlaced}, ${visionWardsBought}, ${wardsKilled}, ${damageDealtToObjectives}, ${damageDealtToChampions}, ${damageTaken}, ${kills}, ${assists}, ${deaths}, ${goldEarned}, ${minionsKilled}, ${playedInBronze}, ${playedInSilver}, ${playedInGold}, ${playedInPlatinum}, ${playedInDiamond}, ${playedInMaster}, ${playedInChallenger}, 0, 0, 0, 0, 0, 0, 0, 0) ON CONFLICT(region, patch, id) DO UPDATE SET matches = champion_stats.matches + 1, wins = champion_stats.wins + ${win}, losses = champion_stats.losses + ${lose}, visionscore = champion_stats.visionscore + ${visionScore}, doublekills = champion_stats.doublekills + ${doubleKills}, triplekills = champion_stats.triplekills + ${tripleKills}, quadrakills = champion_stats.quadrakills + ${quadraKills}, pentakills = champion_stats.pentakills + ${pentaKills}, wardsplaced = champion_stats.wardsplaced + ${wardsPlaced}, visionwardsbought = champion_stats.visionwardsbought + ${visionWardsBought}, wardskilled = champion_stats.wardskilled + ${wardsKilled}, damagedealttoobjectives = champion_stats.damagedealttoobjectives + ${damageDealtToObjectives}, damagedealttochampions = champion_stats.damagedealttochampions + ${damageDealtToChampions}, damagetaken = champion_stats.damagetaken + ${damageTaken}, kills = champion_stats.kills + ${kills}, assists = champion_stats.assists + ${assists}, deaths = champion_stats.deaths + ${deaths}, goldearned = champion_stats.goldearned + ${goldEarned}, minionskilled = champion_stats.minionskilled + ${minionsKilled}, playedinbronze = champion_stats.playedinbronze + ${playedInBronze}, playedinsilver = champion_stats.playedinsilver + ${playedInSilver}, playedingold = champion_stats.playedingold + ${playedInGold}, playedinplatinum = champion_stats.playedinplatinum + ${playedInPlatinum}, playedindiamond = champion_stats.playedindiamond + ${playedInDiamond}, playedinmaster = champion_stats.playedinmaster + ${playedInMaster}, playedinchallenger = champion_stats.playedinchallenger + ${playedInChallenger} WHERE champion_stats.region = ${region} AND champion_stats.id = ${championId} AND champion_stats.patch = ${patch}', {...player, region: this.region, ...playedIn})
              .catch((err) => logger.error(err))
            return [...promiseArr, promise]
          }, [])
          let bannedChampStatsPromise = stats.bans.reduce((promiseArr, championId) => {
            let tier = stats.general.tier
            let bannedIn = {
              bannedInBronze: 0,
              bannedInSilver: 0,
              bannedInGold: 0,
              bannedInPlatinum: 0,
              bannedInDiamond: 0,
              bannedInMaster: 0,
              bannedInChallenger: 0
            }
            bannedIn[`bannedIn${tier[0].toUpperCase() + tier.substr(1)}`] = 1
            let promise = this.db
              .none('INSERT INTO champion_stats(region, patch, id, matches, wins, losses, visionscore, doublekills, triplekills, quadrakills, pentakills, wardsplaced, visionwardsbought, wardskilled, damagedealttoobjectives, damagedealttochampions, damagetaken, kills, assists, deaths, goldearned, minionskilled, playedinbronze, playedinsilver, playedingold, playedinplatinum, playedindiamond, playedinmaster, playedinchallenger, totalbanned, bannedinbronze, bannedinsilver, bannedingold, bannedinplatinum, bannedindiamond, bannedinmaster, bannedinchallenger) VALUES (${region}, ${patch}, ${championId}, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, ${bannedInBronze}, ${bannedInSilver}, ${bannedInGold}, ${bannedInPlatinum}, ${bannedInDiamond}, ${bannedInMaster}, ${bannedInChallenger}) ON CONFLICT(region, patch, id) DO UPDATE SET totalBanned = champion_stats.totalBanned + 1, bannedinbronze = champion_stats.bannedinbronze + ${bannedInBronze}, bannedinsilver = champion_stats.bannedinsilver + ${bannedInSilver}, bannedingold = champion_stats.bannedingold + ${bannedInGold}, bannedinplatinum = champion_stats.bannedinplatinum + ${bannedInPlatinum}, bannedindiamond = champion_stats.bannedindiamond + ${bannedInDiamond}, bannedinmaster = champion_stats.bannedinmaster + ${bannedInMaster}, bannedinchallenger = champion_stats.bannedinchallenger + ${bannedInChallenger} WHERE champion_stats.region = ${region} AND champion_stats.id = ${championId} AND champion_stats.patch = ${patch}', {championId, region: this.region, tier: stats.general.tier, patch: stats.general.patch, ...bannedIn})
            .catch((err) => logger.error(err))
            return [...promiseArr, promise]
          }, [])
          let promise = Promise.all([
            patchStatsPromise,
            tierStatsPromise,
            roleStatsPromise,
            champStatsPromise,
            bannedChampStatsPromise
          ])
          return [...promiseArr, promise]
        }, [])
        return Promise.all(promises)
      })
      .then(() => logger.info('Stats were updated'))
      .catch(err => logger.error(`Error updating stats:\n ${err}`))
  }

  static getPatchStats() {
    return this.db
      .any('SELECT * FROM patch_stats')
      .then(patchStats => {
        let patches = patchStats.map(patchStat => patchStat.patch)
        let sortedPatches = utils.sortVersions(patches)
        let currentPatchStats = patchStats.find(patchStat => patchStat.patch === sortedPatches[0])
        let oldPatchStats = patchStats.find(patchStat => patchStat.patch === sortedPatches[1])
        return [currentPatchStats, oldPatchStats]
      })
      .catch(err => logger.error(`Error getting patchStats:\n${err}`))
  }

  static getTierStats() {
    return this.db
      .any('SELECT * FROM tier_stats')
      .then(tierStats => {
        let patches = new Set()
        tierStats.forEach(tierStat => patches.add(tierStat.patch))
        let sortedPatches = utils.sortVersions(Array.from(patches))
        return tierStats.filter(tierStat => tierStat.patch === sortedPatches[0])
      })
      .catch(err => logger.error(`Error getting tierStats:\n${err}`))
  }

  static getChampStats() {
    return this.db
      .any('SELECT * FROM champion_stats')
      .then(champStats => {
        // Needs to be done on client-side
        let patches = new Set()
        champStats.forEach(champStat => patches.add(champStat.patch))

        let sortedPatches = utils.sortVersions(Array.from(patches))

        let [currentPatchChampStats, oldPatchChampStats] = [champStats.filter(champ => champ.patch === sortedPatches[0]),
                                                            champStats.filter(champ => champ.patch === sortedPatches[1])]

        return [currentPatchChampStats, oldPatchChampStats]

      })
      .catch(err => logger.error(`Error getting champStats:\n${err}`))
  }

  static getRoleStats() {
    return this.db
      .any('SELECT * FROM role_stats')
      .then(roleStats => {
        let patches = new Set()
        roleStats.forEach(roleStat => patches.add(roleStat.patch))
        let sortedPatches = utils.sortVersions(Array.from(patches))
        return roleStats.filter(roleStat => roleStat.patch === sortedPatches[0])
      })
      .catch(err => logger.error(`Error getting roleStats:\n${err}`))
  }

}

module.exports = DB
