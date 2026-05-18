const Database = require('better-sqlite3');
const db = new Database('./data/suny.db');

console.log('Before:', JSON.stringify(db.prepare('SELECT id, username, balance, wallet_balance, wallet_auto_spend FROM users').all()));

// Top up testbench user - set wallet_balance to 10 (using balance_delta equivalent)
const user = db.prepare('SELECT id, username FROM users WHERE username = ?').get('testbench');
if (user) {
  db.prepare('UPDATE users SET balance = MAX(balance, 0) + 10, wallet_balance = MAX(COALESCE(wallet_balance, 0), 0) + 10, wallet_auto_spend = 1 WHERE id = ?').run(user.id);
  console.log('Topped up testbench user');
}

console.log('After:', JSON.stringify(db.prepare('SELECT id, username, balance, wallet_balance, wallet_auto_spend FROM users').all()));
db.close();
