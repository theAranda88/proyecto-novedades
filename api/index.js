// api/index.js
// Handler serverless para Vercel
// Importa y exporta la aplicación Express compilada

const appModule = require('../dist/src/app');
const app = appModule.default || appModule;

module.exports = app;



