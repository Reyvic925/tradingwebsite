import { getAuthenticatedUser } from './auth.js';
import { getMarketQuote, warmTerminalQuotes } from './market-quotes.js';
import { getCatalogMarket } from '../shared/market-catalog.js';
import { getInstrument, validPrice, validQuantity, positionPnl, orderPreview } from '../shared/trading-instruments.js';
import { marketSession, dayExpiry } from '../shared/trading-sessions.js';
import { tradingCatalog, marketDepth, marketBars } from './trading-market-tools.js';
import { assertExecutionQuote } from '../shared/execution-quote.js';

const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{httpStatus:status});};
const iso=()=>new Date().toISOString();
const key=(value)=>typeof value==='string'&&/^[a-zA-Z0-9_.:-]{8,100}$/.test(value);
const positive=(value)=>Number.isFinite(Number(value))&&Number(value)>0;
const nullable=(value)=>value===null||value===undefined||value===''?null:Number(value);
const pendingStates="('pending','triggered')";
const utc=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)?value.replace(' ','T')+'Z':value;
const times=row=>Object.fromEntries(Object.entries(row).map(([name,value])=>[name,name.endsWith('_at')?utc(value):value]));
async function ticketHash(token) {return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))).map(b=>b.toString(16).padStart(2,'0')).join('');}

async function ensureAccount(db,userId) {
  await db.prepare("INSERT OR IGNORE INTO wallets(user_id,currency,available,reserved,locked_balance) VALUES (?,'USD',0,0,0)").bind(userId).run();
  await db.prepare('INSERT OR IGNORE INTO funded_accounts (user_id) VALUES (?)').bind(userId).run();
  return db.prepare('SELECT * FROM funded_accounts WHERE user_id = ?').bind(userId).first();
}
async function preferences(db,userId) { return await db.prepare('SELECT * FROM funded_preferences WHERE user_id = ?').bind(userId).first() || {commission_bps:0}; }

export async function terminalQuote(symbol,{execution=false}={}) {
  const market=getCatalogMarket(symbol), instrument=getInstrument(symbol);
  if(!market||!instrument)fail('This symbol is outside the verified market catalog.');
  const quote=await getMarketQuote({symbol,asset_class:market.asset_class},market.asset_class==='crypto'?{maxCacheMs:5000}:{});
  if(!quote)fail('Market provider unavailable. No price has been invented.',503);
  let rate=instrument.currency_scale,valuationError=null;
  if(instrument.conversion_currency!=='USD') {
    const fx=instrument.conversion_symbol?await getMarketQuote({symbol:instrument.conversion_symbol,asset_class:'forex'}):null;
    if(!fx||fx.quote_stale){rate=0;valuationError='The USD conversion quote is unavailable or stale.';}
    else rate*=instrument.conversion_symbol.startsWith('USD')?1/fx.price:fx.price;
  }
  const session=marketSession(instrument);
  const result={...quote,quote_currency:instrument.currency,quote_to_usd:rate,instrument,session,valuation_error:valuationError,
    quote_tradable:instrument.supported&&session.open&&!quote.quote_stale&&rate>0};
  if(execution&&!instrument.supported)fail(instrument.unavailable_reason);
  if(execution&&!session.open)fail(session.label,409);
  if(execution&&quote.quote_stale)fail('The execution quote is stale. Orders wait for a fresh quote.',503);
  if(execution&&valuationError)fail(valuationError,503);
  if(execution)assertExecutionQuote(quote,Date.now(),{maxAgeMs:market.asset_class==='crypto'?90000:undefined});
  return result;
}

function validateBrackets(side,entry,stop,take) {
  if(stop!==null&&(!positive(stop)||(side==='buy'?stop>=entry:stop<=entry)))fail('Stop loss must be on the loss side of the entry price.');
  if(take!==null&&(!positive(take)||(side==='buy'?take<=entry:take>=entry)))fail('Take profit must be on the profit side of the entry price.');
}
function orderResult(order,position) { return order.type==='market'?{order,position,price_source:order.quote_source,quote_updated_at:order.quote_updated_at}:order; }

