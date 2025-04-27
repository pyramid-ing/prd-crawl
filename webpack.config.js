const path = require('path')
const HtmlWebpackPlugin = require('html-webpack-plugin')
const CopyWebpackPlugin = require('copy-webpack-plugin')

const isProduction = process.env.NODE_ENV === 'production'

const config = {
  mode: process.env.NODE_ENV === 'development' ? 'development' : 'production',
  entry: path.join(__dirname, 'src/renderer/index.tsx'),
  target: 'electron-renderer',
  devtool: isProduction ? false : 'source-map', // 프로덕션에서는 소스맵 비활성화
  output: {
    path: path.join(__dirname, 'dist/renderer'),
    filename: 'renderer.js',
    publicPath: './', // 상대 경로로 수정
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        exclude: /node_modules/,
        use: {
          loader: 'ts-loader',
          options: {
            configFile: path.join(__dirname, 'tsconfig.json'),
          },
        },
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
      },
      {
        test: /\.(png|jpg|gif|svg)$/i,
        type: 'asset/resource',
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js', '.jsx'],
    alias: {
      '@': path.resolve(__dirname, 'src/'),
    },
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: path.join(__dirname, 'src/renderer/index.html'),
      filename: 'index.html',
      inject: true,
    }),
    new CopyWebpackPlugin({
      patterns: [
        {
          from: path.join(__dirname, 'files'),
          to: path.join(__dirname, 'dist', 'electron', 'files'),
          toType: 'dir',
        },
        {
          from: path.resolve(__dirname, '필독.txt'), // 소스 파일 경로
          to: path.resolve(__dirname, 'dist/필독.txt'), // 빌드 출력 경로
        },
      ],
    }),
  ],
  devServer: {
    static: {
      directory: path.join(__dirname, 'dist/renderer'),
      publicPath: '/',
    },
    port: 8080,
    hot: true,
    compress: true,
    historyApiFallback: true,
    open: false,
    devMiddleware: {
      writeToDisk: true,
    },
    host: 'localhost',
    // headers 설정 추가
    headers: {
      'Access-Control-Allow-Origin': '*',
    },
  },
}

module.exports = config
