const { workerData, parentPort } = require('worker_threads')
const {
  getScriptRegExp,
  getV2ScriptRegExp,
  getV3ScriptRegExp,
  getPublicPathExp,
} = require('../../regexp')
const { TYPES } = require('../../types')
const { readAsync } = require('../../share')

async function index() {
  const { type, file, chunkCdnMap } = workerData
  if (type !== TYPES.updateScriptSrc) {
    return
  }
  const newContent = await updateScriptSrc(file, chunkCdnMap)
  parentPort.postMessage({
    file,
    content: newContent,
    type: TYPES.updateScriptSrc,
  })
}
index().catch(console.error)

async function updateScriptSrc(file, chunkCdnMap) {
  const content = await readAsync(file)
  let newContent = content
  // update chunkMap
  const isV1ChunkSyntax = getScriptRegExp().test(content)
  const isV2ChunkSyntax = !isV1ChunkSyntax && getV2ScriptRegExp().test(content)
  const isV3ChunkSyntax =
    !isV1ChunkSyntax && !isV2ChunkSyntax && getV3ScriptRegExp().test(content)
  if (isV1ChunkSyntax || isV2ChunkSyntax || isV3ChunkSyntax) {
    let regExp
    if (isV1ChunkSyntax) {
      regExp = getScriptRegExp()
    } else if (isV2ChunkSyntax) {
      regExp = getV2ScriptRegExp()
    } else if (isV3ChunkSyntax) {
      regExp = getV3ScriptRegExp()
    }
    newContent = newContent.replace(regExp, (match, id) => {
      if (!id) {
        return match
      }
      return `${JSON.stringify(chunkCdnMap)}[${id}];`
    })
  }
  // update publicPath
  if (getPublicPathExp().test(content)) {
    newContent = newContent.replace(
      getPublicPathExp(),
      `__webpack_require__.p = "";`
    )
  }
  return newContent
}
