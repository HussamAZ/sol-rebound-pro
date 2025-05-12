const webpack = require('webpack'); // استورد webpack

module.exports = {
  webpack: {
    configure: (webpackConfig) => {
      // ... (الـ fallbacks الموجودة لديك) ...
      webpackConfig.resolve.fallback = {
        ...webpackConfig.resolve.fallback,
        crypto: require.resolve("crypto-browserify"),
        stream: require.resolve("stream-browserify"),
        http: require.resolve("stream-http"),
        https: require.resolve("https-browserify"),
        zlib: require.resolve("browserify-zlib"),
        url: require.resolve("url"),
        buffer: require.resolve("buffer/"), // <-- أضف هذا
      };
      // أضف هذا الـ Plugin لتوفير Buffer عالميًا
      webpackConfig.plugins = (webpackConfig.plugins || []).concat([
         new webpack.ProvidePlugin({
             Buffer: ['buffer', 'Buffer'],
         }),
      ]);
      return webpackConfig;
    }
  }
};