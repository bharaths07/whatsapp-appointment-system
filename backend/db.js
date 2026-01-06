const Database = require('better-sqlite3');
require('dotenv').config();

const db = new Database('appointments.db', { verbose: console.log });

module.exports = db;