async function createOrder(db,userId,body,receivedAt=iso()) {
  if(!key(body.client_order_id))fail('A unique client_order_id (8–100 safe characters) is required.');
  const marketId=Number(body.market_id), quantity=Number(body.quantity), side=body.side, type=body.type||'market';
  const limit=nullable(body.limit_price),stopPrice=nullable(body.stop_price),sl=nullable(body.stop_loss),tp=nullable(body.take_profit),trailing=nullable(body.trailing_percent);
  const tif=String(body.time_in_force||'GTC').toUpperCase();
  const intent=body.reduce_only?'reduce':'open',reduceId=body.reduce_only?Number(body.position_id):null;
  if(!Number.isSafeInteger(marketId)||marketId<=0||!['buy','sell'].includes(side)||!['market','limit','stop','stop_limit'].includes(type))fail('Invalid market, side or order type.');
  if(!['DAY','GTC','GTD'].includes(tif))fail('Time in force must be DAY, GTC or GTD.');
  const fingerprint=JSON.stringify([marketId,quantity,side,type,limit,stopPrice,sl,tp,trailing,tif,intent,reduceId,body.expires_at||null]);
  const previous=await db.prepare('SELECT * FROM funded_orders WHERE user_id = ? AND client_order_id = ?').bind(userId,body.client_order_id).first();
  if(previous) {
    if(previous.request_fingerprint!==fingerprint)fail('This client order ID was already used for different parameters.',409);
    const position=await db.prepare('SELECT * FROM funded_positions WHERE entry_order_id = ?').bind(previous.id).first();
    return {body:orderResult(previous,position),status:200};
  }
  const market=await db.prepare('SELECT id, symbol FROM markets WHERE id = ?').bind(marketId).first();
  const instrument=market&&getInstrument(market.symbol);
  if(!instrument?.supported)fail(instrument?.unavailable_reason||'Unknown or unsupported market.');
  if(!validQuantity(quantity,instrument))fail(`Quantity must be positive, in increments of ${instrument.quantity_step} ${instrument.unit}.`);
  if(['limit','stop_limit'].includes(type)&&!validPrice(limit,instrument))fail(`Limit price must respect the ${instrument.tick} tick size.`);
  if(['stop','stop_limit'].includes(type)&&!validPrice(stopPrice,instrument))fail(`Stop price must respect the ${instrument.tick} tick size.`);
  if(sl!==null&&!validPrice(sl,instrument)||tp!==null&&!validPrice(tp,instrument))fail('Stop loss and take profit must be positive prices on the instrument tick.');
  if(trailing!==null&&(!positive(trailing)||trailing>50))fail('Trailing distance must be greater than 0 and at most 50 percent.');
  if(intent==='reduce') {
    const position=await db.prepare("SELECT * FROM funded_positions WHERE id = ? AND user_id = ? AND status = 'open'").bind(reduceId,userId).first();
    if(!position||position.market_id!==marketId||quantity>position.quantity||side===(position.side==='long'?'buy':'sell'))fail('Reduce-only orders must oppose an existing position and cannot exceed its remaining quantity.');
  }
  let expires=null;
  if(tif==='DAY')expires=dayExpiry(instrument);
  if(tif==='GTD') {
    const time=Date.parse(body.expires_at);
    if(!Number.isFinite(time)||time<=Date.now())fail('Choose a future GTD expiry.');
    expires=new Date(time).toISOString();
  }
  if(['limit','stop_limit'].includes(type))validateBrackets(side,limit,sl,tp);
  if(type==='market') {const quote=await terminalQuote(market.symbol,{execution:true});if(intent==='open')validateBrackets(side,quote.price,sl,tp);}
  await ensureAccount(db,userId);
  const operation=`entry:${userId}:${body.client_order_id}`;
  await db.prepare(`INSERT OR IGNORE INTO funded_orders
    (user_id,market_id,operation_id,client_order_id,request_fingerprint,symbol,side,type,quantity,limit_price,stop_price,stop_loss,take_profit,
     time_in_force,expires_at,intent,reduce_position_id,trailing_percent,received_at)
    SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?
    WHERE (SELECT COUNT(*) FROM funded_orders WHERE user_id=? AND status IN ('pending','triggered'))<100`)
    .bind(userId,marketId,operation,body.client_order_id,fingerprint,market.symbol,side,type,quantity,limit,stopPrice,sl,tp,tif,expires,intent,reduceId,trailing,receivedAt,userId).run();
  const inserted=await db.prepare('SELECT * FROM funded_orders WHERE user_id = ? AND client_order_id = ?').bind(userId,body.client_order_id).first();
  if(!inserted)fail('Maximum 100 working orders per account. Cancel an order before adding another.');
  if(inserted.request_fingerprint!==fingerprint)fail('The order ID was concurrently used for different parameters.',409);
  await processOrders(db,userId,inserted.id);
  const order=await db.prepare('SELECT * FROM funded_orders WHERE id = ?').bind(inserted.id).first();
  if(order.status==='rejected')fail(order.reject_reason||'Order rejected.');
  const position=await db.prepare('SELECT * FROM funded_positions WHERE entry_order_id = ?').bind(order.id).first();
  return {body:orderResult(order,position),status:201};
}

