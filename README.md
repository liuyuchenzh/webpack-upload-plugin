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
This plugin is for webpack >= 3.

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

## Use case

For a simple project with such structure:

```
+-- src
|   +-- assets
|   |   +-- avatar.png
|   +-- index.js
|   +-- index.css
+-- dist
+-- index.html
+-- webpack.config.js
```

```js
// in webpack.config.js
const path = require('path')
const HtmlWebpackPlugin = require('html-webpack-plugin')
const MiniCssExtractPlugin = require('mini-css-extract-plugin')
const UploadPlugin = require('webpack-upload-plugin')
const cdn = require('xxx-cdn')

module.exports = {
  entry: './src/index.js',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'bundle.js',
    publicPath: ''
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        loader: 'babel-loader'
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader']
      },
      {
        test: /\.(png|jpe?g|gif|svg)(\?.*)?$/,
        loader: 'url-loader',
        options: {
          limit: 10000
        }
      }
    ]
  },
  plugins: [
    new MiniCssExtractPlugin({
      filename: '[name].css',
      chunkFilename: '[id].css'
    }),
    new HtmlWebpackPlugin({
      filename: 'index.html',
      template: 'index.html',
      inject: true
    }),
    new UploadPlugin(cdn)
  ]
}
```

> For webpack v3 users, use `extract-text-webpack-plugin` instead of `mini-css-extract-plugin`

## Configuration

In webpack.config.js

```js
const WebpackUploadPlugin = require('webpack-upload-plugin')
const cdn = require('some-cdn-package')
module.exports = {
  plugins: [new WebpackUploadPlugin(cdn, option)]
}
```

`option` is optional.

Valid fields shows below:

- [`src`]\<String>: Where your valid template files would appear (with reference to local js/css files). Default to be where html files would be emitted to based on your webpack configuration.
- [`dist`]\<String>: Where to emit final template files. Only use this when there is a need to separate origin outputs with cdn ones. Default to be same as `src`.
- [`urlCb`]\<Function(String)>: Adjust cdn url accordingly. Cdn url would be passed in, and you need to return a string.
- [`resolve`]\<Array\<String>>: Type of templates needed to match. In case you have a project with php, smarty, or other template language instead of html. Default to `['html']`
- [`onFinish`]\<Function>: Called when everything finished. You can further play with files here.
- [`onError`]\<Function\<Error>> Called when encounter any error.
- [`logLocalFiles`]\<Boolean>: Whether to print all uploading file names during the process
- [`passToCdn`]\<Object>: Extra config to pass to `cdn.upload` method. Something Like `cdn.upload(location, passToCdn)`.

> `src` and `dist` work best with absolute path!
>
> This plugin doesn't work well with `UglifyJs` plugin!
>
> Pay extra attention to your `publicPath` field of `webpack.config.js`, `''` is likely the best choice.

Viola! That's all : )

## License

[MIT](http://opensource.org/licenses/MIT)

Copyright (c) 2017-present, Yuchen Liu
