// api/index.js
// Handler serverless para Vercel
// Exporta la aplicación Express compilada desde dist/

const app = require('../dist/src/app').default || require('../dist/src/app');

module.exports = app;


