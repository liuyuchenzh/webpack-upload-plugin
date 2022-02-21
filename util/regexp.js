exports.getPublicPathExp = () => /__webpack_require__\.p\s?=\s?([^;\n]+);?/g
exports.getV3ScriptRegExp = () =>
  /__webpack_require__\.p\s\+\s__webpack_require__\.u\((.*)\)/g
exports.getV2ScriptRegExp = () =>
  /__webpack_require__\.p\s?\+[^\n]*?(chunkId)[^\n]*?\.js['"];?/g
exports.getScriptRegExp = () =>
  /__webpack_require__\.p\s?\+[^[]+\[(\S+)][^\n]+?\.js['"];?/g
exports.getCssChunksRegExp = () => /var\scssChunks\s*=\s*([^;\n]+);?/
exports.getCssHrefRegExp = () => /var\shref\s*=[^\n]+?chunkId[^\n;]+;?/
exports.getMiniCssMapRegExp = () =>
  /__webpack_require__\.miniCssF = function\(chunkId\) {(.*?)};/gs
