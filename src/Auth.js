const crypto = require('crypto')

// Hashed credentials using SHA-256 written in hex format
const user = '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918'
const password = 'ef5cf4903c7a7cb68dfcc75ae69766d96ebd9d6e1027cdc527e49302bb6da763'

const authMiddleware = (req, res, next) => {

  if (req.get('Authorization')) {
    const authHeaderValues = req.get('Authorization').split(' ')
    const authMethod = authHeaderValues[0]
    const authCredentials = Buffer.from(authHeaderValues[1], 'base64')
    const [authUser, authPassword] = authCredentials.toString().split(':')

    let hash = crypto.createHash('sha256')
    hash.write(authUser)
    hash.end()
    let hashedAuthUser = hash.read().toString('hex')

    hash = crypto.createHash('sha256')
    hash.write(authPassword)
    hash.end()
    let hashedAuthPassword = hash.read().toString('hex')

    if (authMethod === 'Basic' && user === hashedAuthUser && password === hashedAuthPassword)
      return next()
  }
  res.set('WWW-Authenticate', 'Basic realm="admin"')
  res.sendStatus(401)
}

module.exports = authMiddleware
