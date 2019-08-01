import path from 'path'
import {
  parallel,
  compatCache,
  beforeUpload as beforeProcess
} from 'y-upload-utils'
import {
  resolve,
  simpleReplace,
  handlePublicPath,
  getExistsAtFromAsset,
  handleCdnRes,
  isCss,
  isEntryChunk,
  isFont,
  isImg,
  isJs,
  isOneOfType,
  imgTypeArr,
  fontTypeArr,
  gatherChunks,
  gatherFileIn,
  getIdForChunk,
  mapSrcToDist,
  getObjValueArray,
  updateCssLoad,
  updateScriptSrc
} from './util/util.mjs'
import { log, logErr } from './util/log.mjs'

/**
 * @typedef {function(string): string} urlCb
 */

/**
 * webpack upload plugin
 * early version need more work
 * @param {{upload: Promise}} cdn
 * custom cdn module, need to have an upload API, return a Promise with structured response
 * like {localPath: cdnPath}
 * @param {object} option
 * @param {string=} option.src
 * @param {string=} option.dist
 * @param {(function(string, string=) => string)=} option.urlCb
 * @param {function=} option.onFinish
 * @param {(function(string, string=) => string)=} option.replaceFn
 * @param {(function(string, string) => string)=} option.beforeUpload
 * @param {(string|string[])=} option.staticDir
 * @param {(function() => Promise<*>)=} option.waitFor
 * @param {boolean=} [option.dirtyCheck=false]
 * @param {boolean=} option.logLocalFiles
 * @param {object=} option.passToCdn
 * @param {boolean=} [option.enableCache=true]
 * @param {string=} option.cacheLocation
 * @param {number=} [option.sliceLimit=10]
 * @param {boolean=} option.forceCopyTemplate
 * @param {boolean=} [option.asyncCSS=true]
 * @param {boolean=} [option.smartAssMode=false]
 * @constructor
 */
function UploadPlugin(cdn, option = {}) {
  this.cdn = cdn
  this.option = option
}

