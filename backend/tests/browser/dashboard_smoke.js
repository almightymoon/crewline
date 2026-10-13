const {JSDOM,VirtualConsole}=require('jsdom');
const errors=[];const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function open(label){
 const vc=new VirtualConsole();
 vc.on('jsdomError',e=>{if(!/fonts.googleapis/.test(e.message))errors.push(label+' jsdomError: '+(e.detail&&e.detail.stack||e.message).split('\n').slice(0,3).join(' | '))});
 const dom=await JSDOM.fromURL('http://localhost:8000/',{runScripts:'dangerously',resources:'usable',pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){
  w.fetch=(u,o)=>fetch(new URL(u,'http://localhost:8000').href,o);w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});w.scrollTo=()=>{};w.Element.prototype.scrollIntoView=function(){};
  w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','')};w.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open')};w.innerWidth=1200}});
 const w=dom.window,d=w.document,H={w,d};
 H.until=async(fn,l,t=6000)=>{const s=Date.now();while(Date.now()-s<t){try{if(fn())return true}catch(e){}await sleep(50)}errors.push(`${label} TIMEOUT ${l} | ${d.querySelector('#app').textContent.slice(0,140)}`);return false};
 H.nav=async(h,l,c)=>{w.location.hash=h;await sleep(120);return H.until(()=>!d.querySelector('.skel')&&(!c||c()),l)};
 H.click=s=>{const e=typeof s==='string'?d.querySelector(s):s;if(!e){errors.push(label+' NO '+s);return}e.click()};
 H.submit=f=>f.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
 H.login=async(p,e,pw='password123')=>{await H.nav(p==='admin'?'#/admin/login':'#/login/'+p,'login '+p,()=>d.querySelector('[data-form=login]'));const f=d.querySelector('[data-form=login]');f.elements.email.value=e;f.elements.password.value=pw;H.submit(f)};
 H.txt=s=>(d.querySelector(s||'#app')||{textContent:''}).textContent.replace(/\s+/g,' ').trim();
 await H.until(()=>d.querySelector('.hero'),'boot');return H;
}
const log=m=>console.log('✓',m);
const summary=H=>`h1="${H.txt('.dash h1')}" stats=${H.d.querySelectorAll('.stat2').length} cards=${H.d.querySelectorAll('.card2').length} tables=${H.d.querySelectorAll('table.dt').length}`;
(async()=>{
 const N=await open('new'),F=await open('tomas'),C=await open('helen'),A=await open('admin');
 // brand-new freelancer: empty states + onboarding checklist
 await N.nav('#/signup/freelancer','signup',()=>N.d.querySelector('[data-form=signup]'));const sf=N.d.querySelector('[data-form=signup]');
 sf.elements.name.value='Arthur Jones';sf.elements.email.value='arthur'+Date.now()+'@test.com';sf.elements.password.value='password123';sf.elements.extra.value='Devops';N.submit(sf);
 await N.until(()=>N.d.querySelector('.dash')&&N.d.querySelector('.stat2'),'new dashboard');
 log('data-area switches to app shell: body[data-area]='+N.d.body.dataset.area);
 log('new freelancer overview: '+summary(N));
 log('stats: '+[...N.d.querySelectorAll('.stat2')].map(x=>x.textContent.replace(/\s+/g,' ').trim().slice(0,36)).join(' | '));
 log('sidebar groups: '+[...N.d.querySelectorAll('.snav-t')].map(x=>x.textContent).join(', ')+' | items: '+[...N.d.querySelectorAll('.snav-i')].map(x=>x.textContent.trim()).join(', '));
 log('active nav item: '+N.txt('.snav-i[aria-current=page]'));
 log('checklist: '+N.txt('.meter')+' / '+N.d.querySelectorAll('.ck a').length+' todo, '+N.d.querySelectorAll('.ck .done').length+' done | progress '+N.d.querySelector('.meter').getAttribute('aria-valuenow')+'%');
 log('empty states: '+[...N.d.querySelectorAll('.es p')].map(p=>p.textContent.slice(0,50)).join(' | '));
 log('bars chart rendered: '+N.d.querySelectorAll('.bar-c').length+' months, all zero='+(N.d.querySelectorAll('.bar-c.zero').length===6));
 log('profile shows greeting: '+N.txt('.ph .sub'));
 for(const t of ['orders','proposals','gigs','wallet']){await N.nav('#/dashboard/'+t,'new '+t,()=>N.d.querySelector('.dash .ph'));log('new freelancer / '+t+': '+summary(N)+' | empty="'+N.txt('.es p').slice(0,48)+'"')}
 // freelancer with data
 await F.login('freelancer','tomas@crewline.dev');await F.until(()=>F.d.querySelector('.stat2'),'tomas dash');
 log('tomas overview: '+summary(F)+' | bars with data: '+(F.d.querySelectorAll('.bar-c:not(.zero)').length));
 log('active work rows: '+F.d.querySelectorAll('table.dt tr.lnk').length+' | badges: '+[...F.d.querySelectorAll('table.dt .bd')].slice(0,4).map(b=>b.textContent).join(', ')+' | progress segs: '+F.d.querySelectorAll('.seg4').length+' | jobs matched: '+F.d.querySelectorAll('.jr').length);
 const row=F.d.querySelector('table.dt tr.lnk');const href=row.dataset.href;row.querySelector('td:last-child').click();
 await F.until(()=>F.w.location.hash===href&&F.d.querySelector('.ord-grid'),'row click');log('clicking a table row opens '+href);
 for(const t of ['orders?f=all','proposals','gigs','wallet']){await F.nav('#/dashboard/'+t,'tomas '+t,()=>F.d.querySelector('.dash .ph'));log('tomas / '+t.split('?')[0]+': '+summary(F)+' rows='+F.d.querySelectorAll('table.dt tbody tr').length)}
 log('wallet: '+F.txt('.stats-grid')+' | withdraw form: '+!!F.d.querySelector('[data-form=withdraw]'));
 // client
 await C.login('client','helen@crewline.dev');await C.until(()=>C.d.querySelector('.stat2'),'helen dash');
 log('helen overview: '+summary(C)+' | stats: '+[...C.d.querySelectorAll('.stat2')].map(x=>x.querySelector('b').textContent).join(', '));
 log('open jobs table rows: '+C.d.querySelectorAll('.two .card2:first-child tr.lnk').length+' | top freelancers: '+C.d.querySelectorAll('.who-row').length);
 for(const t of ['orders','jobs','wallet']){await C.nav('#/dashboard/'+t,'helen '+t,()=>C.d.querySelector('.dash .ph'));log('helen / '+t+': '+summary(C)+' rows='+C.d.querySelectorAll('table.dt tbody tr').length)}
 C.click('[data-a=topup]');await C.until(()=>C.d.querySelector('#toast').textContent.includes('Added'),'topup');log('wallet top-up works: '+C.txt('#toast'));
 // settings + admin in the new shell
 await C.nav('#/settings/notifications','settings',()=>C.d.querySelector('[data-form=prefs]'));log('settings shell: items='+[...C.d.querySelectorAll('.snav-i')].map(x=>x.textContent.trim()).join(', ')+' | switches='+C.d.querySelectorAll('.switch').length);
 await A.login('admin','admin@crewline.dev','admin12345');await A.until(()=>A.d.querySelector('.stat2'),'admin dash');log('admin overview: '+summary(A)+' | nav: '+[...A.d.querySelectorAll('.snav-t')].map(x=>x.textContent).join(', '));
 for(const t of ['users','disputes','orders','gigs','jobs','money','announce','platform','logs']){await A.nav('#/admin/'+t,'admin '+t,()=>A.d.querySelector('.dash h1'));log('admin / '+t+': h1="'+A.txt('.dash h1')+'" active="'+A.txt('.snav-i[aria-current=page]')+'"')}
 await A.nav('#/admin/login','admin login area',()=>A.d.querySelector('.adminbox')||A.d.querySelector('.dash'));
 await A.nav('#/','site area',()=>A.d.querySelector('.hero'));log('landing is the marketing area: body[data-area]='+A.d.body.dataset.area);
 console.log('\nERRORS:',errors.length?'\n'+errors.join('\n'):'none');
 for(const x of [N,F,C,A])x.w.close();process.exit(0);
})().catch(e=>{console.log('FATAL',e.message,'\nERRORS so far:',errors);process.exit(1)});
