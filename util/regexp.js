const PUBLIC_PATH_MATCH = /__webpack_require__\.p\s?=\s?([^;]+);/g
const getScriptRegExp = () =>
  /__webpack_require__\.p\s?\+[^[]+\[(\S+)][^\n]+?\.js['"];?/g
const getCssChunksRegExp = () => /var\scssChunks\s*=\s*([^;\n]+);/
const getCssHrefRegExp = () => /var\shref\s*=[^\n]+?chunkId[^\n;]+;/

module.exports = {
  PUBLIC_PATH_MATCH,
  getScriptRegExp,
  getCssChunksRegExp,
  getCssHrefRegExp
}