UploadPlugin.prototype.apply = function(compiler) {
  const self = this
  const {
    urlCb = input => input,
    resolve: resolveList = ['html'],
    src = '',
    dist = src,
    onFinish = () => {},
    onError = () => {},
    logLocalFiles: logLocal = false,
    staticDir = '',
    replaceFn = input => input,
    beforeUpload,
    waitFor = () => Promise.resolve(true),
    dirtyCheck = false,
    passToCdn,
    enableCache = true,
    cacheLocation,
    sliceLimit,
    forceCopyTemplate,
    asyncCSS = true,
    smartAssMode = false
  } = this.option
  // get absolute path of src and dist directory
  let srcRoot = resolve(src)
  let distRoot = resolve(dist)
  let staticDirMut = staticDir
  let srcMut = src
  const getLocal2CdnObj = handleCdnRes(urlCb)
  const isTemplate = isOneOfType(resolveList)

  /**
   * update chunkMap to {[id: string|number]: cdnUrl}
   * @param {{[localPath: string]: string}} chunkPairs
   * @param {{[id: string|number]: string}} chunkMap
   * @param {*} start
   */
  function generateChunkMapToCDN(chunkPairs, chunkMap, start = {}) {
    return getLocal2CdnObj(chunkPairs).reduce((last, [localPath, cdnPath]) => {
      const id = getIdForChunk(localPath, chunkMap)
      last[id] = cdnPath
      return last
    }, start)
  }

  // wrap a new cdn object
  const rawCdn = {
    upload(files) {
      return self.cdn.upload(files, passToCdn)
    }
  }

  // log error for cache setup
  if (!enableCache && cacheLocation) {
    logErr(`'cacheLocation' provided while haven't set 'enableCache' to true`)
    logErr(`This won't enable cache`)
  }

  // wrap with parallel
  const paralleledCdn = parallel(rawCdn, { sliceLimit })

  // wrap with cache
  const wrappedCdn = enableCache
    ? compatCache(paralleledCdn, {
        passToCdn,
        cacheLocation
      })
    : paralleledCdn

  // wrap with beforeProcess
  // use beforeUpload properly
  const cdn = beforeProcess(wrappedCdn, beforeUpload)

  compiler.plugin('done', async function(stats) {
    try {
      // wait to handle extra logic
      await waitFor()
      const { chunks, options } = stats.compilation
      const {
        output: { publicPath = '', path: outputPath },
        optimization: { minimize, runtimeChunk } = {}
      } = options
      // early warning
      if (minimize === true) {
        log('WARNING! Set the optimization.minimize to false to make it works!')
      }
      if (publicPath) {
        log(
          'WARNING! publicPath is not empty, the plugin will try to handle it for you. But it is preferred to toggle it by yourself!'
        )
      }
      // try to be smart ass
      // which means assume all needed files is in the output.path from webpack
      if (smartAssMode) {
        srcRoot = outputPath
        distRoot = outputPath
        staticDirMut = outputPath
        srcMut = outputPath
      }
      // don't want to use publicPath since about to use cdn url
      const removePublicPath = handlePublicPath(publicPath)
      // actual replaceFn that gonna be used
      const refinedReplaceFn = (content, location) => {
        const type = path.extname(location)
        // only remove publicPath occurrence for css/template files
        // it's tricky to handle js files
        const removePublicPathTypes = ['.css', ...resolveList.map(t => `.${t}`)]
        const toRemove = removePublicPathTypes.includes(type)
        return replaceFn(
          toRemove ? removePublicPath(content) : content,
          location
        )
      }
      // if user offers staticDir
      // then only collect files from staticDir
      // instead of ones provided by webpack
      // if pass in an array, gather files recursively
      const gatherManualAssets = Array.isArray(staticDirMut)
        ? type => {
            return staticDirMut.reduce((last, dir) => {
              return [...last, ...gatherFileIn(dir)(type)]
            }, [])
          }
        : gatherFileIn(staticDirMut)
      const manualAssets = staticDirMut
        ? [...imgTypeArr, ...fontTypeArr, 'css', 'js', ...resolveList].reduce(
            (last, type) => {
              const files = gatherManualAssets(type)
              return files.reduce((fileLast, file) => {
                return Object.assign(fileLast, {
                  [file]: {
                    existsAt: file
                  }
                })
              }, last)
            },
            {}
          )
        : {}
      // here we get chunks needs to be dealt with
      const chunkMap = gatherChunks(chunks, options.output.chunkFilename)
      // all assets including js/css/img
      const { assets } = staticDirMut
        ? { assets: manualAssets }
        : stats.compilation
      const assetsNames = Object.keys(assets)
      // classify assets
      const desireAssets = assetsNames.reduce(
        (last, name) => {
          const assetInfo = assets[name]
          const location = assetInfo.existsAt
          if (isImg(location)) {
            last.img[name] = assetInfo
          } else if (isCss(location)) {
            last.css[name] = assetInfo
          } else if (isJs(location)) {
            last.js[name] = assetInfo
          } else if (isFont(location)) {
            last.font[name] = assetInfo
          } else if (isTemplate(location)) {
            last.html[name] = assetInfo
          }
          return last
        },
        {
          img: {},
          css: {},
          js: {},
          font: {},
          html: {}
        }
      )

      const { img, css, js, font, html } = desireAssets

      // warning if no template found but staticDirMut set
      if (staticDirMut && !Object.keys(html).length && !src) {
        log('WARNING!')
        log(
          "staticDir is set but haven't found any template files in those directories"
        )
        log('Try to use src filed to include your template files')
      }

      const imgArr = getExistsAtFromAsset(img)
      const fontArr = getExistsAtFromAsset(font)
      const jsArr = getExistsAtFromAsset(js)
      const cssArr = getExistsAtFromAsset(css)
      const htmlArr = getExistsAtFromAsset(html)
      const chunkArr = getObjValueArray(chunkMap)
      const commonChunksArr = jsArr.filter(isEntryChunk)
      // if provide with src
      // then use it
      // or use emitted html files
      const tplFiles = !srcMut
        ? htmlArr
        : resolveList.reduce((last, type) => {
            const findFileInRoot = gatherFileIn(srcMut)
            last = last.concat(findFileInRoot(type))
            return last
          }, [])

      // find out which js files are chunk chunk, common chunk, or entry
      const { notChunkJsArr, chunkArrWAbs, commonChunksWAbs } = jsArr.reduce(
        (last, js) => {
          const isCommonChunk = commonChunksArr.some(
            chunk => js.indexOf(chunk) > -1
          )
          const isChunk =
            !isCommonChunk && chunkArr.some(chunk => js.indexOf(chunk) > -1)
          if (isCommonChunk) {
            last.commonChunksWAbs.push(js)
          } else if (isChunk) {
            last.chunkArrWAbs.push(js)
          } else {
            last.notChunkJsArr.push(js)
          }
          return last
        },
        {
          notChunkJsArr: [],
          chunkArrWAbs: [],
          commonChunksWAbs: []
        }
      )

      if (notChunkJsArr.length) {
        // nothing
      }

      // upload img/font
      // find img/font in css
      // replace css
      // now css ref to img/font with cdn path
      // meanwhile upload chunk files to save time
      log('uploading img and font...')
      logLocal && console.log([...imgArr, ...fontArr])
      const imgAndFontPairs = await cdn.upload([...imgArr, ...fontArr])
      // update img/font reference in css/js files
      // including chunk files
      log('update css/js files with new img and font...')
      const needToUpdateFiles = [...jsArr, ...cssArr]
      needToUpdateFiles.forEach(location =>
        simpleReplace(location, location, refinedReplaceFn)(
          getLocal2CdnObj(imgAndFontPairs)
        )
      )
      // upload chunk files
      log('uploading chunks...')
      logLocal && console.log(chunkArrWAbs)
      const chunkPairs = await cdn.upload(chunkArrWAbs)
      // update chunkMap, so far no cdn url for common chunks
      let newChunkMap = generateChunkMapToCDN(chunkPairs, chunkMap, {})
      log('uploading css...')
      logLocal && console.log(cssArr)
      const cssLocal2CdnObj = await cdn.upload(cssArr)
      // handle async css files
      if (asyncCSS) {
        updateCssLoad(
          commonChunksWAbs,
          getLocal2CdnObj(cssLocal2CdnObj),
          publicPath
        )
      }
      // entry chunk is just entry file : )
      // the reason uploading common as well as entry is to support webpack@4 and < 4
      // have common/entry chunks, update chunkMap within it
      // upload them, so their cdn url can be added to newChunkMap
      // then entries can be updated with newChunkMap that has cdn url for common chunks
      let commonChunksPair = {}
      // having runtimeChunk means entry js is likely inlined
      // therefore template files need to be checked for chunkMap existence
      const isEntryInline = !!runtimeChunk
      const entryTplList = isEntryInline ? tplFiles.filter(isEntryChunk) : []
      const entryList = [...commonChunksWAbs, ...entryTplList]
      if (entryList.length) {
        updateScriptSrc(entryList, newChunkMap)
        if (commonChunksWAbs.length) {
          log('upload common/entry chunks...')
          logLocal && console.log(commonChunksWAbs)
          commonChunksPair = await cdn.upload(commonChunksWAbs)
          newChunkMap = generateChunkMapToCDN(
            commonChunksPair,
            chunkMap,
            newChunkMap
          )
        }
      }
      // if use dirty check, then check all js files for chunkMap
      // since webpack@4, every js is chunk
      // so only filter out common/entry chunks since they should be updated
      // and uploaded right above
      const manifestList = dirtyCheck
        ? jsArr
        : jsArr.filter(
            js => !commonChunksWAbs.includes(js) && !chunkArrWAbs.includes(js)
          )
      updateScriptSrc(manifestList, newChunkMap)

      // only js here
      const adjustedFiles = [...manifestList]

      log('uploading js...')
      logLocal && console.log(adjustedFiles)
      const jsLocal2CdnObj = await cdn.upload(adjustedFiles)
      // reuse image/common chunks result here
      // ! important to reuse common chunks since they could just by entry files
      const allLocal2CdnObj = Object.assign(
        jsLocal2CdnObj,
        cssLocal2CdnObj,
        imgAndFontPairs,
        commonChunksPair
      )
      tplFiles.forEach(filePath => {
        simpleReplace(
          filePath,
          mapSrcToDist(filePath, srcRoot, distRoot),
          refinedReplaceFn,
          forceCopyTemplate
        )(getLocal2CdnObj(allLocal2CdnObj))
      })
      // run onFinish if it is a valid function
      onFinish()
      log('all done')
    } catch (e) {
      log('err occurred!')
      console.log(e)
      // run when encounter error
      onError(e)
    }
  })
}

module.exports = UploadPlugin
