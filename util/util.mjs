import path from 'path'
import fs from 'fs'
import fse from 'fs-extra'
import { read, write } from './io.mjs'
import {
  getCssChunksRegExp,
  getCssHrefRegExp,
  getScriptRegExp,
  getPublicPathExp
} from './regexp.mjs'
import { isFile, isDir, isType } from './status.mjs'
import { logErr } from './log.mjs'
import { name as pjName } from './static.mjs'

const DEFAULT_SEP = '/'
const FILTER_OUT_DIR = ['.idea', '.vscode', '.gitignore', 'node_modules']

// 1. gather html file
// 2. gather production file
// 3. upload all production file
// 4. find the usage of production file in html file
// 5. if found, replace

// type related
const imgTypeArr = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'ico']
const fontTypeArr = ['woff', 'woff2', 'ttf', 'oft', 'svg', 'eot']
const isCss = isType('css')
const isJs = isType('js')
const isOneOfType = (types = ['']) => file =>
  types.some(type => isType(type)(file))

function isFont(path) {
  return fontTypeArr.some(type => isType(type)(path))
}

function isImg(path) {
  return imgTypeArr.some(type => isType(type)(path))
}

/**
 *
 * @param {string[]} input
 * @return {string}
 */
function resolve(...input) {
  return path.resolve(...input)
}

/**
 * @param {string} input
 * @param {string=} [sep=DEFAULT_SEP]
 * @return {string}
 */
function normalize(input, sep = DEFAULT_SEP) {
  const _input = path.normalize(input)
  return _input.split(path.sep).join(sep)
}

/**
 * @param {string} input
 * @return {boolean}
 */
function isFilterOutDir(input) {
  return FILTER_OUT_DIR.includes(input)
}

/**
 * remove publicPath from webpack config
 * @param {string} publicPath
 * @return {function(string): string}
 */
const handlePublicPath = publicPath => content => {
  // match strictly
  const regStr = publicPath
    .split(DEFAULT_SEP)
    .filter(item => !!item)
    .map(part => {
      if (/\./.test(part)) {
        return part.replace(/\.+/g, match =>
          match
            .split('')
            .map(dot => '\\' + dot)
            .join('')
        )
      }
      return part
    })
    .join('\\/')
  const refinedRegStr = `([(=]['"]?)${regStr}`
  const reg = new RegExp(refinedRegStr, 'g')
  return content.replace(reg, (_, prefix) => (prefix ? prefix : ''))
}

/**
 * given localPath, return string to form matching RegExp
 * @param {string} localPath
 * @returns {string}
 */
function generateLocalPathStr(localPath) {
  const pathArr = localPath.split(DEFAULT_SEP)
  const len = pathArr.length
  return pathArr
    .map((part, index) => {
      if (index === len - 1) {
        return `${part}`
      } else {
        return `\\.?(${part})?`
      }
    })
    .join(`\\${DEFAULT_SEP}?`)
}

/**
 * produce RegExp to match local path
 * @param {string} localPath
 * @return {RegExp}
 */
function generateLocalPathReg(localPath) {
  const content = generateLocalPathStr(localPath)
  const prefix = `([(=+,]\\s*['"]?)`
  // using prefix to strictly match resource reference
  // like src="", url(""), a = "", srcset="xxx.jpg 100w, xxx@2.jpg 200w"
  return new RegExp(`${prefix}${content}`, 'g')
}

/**
 * find file usage
 * 1. make sure the range: srcPath
 * 2. provide inline path to search and to replace with: localCdnPair
 * @param {string} srcPath
 * @param {string=} distPath
 * @param {function=} replaceFn
 * @param {boolean=} [copyWhenUntouched=true] copy file even if the content remains the same
 * @return {function}
 */
function simpleReplace(
  srcPath,
  distPath = srcPath,
  replaceFn = input => input,
  copyWhenUntouched = true
) {
  const srcFile = read(srcPath)
  return function savePair(localCdnPair) {
    const ret = localCdnPair.reduce((last, file) => {
      const localPath = normalize(file[0])
      const cdnPath = file[1]
      const localPathReg = generateLocalPathReg(localPath)
      last = replaceFn(last, srcPath).replace(
        localPathReg,
        (_, prefix) => `${prefix}${cdnPath}`
      )
      return last
    }, srcFile)
    // no such path > force copy > content change
    const toCopy =
      !fs.existsSync(distPath) || copyWhenUntouched || ret !== srcFile
    if (toCopy) {
      fse.ensureFileSync(distPath)
      write(distPath)(ret)
    }
  }
}

/**
 * gather specific file type within directory provided
 * 1. provide range to search: src
 * 2. provide the type of file to search: type
 * @param {string} src: directory to search
 * @return {function}
 */
function gatherFileIn(src) {
  return function gatherFileType(type) {
    return fs.readdirSync(src).reduce((last, file) => {
      const filePath = resolve(src, file)
      if (isFile(filePath)) {
        path.extname(file) === `.${type}` && last.push(normalize(filePath))
      } else if (isFilterOutDir(file)) {
        // do nothing
      } else if (isDir(filePath)) {
        last = last.concat(gatherFileIn(filePath)(type))
      }
      return last
    }, [])
  }
}

/**
 * make sure urlCb is applied for all cdn results
 * @param {function(string): string} cb
 * @return {function(string[]|{[string]:string}):[string, string][]}
 */
const handleCdnRes = cb => entries => {
  if (typeof cb !== 'function') return logErr(`urlCb is not function`)
  const isArr = Array.isArray(entries)
  // if not array, handle as {[localLocation]: [cdnUrl]}
  const target = isArr ? entries : Object.entries(entries)
  return target.map(pair => {
    // pair[1] should be cdn url
    // pass local path as well
    pair[1] = cb(pair[1], pair[0])
    if (typeof pair[1] !== 'string')
      logErr(`the return result of urlCb is not string`)
    return pair
  })
}

