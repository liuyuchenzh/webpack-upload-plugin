const { workerData, parentPort } = require('worker_threads')
const { normalize, generateLocalPathReg, readAsync } = require('../../share')
const { TYPES } = require('../../types')

async function index() {
  const newContent = await replace(workerData)
  parentPort.postMessage({ type: TYPES.replaceContent, content: newContent })
}
index().catch((e) => {
  throw e
})

/**
 *
 * @param option
 * @param {string} option.srcPath
 * @param {object} option.localCdnPair
 * @return {Promise<string>}
 */
async function replace(option = {}) {
  const { srcPath, localCdnPair } = option
  const content = await readAsync(srcPath)
  return localCdnPair.reduce((last, file) => {
    const localPath = normalize(file[0])
    const cdnPath = file[1]
    const localPathReg = generateLocalPathReg(localPath)
    last = last.replace(localPathReg, (_, prefix) => {
      return `${prefix}${cdnPath}`
    })
    return last
  }, content)
}
