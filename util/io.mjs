import fs from 'fs'
// read file
export const read = location => fs.readFileSync(location, 'utf-8')
// write file
export const write = location => content => fs.writeFileSync(location, content)