/**
 * given file path, src root and dist root, return file path in dist root
 * @param {string} srcFilePath
 * @param {string} srcRoot
 * @param {string} distRoot
 * @return {string}
 */
function mapSrcToDist(srcFilePath, srcRoot, distRoot) {
  return srcFilePath.replace(srcRoot, distRoot)
}

/**
 * generate {id: name} object for all chunk chunk
 * @param {{id: string, name:string,renderedHash: string, contentHash: string}[]} chunks
 * @param {string} chunkFileName
 */
function gatherChunks(chunks, chunkFileName) {
  return chunks.reduce((last, chunk) => {
    if (/\[hash(:\d+)?]/.test(chunkFileName)) {
      throw new Error(
        `[${pjName}]: Do NOT use [hash] as output filename! Use [chunkhash] or [contenthash] instead`
      )
    }
    const { id, name, renderedHash, contentHash } = chunk
    // handle slice properly
    const handleLen = source => (match, len) => {
      if (len) {
        return source.slice(0, +len.slice(1))
      }
      return source
    }
    const handleChunkHash = handleLen(renderedHash)
    // handle webpack@4 as well as <4
    const handleContentHash = handleLen(
      contentHash ? contentHash.javascript : renderedHash
    )
    last[id] = chunkFileName
      .replace(/\[name]/g, name || `${id}`)
      .replace(/\[id]/g, `${id}`)
      .replace(/\[chunkhash(:\d+)?]/g, handleChunkHash)
      .replace(/\[contenthash(:\d+)?]/g, handleContentHash)
    return last
  }, {})
}

/**
 * whether chunk is "entry" (common chunks is also considered as "entry")
 * @param {string} js
 * @returns {boolean}
 */
function isEntryChunk(js) {
  const content = read(js)
  return getScriptRegExp().test(content)
}

/**
 * convert object to array
 * @param {object} obj
 * @returns {*[]}
 */
function getObjValueArray(obj) {
  return Object.values(obj)
}

/**
 * update script.src property for request for dynamic import
 * experimental
 * @param {string[]} files
 * @param {{id: string}} chunkCdnMap
 */
function updateScriptSrc(files, chunkCdnMap) {
  // if no new map was formed, then keep the way it is
  const len = Object.keys(chunkCdnMap).length
  if (!len) return
  files.forEach(file => {
    const content = read(file)
    let newContent = content
    // update chunkMap
    if (getScriptRegExp().test(content)) {
      newContent = newContent.replace(getScriptRegExp(), (match, id) => {
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
    write(file)(newContent)
  })
}

/**
 * Handle async CSS files extracted by mini-css-extract-plugin
 * @param {string[]} chunkFiles
 * @param {[string, string][]} cssMap
 * @param {string} publicPath
 */
function updateCssLoad(chunkFiles, cssMap, publicPath) {
  const keys = cssMap.map(([local]) => local)
  chunkFiles.forEach(file => {
    const content = read(file)
    let newContent = content
    const match = content.match(getCssChunksRegExp())
    if (match) {
      const [, map] = match
      newContent = newContent.replace(getCssHrefRegExp(), hrefMatch => {
        // get the new cssMap with {chunkId, href} structure
        // where chunkId is the id for the css file, and href is the cdn url
        const fnBody = `
            const map = ${map};
            return Object.keys(map).map(chunkId => {
              ${hrefMatch};
              const newHref = href.replace(/^\\./, "");
              return {chunkId, href: newHref, rawHref: href};
            })
          `
        const hrefArr = new Function(fnBody)()
        // convert to {[chunkId]: href} structure
        const cssChunkIdCdnMap = hrefArr.reduce(
          (last, { chunkId, href, rawHref }) => {
            const localIndex = keys.findIndex(key => key.indexOf(href) > -1)
            if (localIndex < 0) {
              // use the original href when not found from cdn result
              // since __webpack_require__.p will be set to ""
              // publicPath is added here
              // reason: var fullhref = __webpack_require__.p + href;
              last[chunkId] = publicPath + rawHref
              return last
            }
            last[chunkId] = cssMap[localIndex][1]
            return last
          },
          {}
        )
        // cannot form new Map, return the original one
        if (!Object.keys(cssChunkIdCdnMap).length) {
          return hrefMatch
        }
        const newCssMap = JSON.stringify(cssChunkIdCdnMap)
        return `var href = ${newCssMap}[chunkId];`
      })
      // update js entry file with new cssMap
      write(file)(newContent)
    }
  })
}

/**
 * get id of chunk given a absolute path of chunk file and id:chunk map
 * @param {string} chunkAbsPath
 * @param {{id: string}} chunkMap
 * @returns {string|number}
 */
function getIdForChunk(chunkAbsPath, chunkMap) {
  return Object.keys(chunkMap).find(
    key => chunkAbsPath.indexOf(chunkMap[key]) > -1
  )
}

/**
 * make assets object to array with local path
 * @param {{[string]: {existsAt: string}}} asset
 * @returns {string[]}
 */
function getExistsAtFromAsset(asset) {
  return Object.keys(asset).map(name => {
    const info = asset[name]
    return info.existsAt
  })
}

export {
  resolve,
  simpleReplace,
  handlePublicPath,
  updateScriptSrc,
  updateCssLoad,
  isEntryChunk,
  getIdForChunk,
  gatherChunks,
  getObjValueArray,
  handleCdnRes,
  mapSrcToDist,
  gatherFileIn,
  isJs,
  isCss,
  isImg,
  isFont,
  isOneOfType,
  imgTypeArr,
  fontTypeArr,
  getExistsAtFromAsset
}
