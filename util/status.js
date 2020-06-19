const fs = require('fs')
const path = require('path')
function isFile(input) {
  return fs.statSync(input).isFile()
}

function isDir(input) {
  return fs.statSync(input).isDirectory()
}

function isType(type) {
  return function enterFile(file) {
    return isFile(file) && path.extname(file) === '.' + type
  }
}

module.exports = {
  isFile,
  isDir,
  isType,
}