async function fillOrder(db,userId,order,quote,commissionBps) {
  const filledAt=iso();
  assertExecutionQuote(quote,filledAt,{maxAgeMs:quote.instrument.asset_class==='crypto'?90000:undefined});
  const instrument=quote.instrument;
  if(order.intent==='reduce') {
    const position=await db.prepare("SELECT * FROM funded_positions WHERE id = ? AND user_id = ? AND status = 'open'").bind(order.reduce_position_id,userId).first();
    if(!position||order.quantity>position.quantity) {
      await db.prepare("UPDATE funded_orders SET status='rejected',reject_reason='Reduce-only quantity exceeds the open position.' WHERE id=? AND status IN ('pending','triggered')").bind(order.id).run();return;
    }
    return reducePosition(db,userId,position,quote,order.quantity,`reduce-order:${order.id}`,commissionBps,order);
  }
  try{validateBrackets(order.side,quote.price,order.stop_loss,order.take_profit);}catch(e){
    await db.prepare("UPDATE funded_orders SET status='rejected',reject_reason=? WHERE id=? AND status IN ('pending','triggered')").bind(e.message,order.id).run();return;
  }
  const cash=order.quantity*quote.price*instrument.multiplier*quote.quote_to_usd, fee=cash*commissionBps/10000;
  const batches=await db.batch([
    db.prepare(`UPDATE wallets SET reserved=reserved+?,available=available-?-?
      WHERE user_id=? AND currency='USD' AND available>=? AND EXISTS
      (SELECT 1 FROM funded_orders WHERE id=? AND user_id=? AND status IN ('pending','triggered') AND version=?)
      AND (SELECT COUNT(*) FROM funded_positions WHERE user_id=? AND status='open')<100`)
      .bind(cash,cash,fee,userId,cash+fee,order.id,userId,order.version,userId),
    db.prepare(`UPDATE funded_orders SET status='filled',filled_price=?,quote_source=?,quote_updated_at=?,filled_at=?,updated_at=CURRENT_TIMESTAMP,version=version+1
      WHERE id=? AND user_id=? AND status IN ('pending','triggered') AND version=? AND changes()=1`)
      .bind(quote.price,quote.price_source,quote.quote_updated_at,filledAt,order.id,userId,order.version),
    db.prepare(`INSERT INTO funded_positions
      (user_id,market_id,entry_order_id,symbol,side,quantity,initial_quantity,entry_price,current_price,reserved_cash,stop_loss,take_profit,
       price_source,quote_updated_at,contract_multiplier,quote_currency,quote_to_usd,valuation_version,trailing_percent,trail_reference,fees_paid,realized_pnl,opened_at)
      SELECT user_id,market_id,id,symbol,CASE WHEN side='buy' THEN 'long' ELSE 'short' END,quantity,quantity,?,?,?,stop_loss,take_profit,
        quote_source,quote_updated_at,?,?,?,2,trailing_percent,?,?,?,? FROM funded_orders WHERE id=? AND changes()=1`)
      .bind(quote.price,quote.price,cash,instrument.multiplier,instrument.currency,quote.quote_to_usd,quote.price,fee,-fee,filledAt,order.id),
    db.prepare(`INSERT INTO funded_fills (user_id,order_id,position_id,market_id,symbol,fill_type,side,quantity,price,quote_source,quote_updated_at,filled_at)
      SELECT o.user_id,o.id,p.id,o.market_id,o.symbol,'entry',o.side,o.quantity,o.filled_price,o.quote_source,o.quote_updated_at,o.filled_at
      FROM funded_orders o JOIN funded_positions p ON p.entry_order_id=o.id WHERE o.id=? AND changes()=1`).bind(order.id),
    db.prepare(`UPDATE funded_accounts SET reserved_cash=reserved_cash+?,realized_pnl=realized_pnl-?,updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND changes()=1`).bind(cash,fee,userId),
  ]);
  if(!batches[0]?.meta?.changes) {
    // A duplicate/concurrent fill must neither reserve cash again nor reject a filled order.
    await db.prepare(`UPDATE funded_orders SET status='rejected',reject_reason=CASE WHEN (SELECT COUNT(*) FROM funded_positions WHERE user_id=? AND status='open')>=100
      THEN 'Maximum 100 open positions.' ELSE 'Insufficient available USD balance.' END
      WHERE id=? AND status IN ('pending','triggered') AND version=?
      AND (EXISTS(SELECT 1 FROM wallets WHERE user_id=? AND currency='USD' AND available<?)
        OR (SELECT COUNT(*) FROM funded_positions WHERE user_id=? AND status='open')>=100)`)
      .bind(userId,order.id,order.version,userId,cash+fee,userId).run();
  }
}

async function processOrders(db,userId,focusOrderId=null) {
  await db.prepare(`UPDATE funded_orders SET status='cancelled',reject_reason='Order expired.',updated_at=CURRENT_TIMESTAMP,version=version+1
    WHERE user_id=? AND status IN ('pending','triggered') AND expires_at IS NOT NULL AND julianday(expires_at)<=julianday(?)`).bind(userId,iso()).run();
  const rows=await db.prepare(`SELECT * FROM funded_orders WHERE user_id=? AND status IN ('pending','triggered') AND type!='close' ${focusOrderId?'AND id=?':''} ORDER BY id LIMIT 100`).bind(userId,...(focusOrderId?[focusOrderId]:[])).all();
  const prefs=await preferences(db,userId),quotes=new Map();
  for(const order of rows.results||[]) {
    let quote;
    try {
      if(!quotes.has(order.symbol))quotes.set(order.symbol,await terminalQuote(order.symbol,{execution:true}));
      quote=quotes.get(order.symbol);
    }catch{continue;}
    let triggered=order.status==='triggered';
    if(['stop','stop_limit'].includes(order.type)&&!triggered) {
      triggered=order.side==='buy'?quote.price>=order.stop_price:quote.price<=order.stop_price;
      if(triggered)await db.prepare("UPDATE funded_orders SET status='triggered',triggered_at=? WHERE id=? AND status='pending'").bind(iso(),order.id).run();
    }
    const crossed=order.side==='buy'?quote.price<=order.limit_price:quote.price>=order.limit_price;
    if(order.type==='market'||order.type==='limit'&&crossed||order.type==='stop'&&triggered||order.type==='stop_limit'&&triggered&&crossed)
      try{await fillOrder(db,userId,order,quote,Number(prefs.commission_bps||0));}catch(error){console.warn('[trading] Order cycle failed',order.id,error.message);}
  }
}

