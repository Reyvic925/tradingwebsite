import { runUserTradingCycle, tradingSnapshot } from './advanced-trading.js';
import { getInstrument } from '../shared/trading-instruments.js';
import { marketSession } from '../shared/trading-sessions.js';

export class TradingEngine {
  constructor(state,env) {
    this.state=state;this.env=env;this.userId=null;this.lastCycle=0;this.cyclePromise=null;
    this.ready=state.blockConcurrencyWhile(async()=>{this.userId=await state.storage.get('userId');});
  }
  broadcast(payload) {
    const message=JSON.stringify(payload);
    for(const socket of this.state.getWebSockets())try{
      if(socket.deserializeAttachment()?.expires_at<Date.now()){socket.close(1008,'Reauthenticate');continue;}
      socket.send(message);
    }catch{try{socket.close(1011,'Connection interrupted');}catch{/* already closed */}}
  }
  async snapshot() {return tradingSnapshot(this.env.DB,this.userId);}
  async arm(snapshot) {
    const working=snapshot.orders.filter(o=>['pending','triggered'].includes(o.status));
    const alerts=snapshot.alerts.filter(a=>a.status==='active');
    const symbols=[...new Set([...snapshot.positions,...working,...alerts].map(row=>row.symbol))];
    if(!symbols.length&&!this.state.getWebSockets().length){await this.state.storage.deleteAlarm();return;}
    const active=symbols.some(s=>marketSession(getInstrument(s)).open);
    // Avoid a five-second billing loop while every watched market is closed.
    await this.state.storage.setAlarm(Date.now()+(active?5000:30000));
  }
  async cycle() {
    if(this.cyclePromise)return this.cyclePromise;
    this.cyclePromise=(async()=>{
      if(Date.now()-this.lastCycle>=4500) {await runUserTradingCycle(this.env.DB,this.userId);this.lastCycle=Date.now();}
      const snapshot=await this.snapshot();this.broadcast({type:'snapshot',snapshot});await this.arm(snapshot);return snapshot;
    })();
    try{return await this.cyclePromise;}finally{this.cyclePromise=null;}
  }
  async fetch(request) {
    await this.ready;
    const id=request.headers.get('x-trading-user');
    if(!id||this.userId&&this.userId!==id)return new Response('Forbidden',{status:403});
    if(!this.userId){this.userId=id;await this.state.storage.put('userId',id);}
    const path=new URL(request.url).pathname;
    if(path==='/connect') {
      if(request.headers.get('upgrade')?.toLowerCase()!=='websocket')return new Response('WebSocket required',{status:426});
      const pair=new WebSocketPair(),[client,server]=Object.values(pair);
      this.state.acceptWebSocket(server);
      server.serializeAttachment({expires_at:Date.now()+15*60000});
      const snapshot=await this.snapshot();server.send(JSON.stringify({type:'snapshot',snapshot}));await this.arm(snapshot);
      return new Response(null,{status:101,webSocket:client});
    }
    if(path==='/cycle')return Response.json(await this.cycle());
    if(path==='/wake') {const snapshot=await this.snapshot();this.broadcast({type:'snapshot',snapshot});await this.arm(snapshot);return Response.json({ok:true});}
    return new Response('Not found',{status:404});
  }
  async alarm() {
    await this.ready;if(!this.userId)return;
    try{await this.cycle();}catch(error){console.warn('[trading-engine] Cycle failed',error.message);await this.state.storage.setAlarm(Date.now()+30000);}
  }
  async webSocketMessage(socket,message) {
    if(typeof message!=='string'||message.length>128){socket.close(1009,'Message too large');return;}
    if(message==='ping')socket.send(JSON.stringify({type:'pong',server_time:new Date().toISOString()}));
  }
  async webSocketClose(socket) {try{socket.close(1000,'Disconnected');}catch{/* already closed */}await this.arm(await this.snapshot());}
  async webSocketError(socket) {socket.close(1011,'Connection interrupted');}
}
