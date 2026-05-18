const Database = require('better-sqlite3');
const db = new Database('./data/suny.db');
const users = db.prepare('SELECT id, username, balance, wallet_balance, wallet_auto_spend FROM users').all();
console.log('users:', JSON.stringify(users, null, 2));
const limit = db.prepare("SELECT * FROM app_settings WHERE key LIKE '%token%limit%' OR key LIKE '%daily%'").all();
console.log('limit_settings:', JSON.stringify(limit));
const pricing = db.prepare("SELECT * FROM pricing_modes").all();
console.log('pricing:', JSON.stringify(pricing));
db.close();
