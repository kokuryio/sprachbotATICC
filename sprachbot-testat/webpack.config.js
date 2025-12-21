const path = require('path');
const nodeExternals = require('webpack-node-externals');

module.exports = {
  entry: './src/index.js',
  target: 'node',                // Important for Node
  mode: 'production',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'bundle.js'
  },
  externals: [nodeExternals()], 
  optimization: {
    splitChunks: false,        
    runtimeChunk: false       
  }
};