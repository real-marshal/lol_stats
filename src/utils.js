const utils = (() => {
  return {

    sortVersions(versions) {
      let sortedByMajorVersion = versions.sort((a,b) => parseFloat(b.split('.')[0]) - parseFloat(a.split('.')[0]))

      let currentMajorVersion = sortedByMajorVersion[0].split('.')[0]
      let oldMajorVersion = sortedByMajorVersion[1].split('.')[0]

      let currentMinorVersions = sortedByMajorVersion.filter(version => version.split('.')[0] === currentMajorVersion)
      let oldMinorVersions = sortedByMajorVersion.filter(version => version.split('.')[0] === oldMajorVersion)

      currentMinorVersions.sort((a,b) => parseFloat(b.split('.')[1]) - parseFloat(a.split('.')[1]))
      oldMinorVersions.sort((a,b) => parseFloat(b.split('.')[1]) - parseFloat(a.split('.')[1]))

      let sortedPatches = []
      if (currentMinorVersions.length === 1) {
        sortedPatches.push(currentMinorVersions[0])
        sortedPatches.push(oldMinorVersions[0])
      } else {
        sortedPatches.push(currentMinorVersions[0])
        sortedPatches.push(currentMinorVersions[1])
      }
      return sortedPatches
    }

  }
})()

module.exports = utils
