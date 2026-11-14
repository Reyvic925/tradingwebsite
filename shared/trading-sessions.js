const NY = 'America/New_York';
const formatters = new Map();
const sessionCache = new Map();
// NYSE published core-session calendars, including explicitly published early closes.
const HOLIDAYS = {
  2026:['01-01','01-19','02-16','04-03','05-25','06-19','07-03','09-07','11-26','12-25'],
  2027:['01-01','01-18','02-15','03-26','05-31','06-18','07-05','09-06','11-25','12-24'],
  2028:['01-17','02-21','04-14','05-29','06-19','07-04','09-04','11-23','12-25'],
};
const EARLY = {'2026-11-27':13*60,'2026-12-24':13*60,'2027-11-26':13*60,'2028-07-03':13*60,'2028-11-24':13*60};
const FUTURES_REVIEW_DAYS = {
  2026:['10-12','11-11','12-24','12-31'],
  2027:['10-11','11-11','12-23','12-31'],
  2028:['10-09','11-10','12-22','12-24','12-31'],
};
function parts(now, zone = NY) {
  if (!formatters.has(zone)) formatters.set(zone,new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23',weekday:'short'}));
  const values = Object.fromEntries(formatters.get(zone).formatToParts(now).map((p)=>[p.type,p.value]));
  return { date:`${values.year}-${values.month}-${values.day}`, year:Number(values.year), minute:Number(values.hour)*60+Number(values.minute), weekday:values.weekday };
}
function localTime(date, minute, zone = NY) {
  const [y,m,d] = date.split('-').map(Number);
  const target = Date.UTC(y,m-1,d,Math.floor(minute/60),minute%60);
  let result = target;
  for (let i=0;i<3;i++) {
    const p=parts(new Date(result),zone);
    const [py,pm,pd]=p.date.split('-').map(Number);
    const represented=Date.UTC(py,pm-1,pd,Math.floor(p.minute/60),p.minute%60);
    result += target-represented;
  }
  return result;
}
export function parseZonedExpiry(value,timezone) {
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))throw new Error('Choose an expiry date and time.');
  const [date,time]=value.split('T'),[hour,minute]=time.split(':').map(Number);
  const result=localTime(date,hour*60+minute,timezone),check=parts(new Date(result),timezone);
  if(check.date!==date||check.minute!==hour*60+minute)throw new Error('This local time does not exist because of a clock change. Choose another time.');
  return new Date(result).toISOString();
}
function isHoliday(p) { return HOLIDAYS[p.year]?.includes(p.date.slice(5)); }
function phase(instrument, now) {
  if (instrument.session === 'crypto') return {open:true,label:'Open · 24/7',close:null};
  const p=parts(now);
  const weekend=p.weekday==='Sat'||p.weekday==='Sun';
  if (instrument.session === 'us_equity') {
    if (!HOLIDAYS[p.year]) return {open:false,label:'Calendar coverage unavailable',close:null};
    const close=EARLY[p.date]||16*60;
    const open=!weekend&&!isHoliday(p)&&p.minute>=570&&p.minute<close;
    return {open,label:isHoliday(p)?'Exchange holiday':weekend?'Weekend':open?(EARLY[p.date]?'Open · early close':'Regular session'):p.minute<570?'Pre-market · execution queued':'Market closed',close:localTime(p.date,close)};
  }
  if (instrument.session === 'fx' || instrument.session === 'globex') {
    if (!HOLIDAYS[p.year]) return {open:false,label:'Calendar coverage unavailable',close:null};
    const sundayOpen=instrument.session==='globex'?18*60:17*60;
    const weeklyClosed=p.weekday==='Sat'||p.weekday==='Sun'&&p.minute<sundayOpen||p.weekday==='Fri'&&p.minute>=17*60;
    const maintenance=instrument.session==='globex'&&p.minute>=17*60&&p.minute<18*60;
    // Do not guess contract-specific shortened holiday sessions.
    const holidayPause=instrument.session==='globex'&&(isHoliday(p)||Boolean(EARLY[p.date])||FUTURES_REVIEW_DAYS[p.year]?.includes(p.date.slice(5)));
    return {open:!weeklyClosed&&!maintenance&&!holidayPause,label:holidayPause?'Holiday schedule · execution paused':weeklyClosed?'Weekend session closed':maintenance?'Daily maintenance break':'Session open',close:localTime(p.date,17*60)};
  }
  return {open:false,label:'Session calendar unverified · quotes only',close:null};
}

export function marketSession(instrument, now = new Date()) {
  if (!instrument) return {open:false,label:'Unknown instrument',timezone:NY,next_transition_at:null};
  const key=`${instrument.session}:${Math.floor(now.getTime()/60000)}`;
  if (sessionCache.has(key)) return {...sessionCache.get(key),timezone:instrument.session==='crypto'?'UTC':instrument.exchange_timezone||NY,server_time:now.toISOString()};
  const current=phase(instrument,now);
  let transition=null;
  if (instrument.session!=='crypto'&&instrument.session!=='unverified') {
    // Search wall-clock instants, so DST changes are handled by Intl, not fixed UTC offsets.
    const start=Math.floor(now.getTime()/60000)*60000;
    for(let minute=15;minute<=8*24*60;minute+=15) {
      const time=start+minute*60000;
      if (phase(instrument,new Date(time)).open!==current.open) {
        for(let delta=minute-14;delta<=minute;delta++) if(phase(instrument,new Date(start+delta*60000)).open!==current.open){transition=new Date(start+delta*60000).toISOString();break;}
        break;
      }
    }
  }
  const result={ ...current,timezone:instrument.session==='crypto'?'UTC':instrument.exchange_timezone||NY,next_transition_at:transition,
    server_time:now.toISOString(), calendar_coverage:instrument.session==='crypto'?'24/7':'2026–2028; contract holidays paused when exact shortened hours are unverified' };
  if(sessionCache.size>100)sessionCache.clear();sessionCache.set(key,result);return result;
}

export function dayExpiry(instrument, now = new Date()) {
  if (instrument.session==='crypto') return new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()+1)).toISOString();
  let cursor=now;
  for(let i=0;i<3;i++) {
    const session=marketSession(instrument,cursor);
    if (session.open) return session.next_transition_at;
    if (!session.next_transition_at) break;
    cursor=new Date(Date.parse(session.next_transition_at)+1000);
  }
  throw new Error('A verified DAY expiry is unavailable for this instrument.');
}
