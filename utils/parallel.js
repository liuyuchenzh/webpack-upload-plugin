const LIMIT = 10

/**
 * slice array based on given limit
 * @param {number} limit
 * @returns {(files: string[]) => string[]}
 */
const slice = limit => files =>
  files.reduce((last, item, index) => {
    const i = Math.floor(index / limit)
    if (!last[i]) last[i] = []
    last[i].push(item)
    return last
  }, [])

const sliceLimit = slice(LIMIT)

/**
 * @typedef {(files: string[], option: object=) => Promise<object>} upload
 */

/**
 * @typedef {object} Cdn
 * @property {upload} upload
 */

/**
 * @param {Cdn} cdn
 * @returns {Cdn}
 */
module.exports = cdn => {
  const parallelCdn = {
    upload: async files => {
      const res = await Promise.all([
        ...sliceLimit(files).map(chunk => cdn.upload(chunk))
      ])
      return res.reduce((last, chunkRes) => {
        return {
          ...last,
          ...chunkRes
        }
      }, {})
    }
  }
  return parallelCdn
}
