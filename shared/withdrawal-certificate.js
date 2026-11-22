const escape = value => String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
export function certificateDate(value) {
  if (!value) return 'Not recorded';
  const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value) ? value : value.replace(' ','T')+'Z';
  const date = new Date(normalized);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'short',timeZone:'UTC'}).format(date)+' UTC' : 'Not recorded';
}
export function certificateStatus(record) {
  if (record.status === 'approved') return record.kind === 'roi'
    ? {label:'CREDITED TO WALLET',description:'Your withdrawal was approved and the funds were credited to your available USD wallet.'}
    : {label:'PAID',description:'Your withdrawal was approved and the payout was issued to your requested destination.'};
  if (record.status === 'completed' || record.status === 'paid') return record.kind === 'roi'
    ? {label:'CREDITED TO WALLET',description:'Your withdrawal is complete and the funds were credited to your available USD wallet.'}
    : {label:'PAID',description:'Your withdrawal is complete and the payout was issued to your requested destination.'};
  if (record.status === 'rejected') return {label:'REJECTED',description:'This withdrawal request was not approved. No payout was issued.'};
  if (record.status === 'cancelled' || record.status === 'canceled') return {label:'CANCELLED',description:'This withdrawal request was cancelled. No payout was issued.'};
  return {label: record.status==='pending' ? 'PENDING REVIEW' : 'STATUS: '+String(record.status||'UNAVAILABLE').toUpperCase(),description:'This withdrawal is awaiting review. No payout has been issued.'};
}
export function withdrawalCertificateSvg(record, includeName = false) {
  const status = certificateStatus(record);
  const amount = Number(record.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('A recorded positive withdrawal amount is required.');
  const name = includeName && record.account_name ? String(record.account_name).slice(0,70) : 'Private account holder';
  const money = new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:2}).format(amount);
  const text = (x,y,size,value,extra='') => `<text x="${x}" y="${y}" font-size="${size}" ${extra}>${escape(value)}</text>`;
  const label = (x,y,value) => text(x,y,15,value,'fill="#88713e" letter-spacing="3"');
  const reference = String(record.reference).slice(0,100);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1800" height="1240" viewBox="0 0 1800 1240" role="img" aria-label="Withdrawal certificate: ${escape(status.label)}">
  <defs><linearGradient id="gold"><stop stop-color="#846335"/><stop offset=".45" stop-color="#e2cd97"/><stop offset="1" stop-color="#99743b"/></linearGradient><radialGradient id="paper"><stop stop-color="#fffef8"/><stop offset="1" stop-color="#f0ebdf"/></radialGradient><pattern id="grain" width="18" height="18" patternUnits="userSpaceOnUse"><circle cx="2" cy="3" r=".6" fill="#98805a" opacity=".12"/></pattern></defs>
  <rect width="1800" height="1240" fill="#101a21"/><rect x="25" y="25" width="1750" height="1190" fill="none" stroke="url(#gold)"/><rect x="46" y="46" width="1708" height="1148" fill="url(#paper)"/>
  <rect x="46" y="46" width="1708" height="1148" fill="url(#grain)"/>
  <rect x="73" y="73" width="1654" height="1094" fill="none" stroke="#b59960"/><rect x="83" y="83" width="1634" height="1074" fill="none" stroke="#b59960" stroke-opacity=".35"/>
  <path d="M73 155V73h82 M1645 73h82v82 M73 1085v82h82 M1645 1167h82v-82" fill="none" stroke="url(#gold)" stroke-width="4"/>
  <g font-family="Arial, sans-serif" fill="#17232c">
  <rect x="145" y="135" width="61" height="61" rx="2" fill="#17232c"/><path d="M156 177l12-15 12 10 15-22m-12 0h12v12" fill="none" stroke="#d2b574" stroke-width="3"/>
  ${text(229,161,27,'THE PRIME MARKETS','letter-spacing="3"')}${text(230,188,12,'PRIVATE CLIENT RECORD','letter-spacing="4" fill="#88713e"')}
  ${text(1650,156,12,'CERTIFICATE REFERENCE','text-anchor="end" fill="#88713e" letter-spacing="2"')}${text(1650,185,19,record.certificate_number,'text-anchor="end" font-family="monospace"')}
  <line x1="145" y1="232" x2="1655" y2="232" stroke="#b59960" stroke-opacity=".5"/>
  ${label(145,300,'ACCOUNT SERVICES / WITHDRAWALS')}
  ${text(140,398,78,'Withdrawal Certificate','font-family="Georgia, serif"')}
  ${text(146,447,21,'A record of your withdrawal and its processing outcome.','fill="#677077"')}
  ${label(147,523,'RECORDED AMOUNT / USD')}
  ${text(140,628,money.length>19?65:94,money,'font-family="Georgia, serif"')}
  ${label(147,698,'ACCOUNT HOLDER')}${text(145,741,name.length>45?24:33,name,'font-family="Georgia, serif"')}
  <g transform="translate(1435 566)"><circle r="116" fill="none" stroke="url(#gold)" stroke-width="2"/><circle r="105" fill="none" stroke="#b59960" stroke-width=".7"/><circle r="88" fill="none" stroke="#b59960" stroke-width=".7" stroke-dasharray="2 5"/><path d="M-52 0H52M0-52V52" stroke="#b59960" stroke-opacity=".3"/>${text(0,19,54,'PM','font-family="Georgia, serif" text-anchor="middle" fill="#92703b"')}${text(0,67,10,'CLIENT RECORD','text-anchor="middle" letter-spacing="2" fill="#92703b"')}</g>
  <line x1="145" y1="789" x2="1655" y2="789" stroke="#b59960" stroke-opacity=".5"/>
  ${label(147,830,'REQUESTED AT')}${text(146,868,23,certificateDate(record.created_at))}
  ${label(730,830,'LAST REVIEW')}${text(729,868,23,certificateDate(record.reviewed_at))}
  ${label(1310,830,'REQUESTED ASSET')}${text(1309,868,23,String(record.requested_currency||'USD').slice(0,15))}
  ${label(147,918,'TRANSACTION REFERENCE')}${text(146,951,reference.length>65?16:20,reference,'font-family="monospace"')}
  <rect x="145" y="982" width="1510" height="112" rx="2" fill="#17232c"/>
  ${text(172,1021,17,status.label,'fill="#dfc58c" letter-spacing="2"')}
  ${text(172,1058,18,status.description,'fill="#e4e4df"')}
  ${text(145,1130,13,'Generated by The Prime Markets from its account records.','fill="#737873"')}
  ${text(1655,1130,13,'theprimemarkets.com','text-anchor="end" fill="#88713e"')}
  </g></svg>`;
}
