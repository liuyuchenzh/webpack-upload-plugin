## Intro
This is a plugin for [webpack](https://github.com/webpack/webpack).<br>
The main aim is to provide a tool to upload js/css files used in html to cdn, and then replace the reference with the corresponding cdn url.<br>

## Notice
This plugin does not provide a service as uploading to cdn.<br>
In fact, it actually depends on such service.<br>
This plugin is for webpack 3.

## Dependency
`webpack-cdn-plugin` relies on the existence a `cdn` object with an `upload` method described as below.
```typescript
type cdnUrl = string;
interface cdnRes {
  [localPath: string]: cdnUrl
}
// this is what cdn package looks like
interface cdn {
  upload: (localPaths: string[]) => Promise<cdnRes>;
}
```
If typescript syntax is unfamiliar, here is another description in vanilla javascript.
```js
/**
* @param {string[]} localPath: list of paths of local files
* @return Promise: resolved Promise with structure like {localPath: cdnUrl}
*/
function upload(localPath) {
  // code
}
const cdn = {
  upload
}
```

## Usage
In webpack.config.js
```js
const WebpackCdnPlugin = require("webpack-cdn-plugin")
const cdn = require("some-cdn-package")
module.exports = {
  plugins: [
      new WebpackCdnPlugin(cdn, {
          src: path.resolve("./"), // where your original html file lies (under develop)
          dist: path.resolve("./dist") // where the final html lies (ready for production)
      })
  ]
}
```
Viola! That's all : )

## License

[MIT](http://opensource.org/licenses/MIT)

Copyright (c) 2017-present, Yuchen Liu