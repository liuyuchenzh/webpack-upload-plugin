const { name: pjName } = require('./static')

/**
 * log information
 * @param {*} msg
 */
function log(msg) {
  console.log(`[${pjName}]: ${msg}`)
}

/**
 * log error
 * @param msg
 */
function logErr(msg) {
  console.error(`[${pjName}]: ${msg}`)
}

module.exports = {
  log,
  logErr,
}
