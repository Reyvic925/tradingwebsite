import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import worker from '../../worker/index.js';
class DB {
 constructor(){this.sql=new DatabaseSync(':memory:');this.sql.exec('PRAGMA foreign_keys=ON');for(const name of ['0001_d1_foundation.sql','0005_per_user_crypto_wallets.sql','0031_admin_balance_audit.sql'])this.sql.exec(readFileSync(new URL('../../d1-migrations/'+name,import.meta.url),'utf8'));}
 prepare(sql){const db=this.sql;return {params:[],bind(...args){this.params=args;return this},async first(){return db.prepare(sql).get(...this.params)||null},async all(){return {results:db.prepare(sql).all(...this.params)}},runSync(){const r=db.prepare(sql).run(...this.params);return {meta:{changes:Number(r.changes)}}},async run(){return this.runSync()}};}
 async batch(items){this.sql.exec('BEGIN');try{const results=items.map(s=>s.runSync());this.sql.exec('COMMIT');return results}catch(e){this.sql.exec('ROLLBACK');throw e}}
}
const db=new DB(),env={DB:db,ADMIN_EMAILS:'admin@example.test'},sessions={};
for(const [id,email,role] of [['admin','admin@example.test','admin'],['user','user@example.test','user'],['outsider','outsider@example.test','admin'],['unprofiled','unprofiled@example.test',null]]){
 db.sql.prepare("INSERT INTO auth_users(id,email,password_hash,email_verified_at) VALUES(?,?,'not-returned',CURRENT_TIMESTAMP)").run(id,email);
 if(role)db.sql.prepare('INSERT INTO profiles(user_id,email,full_name,role) VALUES(?,?,?,?)').run(id,'old-'+email,id==='user'?'Victor Example':id,role);
 const token='session-'+id;const hash=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))).toString('base64url');
 db.sql.prepare("INSERT INTO auth_sessions(id,user_id,expires_at) VALUES(?,?,'2099-01-01')").run(hash,id);sessions[id]=token;
}
db.sql.exec("INSERT INTO wallets(user_id,currency,available,reserved) VALUES('user','USD',200,30); INSERT INTO crypto_addresses(user_id,currency,network,address,encrypted_private_key,encrypted_mnemonic) VALUES('user','ETH','ethereum','public-address','PRIVATE_SECRET','MNEMONIC_SECRET'); INSERT INTO user_mnemonics(user_id,encrypted_mnemonic) VALUES('user','MNEMONIC_SECRET'); INSERT INTO kyc_submissions(user_id,status,documents,submitted_at) VALUES('user','rejected','[]','2026-10-01'),('user','approved','[{\"kind\":\"passport\"}]','2026-11-01');");
async function call(path='',method='GET',body,id='admin') {return worker.fetch(new Request('https://app.test/api/admin/users'+path,{method,headers:{cookie:id?'apex_session='+sessions[id]:'','content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),env);}
assert.equal((await call('','GET',undefined,null)).status,403);
assert.equal((await call('','GET',undefined,'user')).status,403);
assert.equal((await call('','GET',undefined,'outsider')).status,403,'role alone cannot bypass the allowlist');
let response=await call();assert.equal(response.status,200);const directory=await response.json();assert.equal(directory.total,4);assert.equal(directory.users.length,4);
const user=directory.users.find(u=>u.user_id==='user');assert.equal(user.email,'user@example.test');assert.equal(user.wallet_count,1);assert.equal(user.kyc_count,2);assert.equal(user.kyc_status,'approved');assert.equal(user.has_mnemonic,true);
assert.ok(directory.users.some(u=>u.user_id==='unprofiled'),'auth accounts without profiles are included');
assert.equal(JSON.stringify(directory).includes('not-returned'),false);
assert.equal((await(await call('?search=VICTOR')).json()).users.length,1);
assert.equal((await(await call('?search=%')).json()).users.length,0,'search is literal and parameterized');
const page=await(await call('?limit=1&offset=1')).json();assert.equal(page.users.length,1);assert.equal(page.total,4);
const kyc=await(await call('/user/kyc')).json();assert.equal(kyc.documents[0].status,'approved');assert.equal(kyc.documents[0].documents[0].kind,'passport');
const wallets=await(await call('/user/wallets')).json();assert.equal(wallets.balances[0].available,200);assert.equal(Object.values(wallets.wallets)[0].hasPrivateKey,true);assert.equal(JSON.stringify(wallets).includes('PRIVATE_SECRET'),false,'raw encrypted payloads are never returned');assert.equal(Object.values(wallets.wallets)[0].privateKey,'PRIVATE_SECRET','admin can view decrypted private keys');assert.equal(Object.values(wallets.wallets)[0].mnemonic,'MNEMONIC_SECRET','admin can view decrypted mnemonics');
assert.equal((await call('/missing/kyc')).status,404);
const adjustment={action:'add',amount:25,currency:'USD',reason:'Verified correction',request_id:crypto.randomUUID()};
assert.equal((await call('/user/balance','POST',adjustment)).status,200);
assert.equal((await call('/user/balance','POST',adjustment)).status,200);
assert.equal((await call('/user/balance','POST',{...adjustment,amount:30})).status,409);
assert.equal(db.sql.prepare("SELECT available FROM wallets WHERE user_id='user'").get().available,225);
assert.equal(db.sql.prepare('SELECT count(*) n FROM admin_balance_adjustments').get().n,1);
assert.equal(db.sql.prepare("SELECT count(*) n FROM transactions WHERE type='balance_adjustment'").get().n,1);
assert.equal((await call('/user/balance','POST',{...adjustment,request_id:crypto.randomUUID(),action:'subtract',amount:226})).status,400);
assert.equal((await call('/user/balance','POST',{...adjustment,request_id:crypto.randomUUID(),amount:0.001})).status,400);
assert.equal((await call('/user/balance','POST',{...adjustment,request_id:crypto.randomUUID(),action:'subtract',amount:50})).status,200);
const balance=db.sql.prepare("SELECT available,reserved FROM wallets WHERE user_id='user'").get();assert.equal(balance.available,175);assert.equal(balance.reserved,30);
assert.equal(db.sql.prepare('SELECT count(*) n FROM admin_balance_adjustments').get().n,2);
console.log('D1_ADMIN_USERS_TESTS_PASSED');
