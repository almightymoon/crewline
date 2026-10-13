const {JSDOM,VirtualConsole}=require('jsdom');
const errors=[];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function open(label){
 const vc=new VirtualConsole();
 vc.on('jsdomError',e=>{if(!/fonts.googleapis/.test(e.message))errors.push(label+' jsdomError: '+(e.detail&&e.detail.stack||e.message).split('\n').slice(0,3).join(' | '))});
 vc.on('error',(...a)=>errors.push(label+' console.error: '+a.join(' ').slice(0,200)));
 const dom=await JSDOM.fromURL('http://localhost:8000/',{runScripts:'dangerously',resources:'usable',pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){
  w.fetch=(u,o)=>fetch(new URL(u,'http://localhost:8000').href,o);w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});w.scrollTo=()=>{};
  w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','')};w.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open')};w.innerWidth=1200}});
 const w=dom.window,d=w.document;
 const H={w,d,label};
 H.until=async(fn,l,t=6000)=>{const s=Date.now();while(Date.now()-s<t){try{if(fn())return true}catch(e){}await sleep(50)}errors.push(`${label} TIMEOUT ${l} | ${d.querySelector('#app').textContent.slice(0,120)}`);return false};
 H.nav=async(h,l,c)=>{w.location.hash=h;await sleep(100);return H.until(()=>!d.querySelector('.skel')&&(!c||c()),l)};
 H.txt=()=>d.querySelector('#app').textContent;
 H.click=s=>{const e=typeof s==='string'?d.querySelector(s):s;if(!e){errors.push(label+' NO '+s);return}e.click()};
 H.submit=f=>f.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
 H.login=async(portal,email,pw='password123')=>{await H.nav(portal==='admin'?'#/admin/login':'#/login/'+portal,'login page '+portal,()=>d.querySelector('[data-form=login]'));const f=d.querySelector('[data-form=login]');f.elements.email.value=email;f.elements.password.value=pw;H.submit(f)};
 await H.until(()=>d.querySelector('.hero'),'boot');
 return H;
}
const log=m=>console.log('✓',m);
(async()=>{
 const A=await open('client'),B=await open('freelancer');
 // chooser + portal separation
 await A.nav('#/login','chooser',()=>A.d.querySelector('.portals'));log('login chooser shows '+A.d.querySelectorAll('.portal').length+' portals');
 await A.login('freelancer','helen@crewline.dev');await A.until(()=>A.d.querySelector('.err')&&A.d.querySelector('.err').textContent,'portal error');log('client on freelancer portal -> "'+A.d.querySelector('.err').textContent+'"');
 await A.login('client','helen@crewline.dev');await A.until(()=>A.d.querySelector('.dash'),'client dash');log('client portal login -> dashboard: '+A.d.querySelector('.dash h1').textContent);
 await B.login('freelancer','tomas@crewline.dev');await B.until(()=>B.d.querySelector('.dash'),'freelancer dash');log('freelancer portal login -> dashboard: '+B.d.querySelector('.dash h1').textContent);
 await A.nav('#/admin','admin guard',()=>A.txt().includes('admin accounts'));log('client cannot open admin console');
 await sleep(500);log('realtime sockets: client='+A.w.document.title+' / header bell present='+!!A.d.querySelector('#bell')+' / freelancer bell present='+!!B.d.querySelector('#bell'));

 // live messaging between two windows
 await A.nav('#/messages/1','A messages',()=>A.d.querySelector('.thread-b .bub'));await B.nav('#/messages/1','B messages',()=>B.d.querySelector('.thread-b .bub'));
 await A.until(()=>A.d.querySelector('#conn')&&A.d.querySelector('#conn').textContent==='Live','A live');log('connection badge: '+A.d.querySelector('#conn').textContent);
 await A.until(()=>A.d.querySelector('.thread .pdot.on'),'presence dot',4000);log('client sees freelancer online dot: '+!!A.d.querySelector('.thread-h .pdot.on'));
 const before=B.d.querySelectorAll('.thread-b .bub').length;
 const ta=A.d.querySelector('.composer textarea');ta.value='Live message from the client window';ta.dispatchEvent(new A.w.Event('input',{bubbles:true}));
 await B.until(()=>B.d.querySelector('.typing')&&!B.d.querySelector('.typing').hidden,'typing indicator');log('freelancer sees typing indicator while client types');
 A.submit(A.d.querySelector('[data-form=msg]'));
 await B.until(()=>B.d.querySelectorAll('.thread-b .bub').length===before+1&&[...B.d.querySelectorAll('.bub')].some(b=>b.textContent.includes('Live message from the client')),'B receives');log('freelancer received the message instantly (no refresh)');
 await A.until(()=>[...A.d.querySelectorAll('.rcpt')].some(r=>r.textContent==='Seen'),'seen receipt');log('client sees read receipt: "'+[...A.d.querySelectorAll('.rcpt')].pop().textContent+'"');
 const tb=B.d.querySelector('.composer textarea');tb.value='Got it, replying live';B.submit(B.d.querySelector('[data-form=msg]'));
 await A.until(()=>[...A.d.querySelectorAll('.bub')].some(b=>b.textContent.includes('Got it, replying live')),'A receives reply');log('client received the reply instantly');
 // Enter key sends
 const ta2=A.d.querySelector('.composer textarea');ta2.value='Sent with Enter';ta2.dispatchEvent(new A.w.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
 await B.until(()=>[...B.d.querySelectorAll('.bub')].some(b=>b.textContent.includes('Sent with Enter')),'enter send');log('Enter key sends the message');

 // live notification to the freelancer when a client orders
 await A.nav('#/gig/11','gig 11',()=>A.d.querySelector('[data-a=checkout]'));
 const unreadBefore=+(B.d.querySelector('#bellc').textContent||0);
 A.click('[data-a=checkout]');await A.until(()=>A.d.querySelector('#dlg[open] [data-a=pay]'),'checkout');A.click('[data-a=pay]');await A.until(()=>/#\/order\//.test(A.w.location.hash)&&A.d.querySelector('.ord-grid'),'order page');
 await B.until(()=>+(B.d.querySelector('#bellc').textContent||0)>unreadBefore,'bell increments');log('freelancer bell went '+unreadBefore+' -> '+B.d.querySelector('#bellc').textContent+' with no reload; toast: "'+B.d.querySelector('#toast').textContent+'"');
 B.d.querySelector('#bell summary').click();B.d.querySelector('#bell').setAttribute('open','');await B.until(()=>B.d.querySelector('#bellbox .note.unread'),'bell list');log('bell dropdown: '+B.d.querySelectorAll('#bellbox .note').length+' items, first = "'+B.d.querySelector('#bellbox .note b').textContent+'"');
 B.click('#bellbox .note');await B.until(()=>/#\/order\//.test(B.w.location.hash)&&B.d.querySelector('.ord-grid'),'note navigates');log('clicking a notification opens the order');
 await B.until(()=>+(B.d.querySelector('#bellc').textContent||0)===unreadBefore,'badge decrements');log('badge decremented after reading: '+(B.d.querySelector('#bellc').hidden?'hidden':B.d.querySelector('#bellc').textContent));
 // dispute from the client side
 A.click('[data-a=disputedlg]');await A.until(()=>A.d.querySelector('[data-form=dispute]'),'dispute dlg');const df=A.d.querySelector('[data-form=dispute]');df.elements.reason.value='The freelancer has not started and is not replying.';A.submit(df);
 await A.until(()=>A.d.querySelector('.banner.warn'),'dispute banner');log('client opened dispute -> banner "'+A.d.querySelector('.banner b').textContent+'"');
 await B.until(()=>B.d.querySelector('.banner.warn'),'B live banner');log('freelancer sees the order under review; action buttons hidden: '+!B.d.querySelector('[data-a=start]'));

 // admin console
 const C=await open('admin');
 await C.login('admin','admin@crewline.dev','admin12345');await C.until(()=>C.d.querySelector('.dash'),'admin dash');log('admin login -> '+C.d.querySelector('.dash h1').textContent+' | KPIs: '+[...C.d.querySelectorAll('.kpi')].slice(0,4).map(k=>k.textContent.replace(/\s+/g,' ')).join(' | '));
 log('admin chart rendered: '+C.d.querySelectorAll('.chart rect').length+' bars, header badge "'+C.d.querySelector('.pill.adm').textContent+'"');
 await C.until(()=>+(C.d.querySelector('#bellc').textContent||0)>=1,'admin bell');log('admin bell shows dispute notifications: '+C.d.querySelector('#bellc').textContent);
 await C.nav('#/admin/disputes','disputes',()=>C.d.querySelector('.list'));log('disputes queue: '+C.d.querySelectorAll('.list .order').length+' open');
 C.click('[data-a=adm-resolve]');await C.until(()=>C.d.querySelector('[data-form=resolve]'),'resolve dlg');const rf=C.d.querySelector('[data-form=resolve]');rf.elements.note.value='Reviewed the thread, refunding.';C.submit(rf);
 await C.until(()=>C.d.querySelector('#toast').textContent.includes('resolved'),'resolved');log('admin resolved a dispute: "'+C.d.querySelector('#toast').textContent+'"');
 await C.nav('#/admin/users','users',()=>C.d.querySelector('#ures .table'));log('users table: '+C.d.querySelector('#ucount').textContent);
 const q=C.d.querySelector('[data-f=q]');q.value='sofia';q.dispatchEvent(new C.w.Event('input',{bubbles:true}));await C.until(()=>C.d.querySelector('#ucount').textContent==='1 user','search');log('user search "sofia" -> '+C.d.querySelector('#ucount').textContent);
 C.click('#ures tr[data-a=adm-user]');await C.until(()=>C.d.querySelector('#dlg[open] [data-form=suspend]'),'user dlg');const sf=C.d.querySelector('[data-form=suspend]');sf.elements.reason.value='Test suspension';C.submit(sf);
 await C.until(()=>C.d.querySelector('#toast').textContent.includes('suspended'),'suspended');log('admin suspended a user');
 for(const t of ['orders','gigs','jobs','money','announce','platform','logs']){await C.nav('#/admin/'+t,'admin '+t,()=>C.d.querySelector('.dash h1'));log('admin / '+t+': '+C.d.querySelector('.dash h1').textContent)}
 await C.nav('#/admin/announce','announce',()=>C.d.querySelector('[data-form=announce]'));const af=C.d.querySelector('[data-form=announce]');af.elements.title.value='Welcome update';af.elements.audience.value='client';C.submit(af);
 await C.until(()=>C.d.querySelector('#toast').textContent.startsWith('Sent to'),'announce sent');log('announcement: "'+C.d.querySelector('#toast').textContent+'"');
 await A.until(()=>A.d.querySelector('#toast').textContent.includes('Welcome update')||[...A.d.querySelectorAll('#bellbox .note b')].some(b=>b.textContent==='Welcome update'),'client gets announcement live');log('client received the announcement live in the bell');
 await C.nav('#/settings/security','admin security',()=>C.d.querySelector('[data-form=password]'));log('admin settings tabs: '+[...C.d.querySelectorAll('.snav-i')].map(a=>a.textContent).join(', '));

 // settings + profile for members
 await B.nav('#/settings/notifications','prefs',()=>B.d.querySelector('[data-form=prefs]'));const pf=B.d.querySelector('[data-form=prefs]');pf.elements.orders.checked=false;B.submit(pf);await B.until(()=>B.d.querySelector('#toast').textContent.includes('Preferences'),'prefs saved');log('notification preferences saved');
 await B.nav('#/settings/privacy','privacy',()=>B.d.querySelector('[data-form=privacy]'));log('freelancer-only privacy tab present');
 await A.nav('#/settings/account','A account',()=>A.d.querySelector('[data-form=account]'));const af2=A.d.querySelector('[data-form=account]');af2.elements.name.value='Helen Park-Lee';A.d.querySelector('input[name=color][value="#ff375f"]').checked=true;A.submit(af2);await A.until(()=>A.d.querySelector('#toast').textContent.includes('Account updated'),'acct');log('account saved; avatar colour applied: '+A.d.querySelector('.menu summary .av').style.background);
 await A.nav('#/settings/privacy','client no privacy',()=>A.d.querySelector('.dash'));log('client has no Privacy tab: '+(![...A.d.querySelectorAll('.snav-i')].some(a=>a.textContent==='Privacy')));
 await B.nav('#/profile','profile',()=>B.d.querySelector('[data-form=profile]'));log('profile editor: '+B.d.querySelectorAll('.exp-row').length+' experience rows, '+B.d.querySelectorAll('.port-row').length+' portfolio rows, meter '+B.d.querySelector('.meter').getAttribute('aria-valuenow')+'%');
 B.click('[data-a=addrow][data-v=exp]');const rows=B.d.querySelectorAll('.exp-row');const last=rows[rows.length-1];last.querySelector('.x-role').value='QA lead';last.querySelector('.x-company').value='TestCo';B.submit(B.d.querySelector('[data-form=profile]'));
 await B.until(()=>B.d.querySelector('#toast').textContent.includes('Profile saved'),'profile saved');await B.until(()=>!B.d.querySelector('.skel'),'reload');log('profile saved with new experience; now '+B.d.querySelectorAll('.exp-row').length+' rows');
 await B.nav('#/notifications','notifications page',()=>B.d.querySelector('#nlist'));log('notifications page: '+B.d.querySelectorAll('#nlist .note').length+' items');
 await B.nav('#/signup','signup chooser',()=>B.d.querySelector('.portals')||B.d.querySelector('.dash'));
 console.log('\nERRORS:',errors.length?'\n'+errors.join('\n'):'none');
 for(const x of [A,B,C])x.w.close();process.exit(0);
})().catch(e=>{console.log('FATAL',e.message,'\nERRORS so far:',errors);process.exit(1)});
