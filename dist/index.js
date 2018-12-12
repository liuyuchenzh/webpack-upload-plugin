function _interopDefault (ex) { return (ex && (typeof ex === 'object') && 'default' in ex) ? ex['default'] : ex; }

var yUploadUtils = require('y-upload-utils');
var fse = _interopDefault(require('fs-extra'));
var fs = _interopDefault(require('fs'));
var path = _interopDefault(require('path'));

// A type of promise-like that resolves synchronously and supports only one observer

// Asynchronously call a function and send errors to recovery continuation
function _catch(body, recover) {
	try {
		var result = body();
	} catch(e) {
		return recover(e);
	}
	if (result && result.then) {
		return result.then(void 0, recover);
	}
	return result;
}

var read = function (location) { return fs.readFileSync(location, 'utf-8'); }; // write file

var write = function (location) { return function (content) { return fs.writeFileSync(location, content); }; };

var getPublicPathExp = function () { return /__webpack_require__\.p\s?=\s?([^;]+);/g; };
var getScriptRegExp = function () { return /__webpack_require__\.p\s?\+[^[]+\[(\S+)][^\n]+?\.js['"];?/g; };
var getCssChunksRegExp = function () { return /var\scssChunks\s*=\s*([^;\n]+);/; };
var getCssHrefRegExp = function () { return /var\shref\s*=[^\n]+?chunkId[^\n;]+;/; };

function isFile(input) {
  return fs.statSync(input).isFile();
}
function isDir(input) {
  return fs.statSync(input).isDirectory();
}
function isType(type) {
  return function enterFile(file) {
    return isFile(file) && path.extname(file) === '.' + type;
  };
}

var name = 'webpack-upload-plugin';

/**
 * log information
 * @param {*} msg
 */

function log(msg) {
  console.log(("[" + name + "]: " + msg));
}
/**
 * log error
 * @param msg
 */

function logErr(msg) {
  console.error(("[" + name + "]: " + msg));
}

var DEFAULT_SEP = '/';
var FILTER_OUT_DIR = ['.idea', '.vscode', '.gitignore', 'node_modules']; // 1. gather html file
// 2. gather production file
// 3. upload all production file
// 4. find the usage of production file in html file
// 5. if found, replace
// type related

var imgTypeArr = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'ico'];
var fontTypeArr = ['woff', 'woff2', 'ttf', 'oft', 'svg', 'eot'];
var isCss = isType('css');
var isJs = isType('js');

var isOneOfType = function (types) {
  if ( types === void 0 ) types = [''];

  return function (file) { return types.some(function (type) { return isType(type)(file); }); };
};

function isFont(path$$1) {
  return fontTypeArr.some(function (type) { return isType(type)(path$$1); });
}

function isImg(path$$1) {
  return imgTypeArr.some(function (type) { return isType(type)(path$$1); });
}
/**
 *
 * @param {string[]} input
 * @return {string}
 */


function resolve() {
  var input = [], len = arguments.length;
  while ( len-- ) input[ len ] = arguments[ len ];

  return path.resolve.apply(path, input);
}
/**
 * @param {string} input
 * @param {string=} [sep=DEFAULT_SEP]
 * @return {string}
 */


function normalize(input, sep) {
  if ( sep === void 0 ) sep = DEFAULT_SEP;

  var _input = path.normalize(input);

  return _input.split(path.sep).join(sep);
}
/**
 * @param {string} input
 * @return {boolean}
 */


function isFilterOutDir(input) {
  return FILTER_OUT_DIR.includes(input);
}
/**
 * remove publicPath from webpack config
 * @param {string} publicPath
 * @return {function(string): string}
 */


var handlePublicPath = function (publicPath) { return function (content) {
  // match strictly
  var regStr = publicPath.split(DEFAULT_SEP).filter(function (item) { return !!item; }).map(function (part) {
    if (/\./.test(part)) {
      return part.replace(/\.+/g, function (match) { return match.split('').map(function (dot) { return '\\' + dot; }).join(''); });
    }

    return part;
  }).join('\\/');
  var refinedRegStr = "([(=]['\"]?)" + regStr;
  var reg = new RegExp(refinedRegStr, 'g');
  return content.replace(reg, function (_, prefix) { return prefix ? prefix : ''; });
}; };
/**
 * given localPath, return string to form matching RegExp
 * @param {string} localPath
 * @returns {string}
 */


function generateLocalPathStr(localPath) {
  var pathArr = localPath.split(DEFAULT_SEP);
  var len = pathArr.length;
  return pathArr.map(function (part, index) {
    if (index === len - 1) {
      return ("" + part);
    } else {
      return ("\\.?(" + part + ")?");
    }
  }).join(("\\" + DEFAULT_SEP + "?"));
}
/**
 * produce RegExp to match local path
 * @param {string} localPath
 * @return {RegExp}
 */


function generateLocalPathReg(localPath) {
  var content = generateLocalPathStr(localPath);
  var prefix = "([(=+]\\s*['\"]?)"; // using prefix to strictly match resource reference
  // like src="", url(""), a = ""

  return new RegExp(("" + prefix + content), 'g');
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


function simpleReplace(srcPath, distPath, replaceFn, copyWhenUntouched) {
  if ( distPath === void 0 ) distPath = srcPath;
  if ( replaceFn === void 0 ) replaceFn = function (input) { return input; };
  if ( copyWhenUntouched === void 0 ) copyWhenUntouched = true;

  var srcFile = read(srcPath);
  return function savePair(localCdnPair) {
    var ret = localCdnPair.reduce(function (last, file) {
      var localPath = normalize(file[0]);
      var cdnPath = file[1];
      var localPathReg = generateLocalPathReg(localPath);
      last = replaceFn(last, srcPath).replace(localPathReg, function (_, prefix) { return ("" + prefix + cdnPath); });
      return last;
    }, srcFile); // no such path > force copy > content change

    var toCopy = !fs.existsSync(distPath) || copyWhenUntouched || ret !== srcFile;

    if (toCopy) {
      fse.ensureFileSync(distPath);
      write(distPath)(ret);
    }
  };
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
    return fs.readdirSync(src).reduce(function (last, file) {
      var filePath = resolve(src, file);

      if (isFile(filePath)) {
        path.extname(file) === ("." + type) && last.push(normalize(filePath));
      } else if (isFilterOutDir(file)) ; else if (isDir(filePath)) {
        last = last.concat(gatherFileIn(filePath)(type));
      }

      return last;
    }, []);
  };
}
/**
 * make sure urlCb is applied for all cdn results
 * @param {function(string): string} cb
 * @return {function(string[]|{[string]:string}):[string, string][]}
 */


var handleCdnRes = function (cb) { return function (entries) {
  if (typeof cb !== 'function') { return logErr("urlCb is not function"); }
  var isArr = Array.isArray(entries); // if not array, handle as {[localLocation]: [cdnUrl]}

  var target = isArr ? entries : Object.entries(entries);
  return target.map(function (pair) {
    // pair[1] should be cdn url
    // pass local path as well
    pair[1] = cb(pair[1], pair[0]);
    if (typeof pair[1] !== 'string') { logErr("the return result of urlCb is not string"); }
    return pair;
  });
}; };
/**
 * given file path, src root and dist root, return file path in dist root
 * @param {string} srcFilePath
 * @param {string} srcRoot
 * @param {string} distRoot
 * @return {string}
 */


function mapSrcToDist(srcFilePath, srcRoot, distRoot) {
  return srcFilePath.replace(srcRoot, distRoot);
}
/**
 * generate {id: name} object for all chunk chunk
 * @param {{id: string, name:string,renderedHash: string, contentHash: string}[]} chunks
 * @param {string} chunkFileName
 */


function gatherChunks(chunks, chunkFileName) {
  return chunks.reduce(function (last, chunk) {
    if (/\[hash(:\d+)?]/.test(chunkFileName)) {
      throw new Error(("[" + name + "]: Do NOT use [hash] as output filename! Use [chunkhash] or [contenthash] instead"));
    }

    var id = chunk.id;
    var name$$1 = chunk.name;
    var renderedHash = chunk.renderedHash;
    var contentHash = chunk.contentHash; // handle slice properly

    var handleLen = function (source) { return function (match, len) {
      if (len) {
        return source.slice(0, +len.slice(1));
      }

      return match;
    }; };

    var handleChunkHash = handleLen(renderedHash); // handle webpack@4 as well as <4

    var handleContentHash = handleLen(contentHash ? contentHash.javascript : renderedHash);
    last[id] = chunkFileName.replace(/\[name]/g, name$$1 || ("" + id)).replace(/\[id]/g, ("" + id)).replace(/\[chunkhash(:\d+)?]/g, handleChunkHash).replace(/\[contenthash(:\d+)?]/g, handleContentHash);
    return last;
  }, {});
}
/**
 * whether chunk is "entry" (common chunks is also considered as "entry")
 * @param {string} js
 * @returns {boolean}
 */


function isEntryChunk(js) {
  var content = read(js);
  return getScriptRegExp().test(content);
}
/**
 * convert object to array
 * @param {object} obj
 * @returns {*[]}
 */


function getObjValueArray(obj) {
  return Object.values(obj);
}
/**
 * update script.src property for request for dynamic import
 * experimental
 * @param {string[]} files
 * @param {{id: string}} chunkCdnMap
 */


function updateScriptSrc(files, chunkCdnMap) {
  // if no new map was formed, then keep the way it is
  var len = Object.keys(chunkCdnMap).length;
  if (!len) { return; }
  files.forEach(function (file) {
    var content = read(file);
    var newContent = content; // update chunkMap

    if (getScriptRegExp().test(content)) {
      newContent = newContent.replace(getScriptRegExp(), function (match, id) {
        if (!id) {
          return match;
        }

        return ((JSON.stringify(chunkCdnMap)) + "[" + id + "];");
      });
    } // update publicPath


    if (getPublicPathExp().test(content)) {
      newContent = newContent.replace(getPublicPathExp(), "__webpack_require__.p = \"\";");
    }

    write(file)(newContent);
  });
}
/**
 * Handle async CSS files extracted by mini-css-extract-plugin
 * @param {string[]} files
 * @param {[string, string][]} cssMap
 */


function updateCssLoad(files, cssMap) {
  var keys = cssMap.map(function (ref) {
    var local = ref[0];

    return local;
  });
  files.forEach(function (file) {
    var content = read(file);
    var newContent = content;
    var match = content.match(getCssChunksRegExp());

    if (match) {
      var map = match[1];
      newContent = newContent.replace(getCssHrefRegExp(), function (hrefMatch) {
        // get the new cssMap with {chunkId, href} structure
        // where chunkId is the id for the css file, and href is the cdn url
        var fnBody = "\n            const map = " + map + ";\n            return Object.keys(map).map(chunkId => {\n              " + hrefMatch + ";\n              href = href.replace(/^\\./, \"\");\n              return {chunkId, href};\n            })\n          ";
        var hrefArr = new Function(fnBody)(); // convert to {[chunkId]: href} structure

        var cssChunkIdCdnMap = hrefArr.reduce(function (last, ref) {
          var chunkId = ref.chunkId;
          var href = ref.href;

          var localIndex = keys.findIndex(function (key) { return key.indexOf(href) > -1; });

          if (localIndex < 0) {
            return last;
          }

          last[chunkId] = cssMap[localIndex][1];
          return last;
        }, {}); // cannot form new Map, return the original one

        if (!Object.keys(cssChunkIdCdnMap).length) {
          return hrefMatch;
        }

        var newCssMap = JSON.stringify(cssChunkIdCdnMap);
        return ("var href = " + newCssMap + "[chunkId];");
      }); // update js entry file with new cssMap

      write(file)(newContent);
    }
  });
}
/**
 * get id of chunk given a absolute path of chunk file and id:chunk map
 * @param {string} chunkAbsPath
 * @param {{id: string}} chunkMap
 * @returns {string|number}
 */


function getIdForChunk(chunkAbsPath, chunkMap) {
  return Object.keys(chunkMap).find(function (key) { return chunkAbsPath.indexOf(chunkMap[key]) > -1; });
}
/**
 * make assets object to array with local path
 * @param {{[string]: {existsAt: string}}} asset
 * @returns {string[]}
 */


function getExistsAtFromAsset(asset) {
  return Object.keys(asset).map(function (name$$1) {
    var info = asset[name$$1];
    return info.existsAt;
  });
}

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
 * @param {boolean=} [option.enableCache=false]
 * @param {string=} option.cacheLocation
 * @param {number=} [option.sliceLimit=10]
 * @param {boolean=} option.forceCopyTemplate
 * @param {boolean=} [option.asyncCSS=false]
 * @param {boolean=} [option.smartAssMode=false]
 * @constructor
 */

function UploadPlugin(cdn, option) {
  if ( option === void 0 ) option = {};

  this.cdn = cdn;
  this.option = option;
}

UploadPlugin.prototype.apply = function (compiler) {
  var self = this;
  var ref = this.option;
  var urlCb = ref.urlCb; if ( urlCb === void 0 ) urlCb = function (input) { return input; };
  var resolveList = ref.resolve; if ( resolveList === void 0 ) resolveList = ['html'];
  var src = ref.src; if ( src === void 0 ) src = '';
  var dist = ref.dist; if ( dist === void 0 ) dist = src;
  var onFinish = ref.onFinish; if ( onFinish === void 0 ) onFinish = function () {};
  var onError = ref.onError; if ( onError === void 0 ) onError = function () {};
  var logLocal = ref.logLocalFiles; if ( logLocal === void 0 ) logLocal = false;
  var staticDir = ref.staticDir; if ( staticDir === void 0 ) staticDir = '';
  var replaceFn = ref.replaceFn; if ( replaceFn === void 0 ) replaceFn = function (input) { return input; };
  var beforeUpload = ref.beforeUpload;
  var waitFor = ref.waitFor; if ( waitFor === void 0 ) waitFor = function () { return Promise.resolve(true); };
  var dirtyCheck = ref.dirtyCheck; if ( dirtyCheck === void 0 ) dirtyCheck = false;
  var passToCdn = ref.passToCdn;
  var enableCache = ref.enableCache; if ( enableCache === void 0 ) enableCache = false;
  var cacheLocation = ref.cacheLocation;
  var sliceLimit = ref.sliceLimit;
  var forceCopyTemplate = ref.forceCopyTemplate;
  var asyncCSS = ref.asyncCSS; if ( asyncCSS === void 0 ) asyncCSS = false;
  var smartAssMode = ref.smartAssMode; if ( smartAssMode === void 0 ) smartAssMode = false; // get absolute path of src and dist directory

  var srcRoot = resolve(src);
  var distRoot = resolve(dist);
  var staticDirMut = staticDir;
  var srcMut = src;
  var getLocal2CdnObj = handleCdnRes(urlCb);
  var isTemplate = isOneOfType(resolveList);
  /**
   * update chunkMap to {[id: string|number]: cdnUrl}
   * @param {{[localPath: string]: string}} chunkPairs
   * @param {{[id: string|number]: string}} chunkMap
   * @param {*} start
   */

  function generateChunkMapToCDN(chunkPairs, chunkMap, start) {
    if ( start === void 0 ) start = {};

    return getLocal2CdnObj(chunkPairs).reduce(function (last, ref) {
      var localPath = ref[0];
      var cdnPath = ref[1];

      var id = getIdForChunk(localPath, chunkMap);
      last[id] = cdnPath;
      return last;
    }, start);
  } // wrap a new cdn object


  var rawCdn = {
    upload: function upload(files) {
      return self.cdn.upload(files, passToCdn);
    }

  }; // log error for cache setup

  if (!enableCache && cacheLocation) {
    logErr("'cacheLocation' provided while haven't set 'enableCache' to true");
    logErr("This won't enable cache");
  } // wrap with parallel


  var paralleledCdn = yUploadUtils.parallel(rawCdn, {
    sliceLimit: sliceLimit
  }); // wrap with cache

  var wrappedCdn = enableCache ? yUploadUtils.compatCache(paralleledCdn, {
    passToCdn: passToCdn,
    cacheLocation: cacheLocation
  }) : paralleledCdn; // wrap with beforeProcess
  // use beforeUpload properly

  var cdn = yUploadUtils.beforeUpload(wrappedCdn, beforeUpload);
  compiler.plugin('done', function (stats) {
    try {
      var _temp3 = _catch(function () {
        // wait to handle extra logic
        return Promise.resolve(waitFor()).then(function () {
          var ref = stats.compilation;
          var chunks = ref.chunks;
          var options = ref.options;
          var options_output = options.output;
          var publicPath = options_output.publicPath; if ( publicPath === void 0 ) publicPath = '';
          var outputPath = options_output.path;
          var mode = options.mode; // early warning

          if (mode && mode !== 'none') {
            log("WARNING! Set the mode to 'none' to make it works!");
          }

          if (publicPath) {
            log('WARNING! publicPath is not empty, the plugin will try to handle it for you. But it is preferred to toggle it by yourself!');
          } // try to be smart ass
          // which means assume all needed files is in the output.path from webpack


          if (smartAssMode) {
            srcRoot = outputPath;
            distRoot = outputPath;
            staticDirMut = outputPath;
            srcMut = outputPath;
          } // don't want to use publicPath since about to use cdn url


          var removePublicPath = handlePublicPath(publicPath); // actual replaceFn that gonna be used

          var refinedReplaceFn = function (content, location) {
            var type = path.extname(location); // only remove publicPath occurrence for css/template files
            // it's tricky to handle js files

            var removePublicPathTypes = ['.css' ].concat( resolveList.map(function (t) { return ("." + t); }));
            var toRemove = removePublicPathTypes.includes(type);
            return replaceFn(toRemove ? removePublicPath(content) : content, location);
          }; // if user offers staticDir
          // then only collect files from staticDir
          // instead of ones provided by webpack
          // if pass in an array, gather files recursively


          var gatherManualAssets = Array.isArray(staticDirMut) ? function (type) {
            return staticDirMut.reduce(function (last, dir) {
              return last.concat( gatherFileIn(dir)(type));
            }, []);
          } : gatherFileIn(staticDirMut);
          var manualAssets = staticDirMut ? imgTypeArr.concat( fontTypeArr, ['css'], ['js'], resolveList).reduce(function (last, type) {
            var files = gatherManualAssets(type);
            return files.reduce(function (fileLast, file) {
              var obj;

              return Object.assign(fileLast, ( obj = {}, obj[file] = {
                  existsAt: file
                }, obj ));
            }, last);
          }, {}) : {}; // here we get chunks needs to be dealt with

          var chunkMap = gatherChunks(chunks, options.output.chunkFilename); // all assets including js/css/img

          var ref$1 = staticDirMut ? {
            assets: manualAssets
          } : stats.compilation;
          var assets = ref$1.assets;
          var assetsNames = Object.keys(assets); // classify assets

          var desireAssets = assetsNames.reduce(function (last, name) {
            var assetInfo = assets[name];
            var location = assetInfo.existsAt;

            if (isImg(location)) {
              last.img[name] = assetInfo;
            } else if (isCss(location)) {
              last.css[name] = assetInfo;
            } else if (isJs(location)) {
              last.js[name] = assetInfo;
            } else if (isFont(location)) {
              last.font[name] = assetInfo;
            } else if (isTemplate(location)) {
              last.html[name] = assetInfo;
            }

            return last;
          }, {
            img: {},
            css: {},
            js: {},
            font: {},
            html: {}
          });
          var img = desireAssets.img;
          var css = desireAssets.css;
          var js = desireAssets.js;
          var font = desireAssets.font;
          var html = desireAssets.html; // warning if no template found but staticDirMut set

          if (staticDirMut && !Object.keys(html).length && !src) {
            log('WARNING!');
            log("staticDir is set but haven't found any template files in those directories");
            log('Try to use src filed to include your template files');
          }

          var imgArr = getExistsAtFromAsset(img);
          var fontArr = getExistsAtFromAsset(font);
          var jsArr = getExistsAtFromAsset(js);
          var cssArr = getExistsAtFromAsset(css);
          var htmlArr = getExistsAtFromAsset(html);
          var chunkArr = getObjValueArray(chunkMap);
          var commonChunksArr = jsArr.filter(isEntryChunk); // find out which js files are chunk chunk, common chunk, or entry

          var ref$2 = jsArr.reduce(function (last, js) {
            var isCommonChunk = commonChunksArr.some(function (chunk) { return js.indexOf(chunk) > -1; });
            var isChunk = !isCommonChunk && chunkArr.some(function (chunk) { return js.indexOf(chunk) > -1; });

            if (isCommonChunk) {
              last.commonChunksWAbs.push(js);
            } else if (isChunk) {
              last.chunkArrWAbs.push(js);
            } else {
              last.notChunkJsArr.push(js);
            }

            return last;
          }, {
            notChunkJsArr: [],
            chunkArrWAbs: [],
            commonChunksWAbs: []
          });
          var notChunkJsArr = ref$2.notChunkJsArr;
          var chunkArrWAbs = ref$2.chunkArrWAbs;
          var commonChunksWAbs = ref$2.commonChunksWAbs;

          if (notChunkJsArr.length) ; // nothing
          // upload img/font
          // find img/font in css
          // replace css
          // now css ref to img/font with cdn path
          // meanwhile upload chunk files to save time


          log('uploading img and font...');
          logLocal && console.log(imgArr.concat( fontArr));
          return Promise.resolve(cdn.upload(imgArr.concat( fontArr))).then(function (imgAndFontPairs) {
            // update img/font reference in css/js files
            // including chunk files
            log('update css/js files with new img and font...');
            var needToUpdateFiles = jsArr.concat( cssArr);
            needToUpdateFiles.forEach(function (location) { return simpleReplace(location, location, refinedReplaceFn)(getLocal2CdnObj(imgAndFontPairs)); }); // upload chunk files

            log('uploading chunks...');
            logLocal && console.log(chunkArrWAbs);
            return Promise.resolve(cdn.upload(chunkArrWAbs)).then(function (chunkPairs) {
              // update chunkMap, so far no cdn url for common chunks
              var newChunkMap = generateChunkMapToCDN(chunkPairs, chunkMap, {});
              log('uploading css...');
              logLocal && console.log(cssArr);
              return Promise.resolve(cdn.upload(cssArr)).then(function (cssLocal2CdnObj) {
                function _temp2() {
                  // if use dirty check, then check all js files for chunkMap
                  // since webpack@4, every js is chunk
                  // so only filter out common/entry chunks since they should be updated
                  // and uploaded right above
                  var manifestList = dirtyCheck ? jsArr : jsArr.filter(function (js) { return !commonChunksWAbs.includes(js); });
                  updateScriptSrc(manifestList, newChunkMap); // only js here

                  var adjustedFiles = [].concat( manifestList ); // if provide with src
                  // then use it
                  // or use emitted html files

                  var tplFiles = !srcMut ? htmlArr : resolveList.reduce(function (last, type) {
                    var findFileInRoot = gatherFileIn(srcMut);
                    last = last.concat(findFileInRoot(type));
                    return last;
                  }, []);
                  log('uploading js...');
                  logLocal && console.log(adjustedFiles);
                  return Promise.resolve(cdn.upload(adjustedFiles)).then(function (jsLocal2CdnObj) {
                    // reuse image/common chunks result here
                    // ! important to reuse common chunks since they could just by entry files
                    var allLocal2CdnObj = Object.assign(jsLocal2CdnObj, cssLocal2CdnObj, imgAndFontPairs, commonChunksPair);
                    tplFiles.forEach(function (filePath) {
                      simpleReplace(filePath, mapSrcToDist(filePath, srcRoot, distRoot), refinedReplaceFn, forceCopyTemplate)(getLocal2CdnObj(allLocal2CdnObj));
                    }); // run onFinish if it is a valid function

                    onFinish();
                    log('all done');
                  });
                }

                if (asyncCSS) {
                  updateCssLoad(commonChunksWAbs, getLocal2CdnObj(cssLocal2CdnObj));
                } // entry chunk is just entry file : )
                // the reason uploading common as well as entry is to support webpack@4 and < 4
                // have common/entry chunks, update chunkMap within it
                // upload them, so their cdn url can be added to newChunkMap
                // then entries can be updated with newChunkMap that has cdn url for common chunks


                var commonChunksPair = {};

                var _temp = function () {
                  if (commonChunksWAbs.length) {
                    updateScriptSrc(commonChunksWAbs, newChunkMap);
                    log('upload common/entry chunks...');
                    return Promise.resolve(cdn.upload(commonChunksWAbs)).then(function (_cdn$upload) {
                      commonChunksPair = _cdn$upload;
                      newChunkMap = generateChunkMapToCDN(commonChunksPair, chunkMap, newChunkMap);
                    });
                  }
                }();

                return _temp && _temp.then ? _temp.then(_temp2) : _temp2(_temp);
              });
            });
          });
        });
      }, function (e) {
        log('err occurred!');
        console.log(e); // run when encounter error

        onError(e);
      });

      return Promise.resolve(_temp3 && _temp3.then ? _temp3.then(function () {}) : void 0);
    } catch (e) {
      return Promise.reject(e);
    }
  });
};

module.exports = UploadPlugin;
//# sourceMappingURL=index.js.map
