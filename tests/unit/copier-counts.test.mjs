import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
const db = new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=ON');
for (const file of ['0001_d1_foundation.sql','0018_traders.sql','0020_copy_trading.sql']) db.exec(readFileSync(new URL('../../d1-migrations/'+file,import.meta.url),'utf8'));
for (const id of ['one','two']) {
  db.prepare("INSERT INTO auth_users(id,email,password_hash) VALUES(?,?,'hash')").run(id,id+'@example.test');
  db.prepare("INSERT INTO wallets(user_id,currency,available) VALUES(?,'USD',2000)").run(id);
}
db.exec(readFileSync(new URL('../../d1-migrations/0033_recorded_copier_counts.sql',import.meta.url),'utf8'));
const counts = () => db.prepare('SELECT followers,copiers_current,copiers_all_time,under_management FROM traders WHERE id=4').get();
assert.equal(counts().followers,0);assert.equal(counts().copiers_all_time,0);
assert.equal(db.prepare('SELECT count(*) n FROM trader_copier_count_audit').get().n,21);
const start = (id,user) => db.prepare(`INSERT INTO copy_follows(id,user_id,trader_id,allocated_amount,current_value,peak_value,fee_high_water,stop_loss_percent,take_profit_percent,leverage_multiplier,followed_at,updated_at)
 VALUES(?,?,4,100,100,100,100,20,100,1,'2026-11-15','2026-11-15')`).run(id,user);
start('first','one');assert.equal(counts().copiers_current,1);assert.equal(counts().followers,1);assert.equal(counts().copiers_all_time,1);assert.equal(counts().under_management,100);
db.exec("UPDATE copy_follows SET status='paused' WHERE id='first'");assert.equal(counts().copiers_current,1);
db.exec("UPDATE copy_follows SET status='stopped' WHERE id='first'");assert.equal(counts().copiers_current,0);assert.equal(counts().followers,0);assert.equal(counts().copiers_all_time,1);
start('repeat','one');assert.equal(counts().copiers_all_time,1,'copying again counts the same person once');
start('second','two');assert.equal(counts().copiers_current,2);assert.equal(counts().copiers_all_time,2);
db.exec("UPDATE copy_follows SET current_value=110 WHERE id='repeat'");assert.equal(counts().under_management,210);
db.exec("UPDATE copy_follows SET status='stopped' WHERE id='repeat'");assert.equal(counts().copiers_current,1);assert.equal(counts().copiers_all_time,2);assert.equal(counts().under_management,100);
db.exec("DELETE FROM copy_follows WHERE id='first'");assert.equal(counts().copiers_all_time,2,'another record preserves the same lifetime user');
assert.equal(db.prepare('SELECT sum(copiers_current) n FROM traders WHERE id<>4').get().n,0,'all other seeded counts stay reconciled');
db.close();
console.log('RECORDED_COPIER_COUNTS_TESTS_PASSED');
