const fs = require('fs')
const Cache = require('./cache.js')
const read = location => fs.readFileSync(location, 'utf-8')

/**
 * @typedef {(files: string[], option: object=) => Promise<object>} upload
 */

/**
 * @typedef {object} Cdn
 * @property {upload} upload
 */

/**
 * compatible API for cdn when enable cache
 * @param {Cdn} cdn
 * @param {object=} option passToCdn needs to be saved
 * @returns {Cdn}
 */
const compatUpload = (cdn, option = {}) => {
  // save option
  Cache.saveOption(option)
  const upload = async files => {
    const { toUpload, pairFromCache, localHashMap } = files.reduce(
      (last, file) => {
        const fileContent = read(file)
        const hash = Cache.getHash(fileContent)
        if (Cache.shouldUpload(hash)) {
          return Object.assign(last, {
            toUpload: last.toUpload.concat(file),
            localHashMap: Object.assign(last.localHashMap, { [file]: hash })
          })
        }
        return Object.assign(last, {
          pairFromCache: Object.assign(last.pairFromCache, {
            [file]: Cache.getUrl(hash)
          })
        })
      },
      {
        localHashMap: {},
        toUpload: [],
        pairFromCache: {}
      }
    )
    const res = toUpload.length
      ? await cdn.upload(toUpload)
      : await Promise.resolve({})
    // new pair to cache
    const newPair = Object.entries(res).reduce((_, [localPath, cdnUrl]) => {
      const hash = localHashMap[localPath]
      return Cache.update(hash, cdnUrl)
    }, {})
    // update cache
    Cache.end(newPair)
    return Object.assign(res, pairFromCache)
  }
  return {
    upload
  }
}

module.exports = compatUpload