async function reducePosition(db,userId,position,quote,quantity,clientId,commissionBps,order=null) {
  const filledAt=iso();
  assertExecutionQuote(quote,filledAt,{maxAgeMs:quote.instrument.asset_class==='crypto'?90000:undefined});
  if(!positive(quantity)||quantity>position.quantity)fail('Close quantity exceeds the remaining position.');
  if(position.valuation_version>=2&&!validQuantity(quantity,getInstrument(position.symbol)))fail('Close quantity does not match the instrument increment.');
  const rate=Number(position.valuation_version)>=2?quote.quote_to_usd:1;
  const gross=positionPnl({...position,quantity},quote.price,rate);
  const fee=quantity*quote.price*position.contract_multiplier*rate*commissionBps/10000;
  const released=position.reserved_cash*quantity/position.quantity,remaining=position.quantity-quantity;
  const net=gross-fee,id=`settle:${userId}:${clientId}`,operation=`close:${id}`;
  const closeSide=position.side==='long'?'sell':'buy';
  const statements=[
    db.prepare(`INSERT OR IGNORE INTO funded_reductions(id,user_id,position_id,client_request_id,quantity,released_cash,gross_pnl,fee,net_pnl,created_at)
      SELECT ?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM funded_positions WHERE id=? AND user_id=? AND status='open' AND version=? AND quantity>=?)
      ${order?"AND EXISTS(SELECT 1 FROM funded_orders WHERE id=? AND status IN ('pending','triggered') AND version=?)":''}`)
      .bind(id,userId,position.id,clientId,quantity,released,gross,fee,net,filledAt,position.id,userId,position.version,quantity,...(order?[order.id,order.version]:[])),
    db.prepare(`UPDATE funded_positions SET quantity=?,status=?,current_price=?,unrealized_pnl=?,realized_pnl=COALESCE(realized_pnl,0)+?,
      reserved_cash=MAX(0,reserved_cash-?),fees_paid=fees_paid+?,price_source=?,quote_updated_at=?,quote_to_usd=?,
      closed_at=?,version=version+1 WHERE id=? AND user_id=? AND changes()=1`)
      .bind(remaining>1e-10?remaining:position.quantity,remaining>1e-10?'open':'closed',quote.price,
        remaining>1e-10?positionPnl({...position,quantity:remaining},quote.price,rate):0,net,released,fee,quote.price_source,quote.quote_updated_at,rate,remaining>1e-10?null:filledAt,position.id,userId),
    db.prepare(`UPDATE wallets SET available=available+?,reserved=reserved-?
      WHERE user_id=? AND currency='USD' AND changes()=1`).bind(released+net,released,userId),
    db.prepare(`UPDATE funded_accounts SET reserved_cash=MAX(0,reserved_cash-?),realized_pnl=realized_pnl+?,updated_at=CURRENT_TIMESTAMP
      WHERE user_id=? AND changes()=1`).bind(released,net,userId),
  ];
  if(order)statements.push(db.prepare(`UPDATE funded_orders SET status='filled',filled_price=?,quote_source=?,quote_updated_at=?,filled_at=?,version=version+1
    WHERE id=? AND changes()=1`).bind(quote.price,quote.price_source,quote.quote_updated_at,filledAt,order.id));
  else statements.push(db.prepare(`INSERT INTO funded_orders (user_id,market_id,operation_id,symbol,side,type,quantity,status,filled_price,quote_source,quote_updated_at,filled_at,intent)
    SELECT ?,?,?,?,?,'close',?,'filled',?,?,?,?,'reduce' WHERE changes()=1`).bind(userId,position.market_id,operation,position.symbol,closeSide,quantity,quote.price,quote.price_source,quote.quote_updated_at,filledAt));
  statements.push(db.prepare(`INSERT INTO funded_fills (user_id,order_id,position_id,market_id,symbol,fill_type,side,quantity,price,quote_source,quote_updated_at,filled_at)
    SELECT ?,o.id,?,?,?,'close',?, ?,o.filled_price,o.quote_source,o.quote_updated_at,o.filled_at FROM funded_orders o WHERE ${order?'o.id=?':'o.operation_id=?'} AND changes()=1`)
    .bind(userId,position.id,position.market_id,position.symbol,closeSide,quantity,order?order.id:operation));
  statements.push(db.prepare(`UPDATE funded_orders SET status='cancelled',reject_reason='Linked position is closed.',version=version+1
    WHERE user_id=? AND reduce_position_id=? AND status IN ('pending','triggered')
      AND EXISTS(SELECT 1 FROM funded_positions WHERE id=? AND status='closed')`).bind(userId,position.id,position.id));
  const result=await db.batch(statements);
  if(!result[0]?.meta?.changes) {
    const existing=await db.prepare('SELECT * FROM funded_reductions WHERE user_id=? AND client_request_id=?').bind(userId,clientId).first();
    if(!existing)fail('The position changed concurrently. Refresh and retry.',409);
    if(existing.position_id!==position.id||existing.quantity!==quantity)fail('Close request ID was already used for different parameters.',409);
  }
  return db.prepare('SELECT * FROM funded_positions WHERE id=? AND user_id=?').bind(position.id,userId).first();
}

