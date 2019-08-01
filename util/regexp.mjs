export const getPublicPathExp = () =>
  /__webpack_require__\.p\s?=\s?([^;\n]+);?/g
export const getV2ScriptRegExp = () =>
  /__webpack_require__\.p\s?\+[\s\S]*?(chunkId)[\s\S]*?\.js['"];?/g
export const getScriptRegExp = () =>
  /__webpack_require__\.p\s?\+[^[]+\[(\S+)][^\n]+?\.js['"];?/g
export const getCssChunksRegExp = () => /var\scssChunks\s*=\s*([^;\n]+);?/
export const getCssHrefRegExp = () => /var\shref\s*=[^\n]+?chunkId[^\n;]+;?/
