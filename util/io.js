const fs = require('fs')
// read file
const read = location => fs.readFileSync(location, 'utf-8')
// write file
const write = location => content => fs.writeFileSync(location, content)

module.exports = {
  read,
  write
}