async function markPositions(db,userId) {
  const rows=await db.prepare("SELECT * FROM funded_positions WHERE user_id=? AND status='open' ORDER BY id LIMIT 100").bind(userId).all();
  const prefs=await preferences(db,userId),quotes=new Map();
  for(const position of rows.results||[]) {
    let quote;
    try{if(!quotes.has(position.symbol))quotes.set(position.symbol,await terminalQuote(position.symbol));quote=quotes.get(position.symbol);}
    catch(error){await db.prepare("UPDATE funded_positions SET mark_error=? WHERE id=? AND user_id=? AND status='open'").bind(error.message,position.id,userId).run();continue;}
    if(quote.quote_stale||position.valuation_version>=2&&!quote.quote_to_usd){await db.prepare("UPDATE funded_positions SET mark_error=? WHERE id=? AND user_id=? AND status='open'").bind(quote.quote_stale?'Provider quote is stale.':'USD conversion unavailable.',position.id,userId).run();continue;}
    const rate=position.valuation_version>=2?quote.quote_to_usd:1;
    let reference=position.trail_reference||position.entry_price,stop=position.stop_loss;
    if(position.trailing_percent) {
      reference=position.side==='long'?Math.max(reference,quote.price):Math.min(reference,quote.price);
      const trailing=reference*(1+(position.side==='long'?-1:1)*position.trailing_percent/100);
      stop=stop===null?trailing:position.side==='long'?Math.max(stop,trailing):Math.min(stop,trailing);
    }
    const marked=await db.prepare(`UPDATE funded_positions SET current_price=?,unrealized_pnl=?,quote_to_usd=?,price_source=?,quote_updated_at=?,
      trail_reference=?,stop_loss=?,mark_error=NULL,version=version+1 WHERE id=? AND user_id=? AND status='open' AND version=? RETURNING *`)
      .bind(quote.price,positionPnl(position,quote.price,rate),rate,quote.price_source,quote.quote_updated_at,reference,stop,position.id,userId,position.version).first();
    if(!marked)continue;
    const loss=stop!==null&&(position.side==='long'?quote.price<=stop:quote.price>=stop);
    const profit=position.take_profit!==null&&(position.side==='long'?quote.price>=position.take_profit:quote.price<=position.take_profit);
    if(quote.session.open&&(loss||profit))try{await reducePosition(db,userId,marked,quote,marked.quantity,`risk:${marked.id}:${marked.version}`,prefs.commission_bps||0);}catch(error){console.warn('[trading] Risk settlement deferred',marked.id,error.message);}
  }
}

async function evaluateAlerts(db,userId) {
  const result=await db.prepare("SELECT * FROM funded_alerts WHERE user_id=? AND status='active' ORDER BY created_at LIMIT 20").bind(userId).all();
  const quotes=new Map();
  for(const alert of result.results||[]) {
    try {
      if(!quotes.has(alert.symbol))quotes.set(alert.symbol,await terminalQuote(alert.symbol));
      const quote=quotes.get(alert.symbol);
      if(!quote.quote_stale&&(alert.direction==='above'?quote.price>=alert.target:quote.price<=alert.target))
        await db.prepare("UPDATE funded_alerts SET status='triggered',triggered_price=?,triggered_at=? WHERE id=? AND user_id=? AND status='active'").bind(quote.price,iso(),alert.id,userId).run();
    }catch{continue;}
  }
}

export async function runUserTradingCycle(db,userId) {
  const active=await db.prepare(`SELECT symbol FROM funded_orders WHERE user_id=? AND status IN ${pendingStates}
    UNION SELECT symbol FROM funded_positions WHERE user_id=? AND status='open'
    UNION SELECT symbol FROM funded_alerts WHERE user_id=? AND status='active'`).bind(userId,userId,userId).all();
  const symbols=(active.results||[]).map(row=>row.symbol);
  await warmTerminalQuotes([...symbols,...symbols.map(s=>getInstrument(s)?.conversion_symbol).filter(Boolean)]);
  await processOrders(db,userId);
  await markPositions(db,userId);
  await evaluateAlerts(db,userId);
}

export async function tradingSnapshot(db,userId) {
  const account=await db.prepare('SELECT * FROM funded_accounts WHERE user_id=?').bind(userId).first();
  const wallet=await db.prepare("SELECT available FROM wallets WHERE user_id=? AND currency='USD'").bind(userId).first();
  const [positions,orders,fills,alerts,prefs]=await Promise.all([
    db.prepare("SELECT * FROM funded_positions WHERE user_id=? AND status='open' ORDER BY id DESC").bind(userId).all(),
    db.prepare("SELECT * FROM funded_orders WHERE user_id=? ORDER BY CASE WHEN status IN ('pending','triggered') THEN 0 ELSE 1 END,id DESC LIMIT 100").bind(userId).all(),
    db.prepare('SELECT * FROM funded_fills WHERE user_id=? ORDER BY id DESC LIMIT 100').bind(userId).all(),
    db.prepare('SELECT * FROM funded_alerts WHERE user_id=? ORDER BY created_at DESC LIMIT 100').bind(userId).all(),preferences(db,userId),
  ]);
  const rows=positions.results||[],pnl=rows.reduce((total,p)=>total+Number(p.unrealized_pnl||0),0);
  const marked=rows.map((p)=>({...times(p),quote_stale:Boolean(p.mark_error)||!p.quote_updated_at||Date.now()-Date.parse(utc(p.quote_updated_at))>(getInstrument(p.symbol)?.asset_class==='crypto'?90000:20*60000)}));
  const reserved=Number(account?.reserved_cash||0),available=Number(wallet?.available||0),cash=available+reserved;
  return {account:{initial_cash:0,funding_source:'USD wallet',cash_balance:cash,reserved_cash:reserved,available_cash:cash-reserved,
    realized_pnl:Number(account?.realized_pnl||0),unrealized_pnl:pnl,equity:cash+pnl,
    quote_source:rows[0]?.price_source||null,quote_updated_at:rows[0]?.quote_updated_at||null,stale_positions:marked.filter(p=>p.quote_stale).length},
    positions:marked,
    orders:(orders.results||[]).map(times),fills:(fills.results||[]).map(times),alerts:(alerts.results||[]).map(times),preferences:prefs,
    server_time:iso(),execution_model:'USD wallet collateral; internally recorded execution, no external broker routing; provider-delayed quotes; stops are not guaranteed prices'};
}

