const fs = require('fs')
const path = require('path')
const DEFAULT_SEP = '/'
const FILTER_OUT_DIR = ['.idea', '.vscode', '.gitignore', 'node_modules']
const DEFAULT_HTML_ROOT = {
  src: resolve('src'),
  dist: resolve('dist')
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
 * knowing the source html content
 * now we want to replace the inline path of local compiled sources to the corresponding cdn path
 * and write new html content to dist directory
 * mapFromSrcToDis aim to get the relationship between source html path and dist html path
 * and return the dist path based on the src path
 * @param {string} srcPath
 * @param {string} srcRoot
 * @param {string} distRoot
 * @return {string}
 */
function mapFromSrcToDist (srcPath, srcRoot, distRoot) {
  const _srcRoot = removeHeadPoint(normalize(srcRoot))
  const _distRoot = removeHeadPoint(normalize(distRoot))
  const _srcPath = normalize(srcPath)
  if (_srcRoot === '') {
    return _srcPath
      .split(DEFAULT_SEP)
      .reverse()
      .map((part, i) => {
        return i === 0 ? _distRoot + DEFAULT_SEP + part : part
      })
      .reverse()
      .join(DEFAULT_SEP)
  } else {
    return _srcPath.replace(_srcRoot, _distRoot)
  }
}

/**
 * remove the starting '.' from path
 * @param path
 */
function removeHeadPoint (path) {
  return path.replace(/^\.*\/?/, '')
}

/**
 *
 * @param {string} localPath
 * @return {RegExp}
 */
function generateLocalPathReg (localPath) {
  const pathArr = localPath
    .split(DEFAULT_SEP)
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
  return new RegExp(regStr)
}

/**
 * find file usage
 * 1. make sure the range: srcPath
 * 2. provide inline path to search and to replace with: localCdnPair
 * 3. provide basic information about src and dist path of the project: rootInfo
 * @param {string} srcPath
 * @return {function}
 */
function findUsageIn (srcPath) {
  const srcFile = fs.readFileSync(srcPath, 'utf-8')
  return function savePair (...localCdnPair) {
    return function generateCompiledFile (rootInfo) {
      localCdnPair
        .map(file => {
          const localPath = normalize(file[0])
          const cdnPath = file[1]
          const localPathReg = generateLocalPathReg(localPath)
          const distFile = srcFile.replace(localPathReg, match => cdnPath)
          const _distPath = mapFromSrcToDist(srcPath, rootInfo.src, rootInfo.dist)
          fs.writeFileSync(_distPath, distFile)
        })
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
function gatherFileIn (src) {
  return function gatherFileType (type) {
    return fs.readdirSync(src)
      .reduce((last, file) => {
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

/**
 * webpack cdn plugin
 * early version need more work
 * @param {{upload: Promise}} cdn
 * custom cdn module, need to have an upload API, return a Promise with structured response
 * like {localPath: cdnPath}
 * @param {{src: string, dist: string}} option
 * provide information about what the source html directory and compiled html directory
 * @constructor
 */
function CdnPlugin (cdn, option = DEFAULT_HTML_ROOT) {
  this.cdn = cdn
  this.option = Object.assign({}, DEFAULT_HTML_ROOT, option)
}

CdnPlugin.prototype.apply = function (compiler) {
  const self = this
  compiler.plugin('done', function (stats) {
    const hash = stats.compilation.hash
    const outputOptions = stats.compilation.outputOptions
    const entries = stats.compilation.entries
    const outputFileName = outputOptions.filename
    const outputFilePath = normalize(outputOptions.path)
    const outputFiles = entries
      .map(entry => {
        const chunk = Array.from(entry._chunks)[0]
        const data = {
          id: chunk.id,
          name: chunk.name,
          chunkhash: chunk.renderedHash,
          hash
        }
        return join(outputFilePath, outputFileName.replace(/\[(.*?)\]/g, (match, key) => data[key]))
      })
    const findFileInRoot = gatherFileIn(self.option.src)
    const htmlFiles = findFileInRoot('html')
    self.cdn
      .upload(outputFiles)
      .then(res => {
        const localCdnPair = Object.entries(res)
        htmlFiles
          .forEach(htmlFile => {
            findUsageIn(htmlFile)(...localCdnPair)(self.option)
          })
      })
  })
}

module.exports = CdnPlugin
