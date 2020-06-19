// in webpack.config.js
const UploadPlugin = require('../index')

const path = require('path')
const HtmlWebpackPlugin = require('html-webpack-plugin')
const MiniCssExtractPlugin = require('mini-css-extract-plugin')
const { CleanWebpackPlugin } = require('clean-webpack-plugin')
function upload(localPaths) {
  return Promise.all(
    localPaths.map((localPath) => {
      return Promise.resolve({
        [localPath]: `https://cdn-for-${localPath}`,
      })
    })
  ).then(
    (pairs) => {
      return pairs.reduce((last, pair) => {
        return Object.assign(last, pair)
      }, {})
    },
    () => ({})
  )
}
const cdn = {
  upload,
}

module.exports = {
  entry: path.resolve(__dirname, 'src/index.js'),
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'bundle.[contenthash:6].js',
    publicPath: '',
  },
  resolve: {
    extensions: ['.js', '.jsx', '.css'],
  },
  module: {
    rules: [
      {
        test: /\.jsx?$/,
        use: [
          {
            loader: 'babel-loader',
            options: {
              babelrc: false,
              presets: ['@babel/preset-react'],
            },
          },
        ],
      },
      {
        test: /\.css$/,
        use: [MiniCssExtractPlugin.loader, 'css-loader'],
      },
    ],
  },
  optimization: {
    minimize: false, // important! important! important!
  },
  plugins: [
    new MiniCssExtractPlugin({
      filename: '[name].css',
      chunkFilename: '[id].css',
    }),
    new CleanWebpackPlugin(),
    new HtmlWebpackPlugin(),
    new UploadPlugin(cdn, {
      enableCache: false,
    }),
  ],
}