async function amendOrder(db,userId,body) {
  if(!Number.isSafeInteger(Number(body.id))||Number(body.id)<=0)fail('A valid order ID is required.');
  const order=await db.prepare(`SELECT * FROM funded_orders WHERE id=? AND user_id=? AND status IN ${pendingStates}`).bind(Number(body.id),userId).first();
  if(!order)fail('Pending order not found.',404);
  const spec=getInstrument(order.symbol),quantity=body.quantity===undefined?order.quantity:Number(body.quantity);
  if(!spec?.supported)fail('This market is no longer eligible for order amendments. Cancel the order instead.');
  const limit=body.limit_price===undefined?order.limit_price:nullable(body.limit_price),stop=body.stop_price===undefined?order.stop_price:nullable(body.stop_price);
  if(!validQuantity(quantity,spec))fail('Invalid quantity increment.');
  if(['limit','stop_limit'].includes(order.type)&&!validPrice(limit,spec)||['stop','stop_limit'].includes(order.type)&&!validPrice(stop,spec))fail('Invalid order price tick.');
  if(order.status==='triggered'&&body.stop_price!==undefined&&stop!==order.stop_price)fail('A triggered stop cannot be reset; cancel and replace it.');
  if(['limit','stop_limit'].includes(order.type)&&order.intent!=='reduce')validateBrackets(order.side,limit,order.stop_loss,order.take_profit);
  const tif=String(body.time_in_force||order.time_in_force).toUpperCase();let expires=order.expires_at;
  if(!['DAY','GTC','GTD'].includes(tif))fail('Invalid time in force.');
  if(body.time_in_force!==undefined||body.expires_at!==undefined) {
    expires=tif==='GTC'?null:tif==='DAY'?dayExpiry(spec):body.expires_at;
    if(tif==='GTD'&&(!Number.isFinite(Date.parse(expires))||Date.parse(expires)<=Date.now()))fail('GTD expiry must be in the future.');
  }
  const updated=await db.prepare(`UPDATE funded_orders SET quantity=?,limit_price=?,stop_price=?,time_in_force=?,expires_at=?,updated_at=CURRENT_TIMESTAMP,version=version+1
    WHERE id=? AND user_id=? AND version=? AND status IN ${pendingStates} RETURNING *`).bind(quantity,limit,stop,tif,expires,order.id,userId,Number(body.version??order.version)).first();
  if(!updated)fail('Order changed concurrently. Refresh before amending.',409);
  return updated;
}

async function journal(db,userId) {
  const result=await db.prepare(`SELECT p.*,j.notes,j.tags FROM funded_positions p LEFT JOIN funded_journal j ON j.position_id=p.id AND j.user_id=p.user_id
    WHERE p.user_id=? ORDER BY p.id DESC LIMIT 500`).bind(userId).all();
  const totals=await db.prepare(`SELECT COUNT(*) AS trades,SUM(CASE WHEN realized_pnl>0 THEN 1 ELSE 0 END) AS wins,
    SUM(CASE WHEN realized_pnl<0 THEN 1 ELSE 0 END) AS losses,SUM(CASE WHEN realized_pnl>0 THEN realized_pnl ELSE 0 END) AS gross_win,
    SUM(CASE WHEN realized_pnl<0 THEN -realized_pnl ELSE 0 END) AS gross_loss,COALESCE(SUM(realized_pnl),0) AS net
    FROM funded_positions WHERE user_id=? AND status='closed'`).bind(userId).first();
  return {positions:(result.results||[]).map(times),statistics:{closed_trades:totals.trades,win_rate:totals.trades?totals.wins/totals.trades*100:null,
    average_win:totals.wins?totals.gross_win/totals.wins:null,average_loss:totals.losses?totals.gross_loss/totals.losses:null,
    profit_factor:totals.gross_loss?totals.gross_win/totals.gross_loss:null,expectancy:totals.trades?totals.net/totals.trades:null,net_realized:totals.net}};
}

async function notifyEngine(env,userId) {
  if(!env.TRADING_ENGINE)return;
  try { const stub=env.TRADING_ENGINE.get(env.TRADING_ENGINE.idFromName(userId));await stub.fetch('https://engine/wake',{headers:{'x-trading-user':userId}}); }
  catch(error){console.warn('[trading] Live engine wake failed',error.message);}
}

