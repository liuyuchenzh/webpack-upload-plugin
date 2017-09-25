const fs = require('fs')
const fse = require('fs-extra')
const path = require('path')
const name = require('./package.json').name
const DEFAULT_SEP = '/'
const FILTER_OUT_DIR = ['.idea', '.vscode', '.gitignore', 'node_modules']
const SCRIPT_SRC_MATCH = /script\.src\s*=\s*__webpack_require__\.p[^;]+;?/g
const DEFAULT_OPTION = {
  src: resolve('src'),
  dist: resolve('src'),
  resolve: ['html'],
  urlCb (input) {
    return input
  }
}

// 1. gather html file
// 2. gather production file
// 3. upload all production file
// 4. find the usage of production file in html file
// 5. if found, replace

function resolve (...input) {
  return path.resolve(...input)
}

function normalize (input, sep = DEFAULT_SEP) {
  const _input = path.normalize(input)
  return _input.split(path.sep).join(sep)
}

function join (...inputs) {
  return normalize(path.join(...inputs))
}

function isFilterOutDir (input) {
  return FILTER_OUT_DIR.includes(input)
}

/**
 * produce RegExp to match local path
 * @param {string} localPath
 * @return {RegExp}
 */
function generateLocalPathReg (localPath) {
  const pathArr = localPath.split(DEFAULT_SEP)
  const len = pathArr.length
  const regStr = pathArr
    .map((part, index) => {
      if (index === len - 1) {
        return `${part}`
      } else {
        return `\\.?(${part})?`
      }
    })
    .join(`\\${DEFAULT_SEP}?`)
  return new RegExp(regStr, 'g')
}

/**
 * find file usage
 * 1. make sure the range: srcPath
 * 2. provide inline path to search and to replace with: localCdnPair
 * @param {string} srcPath
 * @param {string} distPath
 * @return {function}
 */
function simpleReplace (srcPath, distPath = srcPath) {
  const srcFile = fs.readFileSync(srcPath, 'utf-8')
  return function savePair (localCdnPair) {
    const ret = localCdnPair.reduce((last, file) => {
      const localPath = normalize(file[0])
      const cdnPath = file[1]
      const localPathReg = generateLocalPathReg(localPath)
      last = last.replace(localPathReg, match => cdnPath)
      return last
    }, srcFile)
    fse.ensureFileSync(distPath)
    fs.writeFileSync(distPath, ret)
  }
}

/**
 * gather specific file type within directory provided
 * 1. provide range to search: src
 * 2. provide the type of file to search: type
 * @param {string} src: directory to search
 * @return {function}
 */
