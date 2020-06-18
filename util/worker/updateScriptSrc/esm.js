import { workerData, parentPort } from 'worker_threads'
import {
  getScriptRegExp,
  getV2ScriptRegExp,
  getPublicPathExp,
} from '../../regexp'
import { TYPES } from '../../types'
import { readAsync } from '../../share'

async function index() {
  const { type, file, chunkCdnMap } = workerData
  if (type !== TYPES.updateScriptSrc) {
    return
  }
  const newContent = await esm(file, chunkCdnMap)
  parentPort.postMessage({
    file,
    content: newContent,
    type: TYPES.updateScriptSrc,
  })
}
index().catch(console.error)

async function esm(file, chunkCdnMap) {
  const content = await readAsync(file)
  let newContent = content
  // update chunkMap
  const isV1ChunkSyntax = getScriptRegExp().test(content)
  const isV2ChunkSyntax = !isV1ChunkSyntax && getV2ScriptRegExp().test(content)
  if (isV1ChunkSyntax || isV2ChunkSyntax) {
    let regExp = getV2ScriptRegExp()
    if (isV1ChunkSyntax && !isV2ChunkSyntax) {
      regExp = getScriptRegExp()
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