export async function handleAdvancedTradingRequest(request,env) {
  const requestReceivedAt=iso();
  try {
    const db=env.DB,url=new URL(request.url),path=url.pathname,method=request.method;
    const origin=request.headers.get('origin');
    const allowedOrigins=new Set([url.origin,env.APP_URL,...String(env.FRONTEND_ORIGINS||'').split(',')].filter(Boolean));
    if(env.APP_URL){try{const canonical=new URL(env.APP_URL);if(canonical.hostname.startsWith('www.')){canonical.hostname=canonical.hostname.slice(4);allowedOrigins.add(canonical.origin);}}catch{/* invalid optional origin never broadens access */}}
    if(origin&&(method!=='GET'||path==='/api/paper/live')&&!allowedOrigins.has(origin))return json({error:'Origin is not allowed.'},403);
    let user;
    if(path==='/api/paper/live'&&url.searchParams.has('ticket')) {
      const token=url.searchParams.get('ticket');if(!/^[a-f0-9]{64}$/.test(token))return json({error:'Invalid live ticket.'},401);
      const ticket=await db.prepare('DELETE FROM funded_live_tickets WHERE token_hash=? AND expires_at>? RETURNING user_id').bind(await ticketHash(token),Date.now()).first();
      if(ticket)user={id:ticket.user_id};
    }else user=await getAuthenticatedUser(request,env);
    if(!user)return json({error:'Unauthorized'},401);
    if(method==='OPTIONS')return new Response(null,{status:204});
    if(path==='/api/paper/live') {
      if(!env.TRADING_ENGINE)return json({error:'Live engine unavailable; use synchronized polling.'},503);
      const headers=new Headers(request.headers);headers.set('x-trading-user',user.id);
      return env.TRADING_ENGINE.get(env.TRADING_ENGINE.idFromName(user.id)).fetch(new Request('https://engine/connect',{method,headers}));
    }
    if(path==='/api/paper/live-ticket'&&method==='POST') {
      if(!env.TRADING_ENGINE)return json({error:'Live engine unavailable.'},503);
      const token=Array.from(crypto.getRandomValues(new Uint8Array(32))).map(b=>b.toString(16).padStart(2,'0')).join('');
      await db.prepare('DELETE FROM funded_live_tickets WHERE expires_at<=?').bind(Date.now()).run();
      await db.prepare('INSERT INTO funded_live_tickets(token_hash,user_id,expires_at) VALUES (?,?,?)').bind(await ticketHash(token),user.id,Date.now()+60000).run();
      return json({url:`${url.origin.replace(/^http/,'ws')}/api/paper/live?ticket=${token}`,expires_in:60});
    }
    if(path==='/api/paper/catalog'&&method==='GET')return json({items:await tradingCatalog(db)});
    if(path==='/api/paper/book'&&method==='GET')return json(await marketDepth(String(url.searchParams.get('symbol')||'').toUpperCase()));
    if(path==='/api/paper/bars'&&method==='GET')return json(await marketBars(String(url.searchParams.get('symbol')||'').toUpperCase(),url.searchParams.get('interval')||'1m'));
    if(path==='/api/paper/quotes'&&method==='GET') {
      const symbols=[...new Set(String(url.searchParams.get('symbols')||'').split(',').map(s=>s.toUpperCase()))].slice(0,12);
      return json({items:await Promise.all(symbols.filter(s=>getCatalogMarket(s)).map(async symbol=>({symbol,...await getMarketQuote({symbol,asset_class:getCatalogMarket(symbol).asset_class})})))});
    }
    if(path==='/api/paper/snapshot'&&method==='GET')return json(await tradingSnapshot(db,user.id));
    if(path==='/api/paper/sync'&&method==='POST') {
      await ensureAccount(db,user.id);
      if(env.TRADING_ENGINE)return env.TRADING_ENGINE.get(env.TRADING_ENGINE.idFromName(user.id)).fetch('https://engine/cycle',{headers:{'x-trading-user':user.id}});
      await runUserTradingCycle(db,user.id);return json(await tradingSnapshot(db,user.id));
    }
    if(path==='/api/paper/account'&&method==='GET')return json((await tradingSnapshot(db,user.id)).account);
    if(path==='/api/paper/positions'&&method==='GET')return json((await tradingSnapshot(db,user.id)).positions);
    if(path==='/api/paper/orders'&&method==='GET') {
      if(!url.searchParams.has('before'))return json((await tradingSnapshot(db,user.id)).orders);
      const result=await db.prepare('SELECT * FROM funded_orders WHERE user_id=? AND id<? ORDER BY id DESC LIMIT 100').bind(user.id,Number(url.searchParams.get('before'))||Number.MAX_SAFE_INTEGER).all();return json((result.results||[]).map(times));
    }
    if(path==='/api/paper/fills'&&method==='GET') {
      const before=Number(url.searchParams.get('before'))||Number.MAX_SAFE_INTEGER;
      const result=await db.prepare('SELECT * FROM funded_fills WHERE user_id=? AND id<? ORDER BY id DESC LIMIT 100').bind(user.id,before).all();return json((result.results||[]).map(times));
    }
    if(path==='/api/paper/quote'&&method==='GET')return json(await terminalQuote(String(url.searchParams.get('symbol')||'').toUpperCase()));
    if(path==='/api/paper/preview'&&method==='POST') {
      const body=await request.json(),quote=await terminalQuote(body.symbol),prefs=await preferences(db,user.id),snapshot=await tradingSnapshot(db,user.id);
      return json({...orderPreview({instrument:quote.instrument,price:body.price||quote.price,quantity:Number(body.quantity),side:body.side,
        stopLoss:Number(body.stop_loss),takeProfit:Number(body.take_profit),rate:quote.quote_to_usd,equity:snapshot.account.equity,commissionBps:prefs.commission_bps}),quote});
    }
    if(path==='/api/paper/orders'&&method==='POST') {
      const result=await createOrder(db,user.id,await request.json(),requestReceivedAt);await notifyEngine(env,user.id);return json(result.body,result.status);
    }
    if(path==='/api/paper/orders'&&method==='PATCH') {const result=await amendOrder(db,user.id,await request.json());await notifyEngine(env,user.id);return json(result);}
    if(path==='/api/paper/orders'&&method==='DELETE') {
      const body=await request.json();
      const changed=await db.prepare(`UPDATE funded_orders SET status='cancelled',updated_at=CURRENT_TIMESTAMP,version=version+1 WHERE id=? AND user_id=? AND status IN ${pendingStates} RETURNING id`).bind(Number(body.id),user.id).first();
      if(!changed)fail('Pending order not found.',404);await notifyEngine(env,user.id);return json({ok:true});
    }
    if(path==='/api/paper/positions'&&method==='DELETE') {
      const body=await request.json();if(!key(body.client_request_id))fail('A unique client_request_id is required for closing.');
      if(!Number.isSafeInteger(Number(body.id))||Number(body.id)<=0)fail('A valid position ID is required.');
      const previous=await db.prepare('SELECT * FROM funded_reductions WHERE user_id=? AND client_request_id=?').bind(user.id,body.client_request_id).first();
      if(previous) {if(previous.position_id!==Number(body.id)||body.quantity!==undefined&&Number(body.quantity)!==previous.quantity)fail('Close ID belongs to different reduction parameters.',409);return json(await db.prepare('SELECT * FROM funded_positions WHERE id=? AND user_id=?').bind(Number(body.id),user.id).first());}
      const position=await db.prepare("SELECT * FROM funded_positions WHERE id=? AND user_id=? AND status='open'").bind(Number(body.id),user.id).first();
      if(!position)fail('Open position not found.',404);
      const quote=await terminalQuote(position.symbol,{execution:true}),prefs=await preferences(db,user.id);
      const result=await reducePosition(db,user.id,position,quote,body.quantity===undefined?position.quantity:Number(body.quantity),body.client_request_id,prefs.commission_bps||0);
      await notifyEngine(env,user.id);return json(result);
    }
    if(path==='/api/paper/positions'&&method==='PUT') {
      const body=await request.json();if(!Number.isSafeInteger(Number(body.id))||Number(body.id)<=0)fail('A valid position ID is required.');
      const position=await db.prepare("SELECT * FROM funded_positions WHERE id=? AND user_id=? AND status='open'").bind(Number(body.id),user.id).first();
      if(!position)fail('Open position not found.',404);
      const sl=nullable(body.stop_loss),tp=nullable(body.take_profit),trailing=nullable(body.trailing_percent);
      if(trailing!==null&&(!positive(trailing)||trailing>50))fail('Invalid trailing percent.');
      validateBrackets(position.side==='long'?'buy':'sell',position.current_price,sl,tp);
      const result=await db.prepare(`UPDATE funded_positions SET stop_loss=?,take_profit=?,trailing_percent=?,version=version+1
        WHERE id=? AND user_id=? AND status='open' AND version=? RETURNING *`).bind(sl,tp,trailing,position.id,user.id,Number(body.version??position.version)).first();
      if(!result)fail('Position changed concurrently.',409);await notifyEngine(env,user.id);return json(result);
    }
    if(path==='/api/paper/preferences'&&method==='PUT') {
      const body=await request.json(),bps=Number(body.commission_bps);if(!Number.isFinite(bps)||bps<0||bps>1000)fail('Simulated commission must be 0–1000 basis points.');
      await db.prepare('INSERT INTO funded_preferences(user_id,commission_bps) VALUES (?,?) ON CONFLICT(user_id) DO UPDATE SET commission_bps=excluded.commission_bps,updated_at=CURRENT_TIMESTAMP').bind(user.id,bps).run();return json({commission_bps:bps});
    }
    if(path==='/api/paper/journal'&&method==='GET')return json(await journal(db,user.id));
    if(path==='/api/paper/journal'&&method==='PUT') {
      const body=await request.json();const position=await db.prepare('SELECT id FROM funded_positions WHERE id=? AND user_id=?').bind(Number(body.position_id),user.id).first();
      if(!position)fail('Position not found.',404);
      const notes=String(body.notes||'').slice(0,4000),tags=String(body.tags||'').slice(0,250);
      await db.prepare('INSERT INTO funded_journal(user_id,position_id,notes,tags) VALUES (?,?,?,?) ON CONFLICT(user_id,position_id) DO UPDATE SET notes=excluded.notes,tags=excluded.tags,updated_at=CURRENT_TIMESTAMP').bind(user.id,position.id,notes,tags).run();return json({ok:true});
    }
    if(path==='/api/paper/alerts'&&method==='POST') {
      const body=await request.json();if(!getCatalogMarket(body.symbol)||!['above','below'].includes(body.direction)||!positive(body.target))fail('Invalid price alert.');
      const id=crypto.randomUUID();const inserted=await db.prepare("INSERT INTO funded_alerts(id,user_id,symbol,direction,target) SELECT ?,?,?,?,? WHERE (SELECT COUNT(*) FROM funded_alerts WHERE user_id=? AND status='active')<20").bind(id,user.id,body.symbol,body.direction,Number(body.target),user.id).run();
      if(!inserted.meta?.changes)fail('Maximum 20 active price alerts. Cancel an alert before adding another.');
      await notifyEngine(env,user.id);return json({id},201);
    }
    if(path==='/api/paper/alerts'&&method==='DELETE') {const body=await request.json();await db.prepare("UPDATE funded_alerts SET status='cancelled' WHERE id=? AND user_id=? AND status='active'").bind(body.id,user.id).run();return json({ok:true});}
    return json({error:'Not found'},404);
  }catch(error){if(!error.httpStatus)console.error('[advanced-trading]',error);return json({error:error.httpStatus?error.message:'Trading is temporarily unavailable.'},error.httpStatus||500);}
}

export async function runAdvancedTick(env) {
  const result=await env.DB.prepare(`SELECT user_id FROM funded_orders WHERE status IN ${pendingStates}
    UNION SELECT user_id FROM funded_positions WHERE status='open' UNION SELECT user_id FROM funded_alerts WHERE status='active'`).all();
  for(const account of result.results||[]) {
    try{if(env.TRADING_ENGINE)await notifyEngine(env,account.user_id);else await runUserTradingCycle(env.DB,account.user_id);}
    catch(error){console.warn('[trading] Account cycle failed',error.message);}
  }
}
