import { name as pjName } from './static.mjs'

/**
 * log information
 * @param {*} msg
 */
export function log(msg) {
  console.log(`[${pjName}]: ${msg}`)
}

/**
 * log error
 * @param msg
 */
export function logErr(msg) {
  console.error(`[${pjName}]: ${msg}`)
}
