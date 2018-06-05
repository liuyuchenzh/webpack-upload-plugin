## Intro

This is a plugin for [webpack](https://github.com/webpack/webpack).<br>
The main aim is to provide a tool to upload js/css files used in html to cdn, and then replace the reference with the corresponding cdn url.<br>

## Environment requirement

node >= 7.4.0<br>

## Install

```bash
npm install webpack-upload-plugin
```

## Notice

This plugin does not provide a service as uploading to cdn.<br>
In fact, it actually depends on such service.<br>
This plugin is for webpack 3.

## Dependency

`webpack-upload-plugin` relies on the existence a `cdn` object with an `upload` method described as below.

```typescript
type cdnUrl = string
interface cdnRes {
  [localPath: string]: cdnUrl
}
// this is what cdn package looks like
interface cdn {
  upload: (localPaths: string[]) => Promise<cdnRes>
}
```

If typescript syntax is unfamiliar, here is another description in vanilla javascript.

```js
/**
 * @param {string[]} localPath: list of paths of local files
 * @return Promise<cdnRes>: resolved Promise with structure like {localPath: cdnUrl}
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
const WebpackUploadPlugin = require('webpack-upload-plugin')
const cdn = require('some-cdn-package')
module.exports = {
  plugins: [
    new WebpackUploadPlugin(cdn, {
      src: path.resolve('./src'), // where your html file would emit to (with reference to local js/css files)
      dist: path.resolve('./dist'), // only use this when there is a need to separate origin outputs with cdn ones
      urlCb(input) {
        return input
      }, // give the power to play with cdn url before emit
      resolve: ['html'], // typeof file needed to match; default to ['html']
      onFinish() {}, // anything you want to run after the uploading and replacing process
      logLocalFiles: false // whether to print all uploading file names during the process
    })
  ]
}
```

> `src` and `dist` work best with absolute path!
>
> This plugin doesn't work well with `UglifyJs` plugin!
>
> Pay extra attention to your `publicPath` field of `webpack.config.js`, `''` is likely the best choice.

Viola! That's all : )

## License

[MIT](http://opensource.org/licenses/MIT)

Copyright (c) 2017-present, Yuchen Liu
