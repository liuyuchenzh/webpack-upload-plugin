## Intro

This is a plugin for [webpack](https://github.com/webpack/webpack).

The main aim is to provide a tool to upload js/css files used in html to cdn, and then replace the reference with the corresponding cdn url.

## Environment requirement

node >= 7.4.0

## Install

```bash
npm i -D webpack-upload-plugin
```

## Notice

This plugin does not provide a service as uploading to cdn.

In fact, it actually depends on such service.

This plugin is for webpack >= 2.

This plugin _doesn't_ work well with `UglifyJs` plugin! Use `beforeUpload` if you want to compress anyway.

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

### Basic one

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

### Complex one with Server Template

Run webpack in `build`, then copy all emitted files from `build/dist` to `project/src`.

Public can only access files from `project/public`

```
+-- project
| +-- src
| +-- public
+-- build
| +-- src
| | +-- assets
| | |   +-- avatar.png
| | +-- index.js
| | +-- index.css
| +-- dist
| +-- index.html
| +-- webpack.config.js
```

```js
// only focus on WebpackUploadPlugin here
{
  plugins: [
    new UploadPlugin(cdn, {
      src: path.resolve(__dirname, '..', 'project/src'),
      dist: path.resolve(__dirname, '..', 'project/public'),
      staticDir: path.resolve(__dirname, '..', 'project/src'),
      dirtyCheck: true
    })
  ]
}
```

> Make sure `WebpackUploadPlugin` is after any copy-related plugins in `plugins` field.

> If in `project/public`, there are different prefix from `publicPath` you passed to webpack, then use `replaceFn` to remove such prefix.

```js
const config = {
  replaceFn(content, location) {
    return path.extname(location) === '.html'
      ? content.replace(prefix, '')
      : content
  }
}
```

> If the copy process takes a long time, use `waitFor` to make sure only start uploading when things are settled.

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
- [`staticDir`]\<String>: If static files emitted by webpack is not what you want, or not enough(normally when you copy all resources to another directory), then set `staticDir` to the directory that contains all your desired resource files.
- [`beforeUpload`]\<Function(String, String)>: _Compression_ can be done here. Two arguments are file content and file location (with extension name of course). You need to return the compression result as string.
- [`replaceFn`]\<Function(String, String)>: For some complex projects, you may have multiple `publicPath` or corresponding concepts. To handle such cases accordingly, you can pass a `replaceFn` function, which will receive two parameters, which are `parsing content` and `file path` in that order. `parsing content` would be file in string format with local resources reference. `file path` is the location of `parsing content` on your file system. This function will be called when plugin start to replace reference. The string `replaceFn` return will represent the new desired content, which will be used as the input template to replace all local reference with cdn ones.
- [`waitFor`]\<Function\<Promise\<\*>>>: A function that returns a Promise. The plugin will wait for the Promise to resolve and then start everything.
- [`dirtyCheck`]\<Boolean>: For cases where chunk file can also be entry file, set `dirtyCheck` to `true` to make sure entry file would be updated properly.
- [`onFinish`]\<Function>: Called when everything finished. You can further play with files here.
- [`onError`]\<Function\<Error>> Called when encounter any error.
- [`logLocalFiles`]\<Boolean>: Whether to print all uploading file names during the process
- [`passToCdn`]\<Object>: Extra config to pass to `cdn.upload` method. Something Like `cdn.upload(location, passToCdn)`.
- [`enableCache`]\<Boolean>: Enable cache to speed up. Default to `false`.
- [`cacheLocation`]\<String>: Directory to emit the upload cache file. Use this when you want to manage the cache file by any VCS.
- [`sliceLimit`]\<Number>: Uploading files is not done by once. Using `sliceLimit` you can limit the number of files being uploaded at the same time.

> `src` and `dist` work best with absolute path!
>
> Pay extra attention to your `publicPath` field of `webpack.config.js`, `''` is likely the best choice.

Viola! That's all : )

## License

[MIT](http://opensource.org/licenses/MIT)

Copyright (c) 2017-present, Yuchen Liu
