import fs from 'fs'
import path from 'path'
export function isFile(input) {
  return fs.statSync(input).isFile()
}

export function isDir(input) {
  return fs.statSync(input).isDirectory()
}

export function isType(type) {
  return function enterFile(file) {
    return isFile(file) && path.extname(file) === '.' + type
  }
}
