export const getPublicPathExp = () => /__webpack_require__\.p\s?=\s?([^;]+);/g
export const getScriptRegExp = () =>
  /__webpack_require__\.p\s?\+[^[]+\[(\S+)][^\n]+?\.js['"];?/g
export const getCssChunksRegExp = () => /var\scssChunks\s*=\s*([^;\n]+);/
export const getCssHrefRegExp = () => /var\shref\s*=[^\n]+?chunkId[^\n;]+;/
