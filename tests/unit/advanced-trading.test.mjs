import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { handleAdvancedTradingRequest } from '../../worker/advanced-trading.js';
import { clearQuoteCache } from '../../worker/market-quotes.js';
import { TradingEngine } from '../../worker/trading-engine.js';

class Statement {
  constructor(db,sql){this.db=db;this.sql=sql;this.values=[];}
  bind(...values){this.values=values;return this;}
  async first(){return this.db.prepare(this.sql).get(...this.values)||null;}
  async all(){return {results:this.db.prepare(this.sql).all(...this.values)};}
  runSync(){const r=this.db.prepare(this.sql).run(...this.values);return {success:true,meta:{changes:Number(r.changes),last_row_id:Number(r.lastInsertRowid)}};}
  async run(){return this.runSync();}
}
class Database {
  constructor(){
    this.sql=new DatabaseSync(':memory:');this.sql.exec(`PRAGMA foreign_keys=ON;
      CREATE TABLE auth_users(id TEXT PRIMARY KEY,email TEXT,created_at TEXT,email_verified_at TEXT);
      CREATE TABLE auth_sessions(id TEXT PRIMARY KEY,user_id TEXT,expires_at TEXT);
      CREATE TABLE wallets(user_id TEXT,currency TEXT DEFAULT 'USD',available REAL DEFAULT 0,reserved REAL DEFAULT 0,locked_balance REAL DEFAULT 0,UNIQUE(user_id,currency));
      CREATE TABLE markets(id INTEGER PRIMARY KEY,symbol TEXT,name TEXT,asset_class TEXT,price REAL);`);
    for(const file of ['0017_paper_trading_ledger.sql','0023_advanced_paper_trading.sql','0030_wallet_funded_trading.sql'])this.sql.exec(readFileSync(new URL(`../../d1-migrations/${file}`,import.meta.url),'utf8'));
  }
  prepare(sql){return new Statement(this.sql,sql);}
  async batch(statements){this.sql.exec('BEGIN');try{const r=statements.map((s,index)=>{if(this.failNextBatch&&index===2){this.failNextBatch=false;throw new Error('Injected atomic fill failure');}return s.runSync();});this.sql.exec('COMMIT');return r;}catch(e){this.sql.exec('ROLLBACK');throw e;}}
}
const db=new Database(),tokens=new Map();
for(const id of ['advanced-a','advanced-b','advanced-futures','advanced-shared']) {
  db.sql.prepare('INSERT INTO auth_users VALUES (?,?,?,?)').run(id,`${id}@example.test`,'2026-01-01','2026-01-01');
  const token=`session-${id}`,digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));
  const hash=btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'');
  db.sql.prepare('INSERT INTO auth_sessions VALUES (?,?,?)').run(hash,id,'2099-01-01');tokens.set(id,token);
}
for(const [id,symbol,asset]of [[1,'BTCUSD','crypto'],[2,'ETHUSD','crypto'],[3,'USDJPY','forex'],[4,'ES=F','futures'],[5,'AAPL','stock']])db.sql.prepare('INSERT INTO markets VALUES (?,?,?,?,?)').run(id,symbol,symbol,asset,1);
for(const id of ['advanced-a','advanced-b','advanced-futures','advanced-shared'])db.sql.prepare("INSERT INTO wallets(user_id,currency,available) VALUES (?,'USD',?)").run(id,id==='advanced-futures'?1000000:id==='advanced-shared'?500:100000);
let time=Date.parse('2026-11-12T15:00:00Z');
const RealDate=Date,originalFetch=globalThis.fetch;
globalThis.Date=class extends RealDate {constructor(...args){super(...(args.length?args:[time]));}static now(){return time;}};
const prices=new Map([['BTCUSD',100],['ETHUSD',10],['USDJPY',150],['ES=F',5000],['AAPL',200]]);
const unavailable=new Set();
globalThis.fetch=async url=>{
  const u=new URL(url);if(u.hostname.includes('tradingview'))return new Response('',{status:503});
  let symbol;if(u.hostname.includes('coinbase'))symbol=u.pathname.split('/')[2].replace('-USD','USD');else symbol=decodeURIComponent(u.pathname.split('/').at(-1)).replace(/=X$/,'');
  if(unavailable.has(symbol))return new Response('',{status:429});
  const price=prices.get(symbol);assert.ok(price>0,`unexpected quote: ${symbol}`);
  if(u.hostname.includes('coinbase'))return Response.json({price:String(price),time:new Date().toISOString()});
  return Response.json({chart:{result:[{meta:{currency:symbol==='USDJPY'?'JPY':'USD',regularMarketPrice:price,regularMarketTime:Math.floor(time/1000),chartPreviousClose:price,regularMarketDayHigh:price,regularMarketDayLow:price}}]}});
};
const env={DB:db,APP_URL:'https://app.test'};
async function call(path,method='GET',body,user='advanced-a',headers={}) {
  return handleAdvancedTradingRequest(new Request(`https://app.test/api/paper/${path}`,{method,headers:{cookie:`apex_session=${tokens.get(user)}`,'content-type':'application/json',...headers},...(body?{body:JSON.stringify(body)}:{})}),env);
}
const buy=(extra={})=>({client_order_id:crypto.randomUUID(),market_id:1,side:'buy',type:'market',quantity:2,...extra});
const setPrice=(symbol,price)=>{prices.set(symbol,price);clearQuoteCache();};
try {
  const first=buy(),r=await call('orders','POST',first);assert.equal(r.status,201);const filled=await r.json();
  assert.equal((await call('orders','POST',first)).status,200);
  assert.equal(db.sql.prepare('SELECT reserved_cash FROM funded_accounts WHERE user_id=?').get('advanced-a').reserved_cash,200);
  assert.equal(db.sql.prepare('SELECT COUNT(*) AS n FROM funded_fills').get().n,1,'replays cannot create a second fill');
  assert.equal((await call('orders','POST',{...first,quantity:3})).status,409);
  const concurrent=buy({quantity:1});
  const duplicateResponses=await Promise.all([call('orders','POST',concurrent,'advanced-b'),call('orders','POST',concurrent,'advanced-b')]);
  assert.ok(duplicateResponses.every(r=>[200,201].includes(r.status)));
  assert.equal(db.sql.prepare('SELECT reserved_cash FROM funded_accounts WHERE user_id=?').get('advanced-b').reserved_cash,100,'concurrent requests reserve cash only once');
  setPrice('BTCUSD',110);
  const close={id:filled.position.id,quantity:1,client_request_id:crypto.randomUUID()};
  assert.equal((await call('positions','DELETE',close)).status,200);
  assert.equal((await call('positions','DELETE',close)).status,200);
  assert.equal((await call('positions','DELETE',{...close,quantity:.5})).status,409);
  let position=db.sql.prepare('SELECT * FROM funded_positions WHERE id=?').get(filled.position.id);
  assert.equal(position.quantity,1);assert.equal(position.reserved_cash,100);assert.equal(position.realized_pnl,10);
  const reduce=buy({side:'sell',type:'limit',limit_price:120,quantity:1,reduce_only:true,position_id:position.id});
  const reduced=await call('orders','POST',reduce);assert.equal(reduced.status,201);assert.equal((await reduced.json()).status,'pending');
  setPrice('BTCUSD',120);await call('sync','POST',{});
  assert.equal(db.sql.prepare('SELECT status FROM funded_positions WHERE id=?').get(position.id).status,'closed');
  assert.equal(db.sql.prepare('SELECT realized_pnl FROM funded_positions WHERE id=?').get(position.id).realized_pnl,30);

  setPrice('BTCUSD',100);
  const trail=await(await call('orders','POST',buy({quantity:1,stop_loss:90,take_profit:130,trailing_percent:10}))).json();
  setPrice('BTCUSD',110);await call('sync','POST',{});
  position=db.sql.prepare('SELECT * FROM funded_positions WHERE id=?').get(trail.position.id);assert.equal(position.stop_loss,99);
  setPrice('BTCUSD',105);await call('sync','POST',{});
  assert.equal(db.sql.prepare('SELECT stop_loss FROM funded_positions WHERE id=?').get(position.id).stop_loss,99,'trailing stops never loosen');
  setPrice('BTCUSD',98);await call('sync','POST',{});
  assert.equal(db.sql.prepare('SELECT status FROM funded_positions WHERE id=?').get(position.id).status,'closed');

  setPrice('BTCUSD',100);
  const expiring=await(await call('orders','POST',buy({type:'limit',limit_price:80,time_in_force:'GTD',expires_at:new Date(time+60000).toISOString()}))).json();
  time+=61000;clearQuoteCache();await call('sync','POST',{});
  assert.equal(db.sql.prepare('SELECT status FROM funded_orders WHERE id=?').get(expiring.id).status,'cancelled');
  const pending=await(await call('orders','POST',buy({type:'limit',limit_price:80}))).json();
  const amended=await call('orders','PATCH',{id:pending.id,version:pending.version,quantity:3,limit_price:85});assert.equal(amended.status,200);
  assert.equal((await call('orders','PATCH',{id:pending.id,version:pending.version,quantity:4,limit_price:86})).status,409);

  const future=await call('orders','POST',buy({market_id:4,quantity:1}),'advanced-futures');assert.equal(future.status,201);
  const futureBody=await future.json();assert.equal(futureBody.position.contract_multiplier,50);assert.equal(futureBody.position.reserved_cash,250000);
  setPrice('ES=F',5001);await call('sync','POST',{},'advanced-futures');
  assert.equal(db.sql.prepare('SELECT unrealized_pnl FROM funded_positions WHERE id=?').get(futureBody.position.id).unrealized_pnl,50);
  assert.equal((await call('orders','POST',buy({market_id:4,quantity:.5}),'advanced-futures')).status,400);

  const fx=await call('orders','POST',buy({market_id:3,quantity:1000}));assert.equal(fx.status,201);const fxPosition=(await fx.json()).position;
  assert.ok(Math.abs(fxPosition.reserved_cash-1000)<1e-8,'JPY notional is converted to USD');
  setPrice('USDJPY',151);await call('sync','POST',{});
  assert.ok(Math.abs(db.sql.prepare('SELECT unrealized_pnl FROM funded_positions WHERE id=?').get(fxPosition.id).unrealized_pnl-1000/151)<1e-8);

  const retainedBtc=(await(await call('orders','POST',buy({quantity:1}))).json()).position;
  const eth=(await(await call('orders','POST',buy({market_id:2,quantity:1}))).json()).position;
  unavailable.add('BTCUSD');setPrice('ETHUSD',12);await call('sync','POST',{});
  assert.equal(db.sql.prepare('SELECT unrealized_pnl FROM funded_positions WHERE id=?').get(eth.id).unrealized_pnl,2,'one failed quote must not block other marks');
  assert.ok(db.sql.prepare('SELECT mark_error FROM funded_positions WHERE id=?').get(retainedBtc.id).mark_error);
  assert.ok((await(await call('snapshot')).json()).account.stale_positions>0,'retained marks must be disclosed in account totals');
  unavailable.clear();clearQuoteCache();

  assert.equal((await call('journal','PUT',{position_id:filled.position.id,notes:'breakout',tags:'test'})).status,200);
  assert.equal((await call('journal','PUT',{position_id:filled.position.id,notes:'unauthorized'},'advanced-b')).status,404);
  const stats=await(await call('journal')).json();assert.ok(stats.statistics.closed_trades>=2);assert.equal(stats.positions.find(p=>p.id===filled.position.id).notes,'breakout');
  const alert=(await(await call('alerts','POST',{symbol:'ETHUSD',direction:'above',target:15})).json()).id;
  setPrice('ETHUSD',16);await call('sync','POST',{});
  assert.equal(db.sql.prepare('SELECT status FROM funded_alerts WHERE id=?').get(alert).status,'triggered');

  await call('preferences','PUT',{commission_bps:10},'advanced-b');
  setPrice('BTCUSD',100);const feeEntry=await(await call('orders','POST',buy({quantity:2}),'advanced-b')).json();
  setPrice('BTCUSD',110);await call('positions','DELETE',{id:feeEntry.position.id,client_request_id:crypto.randomUUID()},'advanced-b');
  const feePosition=db.sql.prepare('SELECT * FROM funded_positions WHERE id=?').get(feeEntry.position.id);
  assert.ok(Math.abs(feePosition.realized_pnl-19.58)<1e-8,'net realized P&L includes both entry and exit fees');
  const reservedBefore=db.sql.prepare('SELECT reserved_cash FROM funded_accounts WHERE user_id=?').get('advanced-a').reserved_cash;
  db.failNextBatch=true;const interrupted=buy({quantity:1});
  const interruptedBody=await(await call('orders','POST',interrupted)).json();assert.equal(interruptedBody.order.status,'pending');
  assert.equal(db.sql.prepare('SELECT reserved_cash FROM funded_accounts WHERE user_id=?').get('advanced-a').reserved_cash,reservedBefore,'an interrupted atomic fill must roll back its cash reservation');
  await call('sync','POST',{});
  assert.equal(db.sql.prepare('SELECT COUNT(*) AS n FROM funded_positions WHERE entry_order_id=?').get(interruptedBody.order.id).n,1,'a later retry fills once after rollback');
  for(let i=0;i<21;i++)assert.equal((await call('orders','POST',buy({type:'limit',limit_price:1,quantity:1}),'advanced-b')).status,201);
  const priority=await(await call('orders','POST',buy({quantity:1}),'advanced-b')).json();
  assert.equal(priority.order.status,'filled','a new market order cannot be starved behind twenty resting limits');

  const writes=db.sql.prepare('SELECT total_changes() AS n').get().n;
  await call('snapshot');await call('account');await call('positions');await call('orders');
  assert.equal(db.sql.prepare('SELECT total_changes() AS n').get().n,writes,'read endpoints never execute or mutate orders');
  assert.equal((await call('orders','POST',buy(),'advanced-a',{origin:'https://evil.test'})).status,403);
  const liveCalls=[];
  env.TRADING_ENGINE={idFromName:id=>id,get:id=>({fetch:async request=>{liveCalls.push({id,request});return Response.json({connected:true});}})};
  const liveTicket=await(await call('live-ticket','POST',{})).json();
  const connect=()=>handleAdvancedTradingRequest(new Request(liveTicket.url.replace(/^ws/,'http'),{headers:{origin:'https://app.test',upgrade:'websocket'}}),env);
  assert.equal((await connect()).status,200,'one-time ticket authenticates a direct Worker socket without sharing a session cookie');
  assert.equal(liveCalls.at(-1).id,'advanced-a');
  assert.equal((await connect()).status,401,'live tickets cannot be replayed');
  delete env.TRADING_ENGINE;
  const emitted=[],closedSockets=[],memory=new Map([['userId','advanced-a']]);let alarmAt=null;
  const socket={send:message=>emitted.push(JSON.parse(message)),deserializeAttachment:()=>({expires_at:time+900000}),close:code=>closedSockets.push(code)};
  const expiredSocket={...socket,deserializeAttachment:()=>({expires_at:time-1})};
  const state={blockConcurrencyWhile:fn=>fn(),getWebSockets:()=>[socket,expiredSocket],storage:{get:async key=>memory.get(key),put:async(key,value)=>memory.set(key,value),setAlarm:async value=>{alarmAt=value;},deleteAlarm:async()=>{alarmAt=null;}}};
  const engine=new TradingEngine(state,env);
  assert.equal((await engine.fetch(new Request('https://engine/wake',{headers:{'x-trading-user':'advanced-a'}}))).status,200);
  assert.equal(emitted.at(-1).type,'snapshot');assert.ok(closedSockets.includes(1008),'expired live channels must reauthenticate');
  assert.equal(alarmAt-time,5000,'active markets arm the faster execution cycle');
  assert.equal((await engine.fetch(new Request('https://engine/wake',{headers:{'x-trading-user':'advanced-b'}}))).status,403,'coordinators are scoped to one account');
  const idleState={...state,getWebSockets:()=>[],storage:{...state.storage,get:async()=> 'empty-user'}};
  const idle=new TradingEngine(idleState,env);await idle.fetch(new Request('https://engine/wake',{headers:{'x-trading-user':'empty-user'}}));
  assert.equal(alarmAt,null,'idle accounts do not run perpetual billable alarms');
  // Trading collateral and copying compete for the same wallet, atomically.
  db.sql.exec('CREATE TABLE traders(id INTEGER PRIMARY KEY); CREATE TABLE trader_trades(id INTEGER PRIMARY KEY); INSERT INTO traders VALUES(1);');
  db.sql.exec(readFileSync(new URL('../../d1-migrations/0020_copy_trading.sql',import.meta.url),'utf8'));
  setPrice('BTCUSD',100);
  const sharedEntry=await(await call('orders','POST',buy({quantity:1}),'advanced-shared')).json();
  const wallet=()=>db.sql.prepare("SELECT available,reserved FROM wallets WHERE user_id='advanced-shared'").get();
  assert.equal(wallet().available,400);assert.equal(wallet().reserved,100);
  db.sql.exec("INSERT INTO copy_follows(id,user_id,trader_id,allocated_amount,current_value,peak_value,fee_high_water,stop_loss_percent,take_profit_percent,leverage_multiplier,followed_at,updated_at) VALUES('shared-copy','advanced-shared',1,300,300,300,300,20,100,1,'2026-11-12','2026-11-12');");
  assert.equal(wallet().available,100);assert.equal(wallet().reserved,400);
  assert.equal((await(await call('snapshot','GET',undefined,'advanced-shared')).json()).account.available_cash,100);
  assert.equal((await call('orders','POST',buy({quantity:2}),'advanced-shared')).status,400,'copy reservations cannot be spent by trading');
  const sharedClose={id:sharedEntry.position.id,client_request_id:crypto.randomUUID()};
  assert.equal((await call('positions','DELETE',sharedClose,'advanced-shared')).status,200);
  assert.equal((await call('positions','DELETE',sharedClose,'advanced-shared')).status,200);
  assert.equal(wallet().available,200);assert.equal(wallet().reserved,300,'replayed closes release collateral once');
  db.sql.exec("UPDATE copy_follows SET status='stopped' WHERE id='shared-copy';");
  assert.equal(wallet().available,500);assert.equal(wallet().reserved,0);
  time=Date.parse('2026-11-12T23:00:00Z');clearQuoteCache();
  const ordersBefore=db.sql.prepare('SELECT COUNT(*) AS n FROM funded_orders').get().n;
  assert.equal((await call('orders','POST',buy({market_id:5,quantity:1}))).status,409);
  assert.equal(db.sql.prepare('SELECT COUNT(*) AS n FROM funded_orders').get().n,ordersBefore,'closed-session market orders do not create orders');
  console.log('ADVANCED_TRADING_TESTS_PASSED');
} finally {globalThis.Date=RealDate;globalThis.fetch=originalFetch;clearQuoteCache();db.sql.close();}
