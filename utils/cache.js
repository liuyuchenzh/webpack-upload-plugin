const path = require('path')
const fs = require('fs')
const fse = require('fs-extra')
const md5 = require('md5')
const location = path.resolve(__dirname, '../cache.json')
fse.ensureFileSync(location)
const cache = fs.readFileSync(location, 'utf-8').trim() || '{}'
// tricky part
// everything refer to this object
const cacheObj = JSON.parse(cache)
const OPTION_KEY = 'passToCdn'
// passToCdn from last time
const oldOption = cacheObj[OPTION_KEY] || ''

/**
 * update cache object
 * @param {object} obj
 * @returns {(key: string, cdnUrl: string) => object}
 */
const updateCacheObj = obj => (key, cdnUrl) => {
  obj[key] = cdnUrl
  return obj
}
const updateCache = updateCacheObj(cacheObj)
/**
 * get hash for file
 * @param {string} fileContent
 * @returns {string}
 */
const getHash = md5

/**
 * update cache file
 * @param {string|object} input
 * @returns {void}
 */
const updateCacheFile = (input = {}) => {
  const inputObj = typeof input === 'string' ? JSON.parse(input) : input
  const toSave = Object.assign(cacheObj, inputObj)
  fs.writeFileSync(location, JSON.stringify(toSave))
}

/**
 * whether has a record
 * if the option (passToCdn) has changed
 * consider as there is no valid record
 * @param {object} obj
 * @returns {(key: string) => boolean}
 */
const hasRecord = obj => key => {
  const newOption = getOption(obj)
  const sameOption = JSON.stringify(oldOption) === JSON.stringify(newOption)
  return sameOption && key in obj && obj[key] && typeof obj[key] === 'string'
}

const shouldUseCache = hasRecord(cacheObj)
/**
 * update cache object
 * @param {object} obj
 * @returns {(key: string) => any}
 */
const getUrlFromCache = obj => key => {
  return obj[key]
}
const getUrl = getUrlFromCache(cacheObj)

/**
 * save cdn option
 * @param {object} obj
 * @return {(option: object) => object}
 */
const saveOptionToCache = obj => option => {
  obj[OPTION_KEY] = option
  return obj
}

const saveOption = saveOptionToCache(cacheObj)

/**
 * to accurately get the new option (passToCdn)
 * needs to invoke this function after saveOption
 * @param {object=} obj
 * @returns {*}
 */
const getOption = (obj = cacheObj) => obj[OPTION_KEY]

const Cache = {
  update: updateCache,
  end: updateCacheFile,
  shouldUpload: key => !shouldUseCache(key),
  getUrl,
  getHash,
  saveOption,
  getOption,
  cacheObj
}

module.exports = Cache