function gatherFileIn (src) {
  return function gatherFileType (type) {
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

function isFile (input) {
  return fs.statSync(input).isFile()
}

function isDir (input) {
  return fs.statSync(input).isDirectory()
}

function isType (type) {
  return function enterFile (file) {
    return isFile(file) && path.extname(file) === '.' + type
  }
}

/**
 * give the power of playing with cdn url
 * @param {*[] | Iterator<*>} entries
 * @param {function} cb
 * @returns {[string, string][]}
 */
function processCdnUrl (entries, cb) {
  if (typeof cb !== 'function')
    return console.error(`[${name}]: urlCb is not function`)
  return entries.map(pair => {
    // pair[1] should be cdn url
    pair[1] = cb(pair[1])
    if (typeof pair[1] !== 'string')
      console.error(`[${name}]: the return result of urlCb is not string`)
    return pair
  })
}

function mapSrcToDist (srcFilePath, srcRoot, distRoot) {
  return srcFilePath.replace(srcRoot, distRoot)
}

const isJpg = isType('jpg')
const isPng = isType('png')
const isGif = isType('gif')
const isWebp = isType('webp')
const isCss = isType('css')
const isJs = isType('js')
const isWoff = isType('woff')
const isWoff2 = isType('woff2')
const isTtf = isType('ttf')
const isOtf = isType('otf')
const isSvg = isType('svg')

function isFont (path) {
  return (
    isWoff(path) || isWoff2(path) || isTtf(path) || isOtf(path) || isSvg(path)
  )
}

/**
 * generate {id: name} object for all chunk chunk
 * @param {*[]} chunks
 * @param {string} chunkFileName
 */
function gatherChunks (chunks, chunkFileName) {
  return chunks.reduce((last, chunk) => {
    const id = chunk.id
    const name = chunk.name
    const hash = chunk.renderedHash
    last[id] = chunkFileName
      .replace(/\[name]/g, name || id)
      .replace(/\[hash]/g, hash)
    return last
  }, {})
}

/**
 * update script.src property for request for dynamic import
 * experimental
 * @param {string[]} files
 * @param {{id: string}} chunkCdnMap
 */
function updateScriptSrc (files, chunkCdnMap) {
  files.forEach(file => {
    const content = fs.readFileSync(file, 'utf-8')
    if (SCRIPT_SRC_MATCH.test(content)) {
      const srcAssignStr = `script.src = ${JSON.stringify(
        chunkCdnMap
      )}[chunkId];`
      const newContent = content.replace(SCRIPT_SRC_MATCH, srcAssignStr)
      fs.writeFileSync(file, newContent)
    }
  })
}

/**
 * get id of chunk given a absolute path of chunk file and id:chunk map
 * @param {string} chunkAbsPath
 * @param {{id: string}} chunkMap
 */
function getIdForChunk (chunkAbsPath, chunkMap) {
  return Object.keys(chunkMap).findIndex(
    key => chunkAbsPath.indexOf(chunkMap[key]) > -1
  )
}

/**
 * webpack upload plugin
 * early version need more work
 * @param {{upload: Promise}} cdn
 * custom cdn module, need to have an upload API, return a Promise with structured response
 * like {localPath: cdnPath}
 * @param {{src: string, dist: string}} option
 * provide information about what the source html directory and compiled html directory
 * @constructor
 */
function UploadPlugin (cdn, option = DEFAULT_OPTION) {
  this.cdn = cdn
  this.option = Object.assign({}, DEFAULT_OPTION, option)
}

UploadPlugin.prototype.apply = function (compiler) {
  const self = this
  // extra treatment for cdnUrl
  const urlCb = this.option.urlCb
  // could process other type of files rather than limited to html
  const resolveList = this.option.resolve
  // get absolute path of src and dist directory
  const srcRoot = resolve(this.option.src)
  const distRoot = resolve(this.option.dist)

  compiler.plugin('done', async function (stats) {
    const chunks = stats.compilation.chunks
    const options = stats.compilation.options

    // here we get chunks needs to be dealt with
    const chunkMap = gatherChunks(chunks, options.output.chunkFilename)

    // all assets including js/css/img
    const assets = stats.compilation.assets
    const assetsNames = Object.keys(assets)
    // classify assets
    const desireAssets = assetsNames.reduce(
      (last, name) => {
        const assetInfo = assets[name]
        const location = assetInfo.existsAt
        if (
          isGif(location) ||
          isPng(location) ||
          isJpg(location) ||
          isWebp(location)
        ) {
          last.img[name] = assetInfo
        } else if (isCss(location)) {
          last.css[name] = assetInfo
        } else if (isJs(location)) {
          last.js[name] = assetInfo
        } else if (isFont(location)) {
          last.font[name] = assetInfo
        }
        return last
      },
      {
        img: {},
        css: {},
        js: {},
        font: {}
      }
    )

    const {img, css, js, font} = desireAssets

    // make assets object to array with local path
    function makeArr (input) {
      return Object.keys(input).map(name => {
        const info = input[name]
        return info.existsAt
      })
    }

    const imgArr = makeArr(img)
    const fontArr = makeArr(font)
    const jsArr = makeArr(js)
    const chunkLen = Object.keys(chunkMap).length
    const chunkArr = Array.from(
      Object.assign({}, chunkMap, {
        length: chunkLen
      })
    )

    // find out which js files are chunk chunk, which are not
    const {notChunkJsArr, chunkArrWAbs} = jsArr.reduce(
      (last, js) => {
        const isChunk = chunkArr.some(chunk => js.indexOf(chunk) > -1)
        isChunk ? last.chunkArrWAbs.push(js) : last.notChunkJsArr.push(js)
        return last
      },
      {
        notChunkJsArr: [],
        chunkArrWAbs: []
      }
    )

    // upload img/font
    // find img/font in css
    // replace css
    // now css ref to img/font with cdn path
    // meanwhile upload chunk files to save time
    const [imgAndFontPairs, chunkPairs] = await Promise.all([
      self.cdn.upload([...imgArr, ...fontArr]),
      self.cdn.upload(chunkArrWAbs)
    ])
    // update css files with cdn img/font
    Object.keys(css).forEach(name => {
      const location = css[name].existsAt
      simpleReplace(location)(
        processCdnUrl(Object.entries(imgAndFontPairs), urlCb)
      )
    })
    // update chunkMap
    const newChunkMap = processCdnUrl(
      Object.entries(chunkPairs),
      urlCb
    ).reduce((last, entry) => {
      const localPath = entry[0]
      const cdnPath = entry[1]

      const id = getIdForChunk(localPath, chunkMap)
      last[id] = cdnPath
      return last
    }, {})
    updateScriptSrc(notChunkJsArr, newChunkMap)

    // concat js + css + img
    const adjustedFiles = [...notChunkJsArr, ...makeArr(css), ...imgArr]
    const findFileInRoot = gatherFileIn(self.option.src)
    const tplFiles = resolveList.reduce((last, type) => {
      last = last.concat(findFileInRoot(type))
      return last
    }, [])
    const jsCssPair = await self.cdn.upload(adjustedFiles)
    const localCdnPair = Object.entries(jsCssPair)
    tplFiles.forEach(filePath => {
      simpleReplace(filePath, mapSrcToDist(filePath, srcRoot, distRoot))(
        processCdnUrl(localCdnPair, urlCb)
      )
    })
  })
}

module.exports = UploadPlugin
