const fs = require("fs");
const path = require("path");

// Importar o handler do servidor compilado
const serverPath = path.join(__dirname, "../dist/server/index.js");
const serverModule = require(serverPath);

const handler = serverModule.default || serverModule;

module.exports = handler;
