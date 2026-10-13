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
 H.nav=async(h,l,c)=>{w.location.hash=h;await sleep(100);return H.until(()=>!d.querySelector('.skel')&&(!c||c()),l)};
 H.txt=()=>d.querySelector('#app').textContent;H.click=s=>{const e=typeof s==='string'?d.querySelector(s):s;if(!e){errors.push(label+' NO '+s);return}e.click()};
 H.submit=f=>f.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
 H.login=async(p,e,pw='password123')=>{await H.nav('#/login/'+p,'login '+p,()=>d.querySelector('[data-form=login]'));const f=d.querySelector('[data-form=login]');f.elements.email.value=e;f.elements.password.value=pw;H.submit(f)};
 H.type=(sel,v)=>{const e=d.querySelector(sel);e.value=v;e.dispatchEvent(new w.Event('input',{bubbles:true}))};
 H.check=(sel,on=true)=>{const e=d.querySelector(sel);if(!e){errors.push(label+' NO '+sel);return}e.checked=on;e.dispatchEvent(new w.Event('change',{bubbles:true}))};
 H.count=()=>+(d.querySelector('#count').textContent.match(/\d+/)||[0])[0];
 await H.until(()=>d.querySelector('.hero'),'boot');return H;
}
const log=m=>console.log('✓',m);
(async()=>{
 const F=await open('freelancer'),G=await open('guest'),C=await open('client');
 // logged out: filters work, no applied panel / best match
 await G.nav('#/jobs','jobs guest',()=>G.d.querySelector('#results .job2'));log('guest Find Jobs: '+G.count()+' jobs, '+G.d.querySelectorAll('.fg').length+' filter groups, sign-in tip: '+G.d.querySelector('.fbox').textContent.includes('Looking for work'));
 log('best match hidden for guests: '+![...G.d.querySelectorAll('select[data-f=sort] option')].some(o=>o.value==='best_match'));
 // freelancer
 await F.login('freelancer','tomas@crewline.dev');await F.until(()=>F.d.querySelector('.dash'),'dash');
 await F.nav('#/jobs','jobs',()=>F.d.querySelector('#results .job2'));
 const total=F.count();log('freelancer Find Jobs: '+total+' open jobs; My proposals panel: '+F.d.querySelector('.fbox b').textContent+' ('+F.d.querySelectorAll('.mprop').length+' listed, first "'+(F.d.querySelector('.mprop span')||{}).textContent+'")');
 log('applied badge shown on applied job: '+[...F.d.querySelectorAll('.job2')].some(a=>a.textContent.includes('Applied')));
 log('facet counts filled: '+[...F.d.querySelectorAll('[data-count^="category:"]')].map(e=>e.textContent).join(','));
 // category filter
 F.check('[data-fk=category][data-fv=dev]');await F.until(()=>F.count()<total,'cat filter');log('category=Development -> '+F.count()+' jobs, chip: "'+F.d.querySelector('.achips .chip').textContent.trim()+'", URL '+F.w.location.hash);
 F.check('[data-fk=category][data-fv=design]');await F.until(()=>F.count()>2,'two cats');log('+Design -> '+F.count()+' jobs');
 F.check('[data-fk=experience][data-fv=expert]');await F.until(()=>F.d.querySelectorAll('.achips .chip').length===3,'exp chip');await sleep(200);log('+Expert level -> '+F.count()+' jobs, chips: '+[...F.d.querySelectorAll('.achips .chip')].map(c=>c.textContent.trim()).join(' | '));
 // remove a chip
 F.click('.achips .chip[data-k=category][data-v=design]');await sleep(300);log('removed Design chip -> '+F.count()+' jobs, design checkbox unchecked: '+!F.d.querySelector('[data-fk=category][data-fv=design]').checked);
 F.click('[data-a=jf-clear]');await F.until(()=>F.count()===total,'cleared');log('Clear all -> back to '+F.count()+' jobs');
 // budget presets + inputs
 F.click('[data-a=jf-budget][data-min="500"]');await F.until(()=>F.count()<total,'budget preset');log('budget $500 to $1K -> '+F.count()+' jobs; inputs '+F.d.querySelector('[data-f=min_budget]').value+'-'+F.d.querySelector('[data-f=max_budget]').value);
 F.click('[data-a=jf-clear]');await F.until(()=>F.count()===total,'cleared2');
 F.type('[data-f=min_budget]','3000');await F.until(()=>F.count()<4,'min budget input');log('min budget 3000 -> '+F.count()+' jobs: '+[...F.d.querySelectorAll('.job2 .price')].map(p=>p.textContent).join(', '));
 F.click('[data-a=jf-clear]');await F.until(()=>F.count()===total,'cleared3');
 // client info + proposals + posted + skills
 F.check('[data-fk=verified]');await F.until(()=>F.count()<total,'verified');log('payment verified only -> '+F.count());F.click('[data-a=jf-clear]');await F.until(()=>F.count()===total,'c4');
 F.check('[data-fk=proposals][data-fv=lt5]');await F.until(()=>F.count()<=total,'proposals');await sleep(200);log('proposals < 5 -> '+F.count());F.click('[data-a=jf-clear]');await F.until(()=>F.count()===total,'c5');
 F.check('[data-fk=posted_within][data-fv="24"]');await F.until(()=>F.count()<total,'posted');log('posted last 24h -> '+F.count());F.click('[data-a=jf-clear]');await F.until(()=>F.count()===total,'c6');
 F.d.querySelector('details.fg:nth-of-type(8)');F.type('[data-f=skills]','fastapi');await F.until(()=>F.count()<total&&F.count()>=1,'skills');log('skills "fastapi" -> '+F.count()+' jobs; chip: '+[...F.d.querySelectorAll('.achips .chip')].map(c=>c.textContent.trim()).join(' | ')+'; matching skill highlighted: '+F.d.querySelectorAll('.tag.hit').length);F.click('[data-a=jf-clear]');await F.until(()=>F.count()===total,'c7');
 // applied filters
 F.check('[data-fk=applied][data-fv=hide]');await F.until(()=>F.count()===total-1,'hide applied');log('hide applied -> '+F.count()+' (applied job gone: '+![...F.d.querySelectorAll('.job2')].some(a=>a.textContent.includes('REST API'))+')');
 F.check('[data-fk=applied][data-fv=only]');await F.until(()=>F.count()===1,'only applied');log('only applied -> '+F.count()+': '+F.d.querySelector('.job2 h3').textContent);F.click('[data-a=jf-clear]');await F.until(()=>F.count()===total,'c8');
 // sort
 const sortBy=async v=>{F.type('[data-f=sort]',v);await sleep(500)};
 await sortBy('budget_high');const hi=[...F.d.querySelectorAll('.job2 .price')].map(p=>+p.textContent.replace(/[$,]/g,''));log('sort budget high->low: '+hi.slice(0,4).join(', ')+' sorted='+hi.every((v,i)=>!i||hi[i-1]>=v));
 await sortBy('budget_low');const lo=[...F.d.querySelectorAll('.job2 .price')].map(p=>+p.textContent.replace(/[$,]/g,''));log('sort budget low->high: '+lo.slice(0,4).join(', ')+' sorted='+lo.every((v,i)=>!i||lo[i-1]<=v));
 await sortBy('best_match');log('best match first job: "'+F.d.querySelector('.job2 h3').textContent+'" with highlighted skills '+F.d.querySelectorAll('.job2:first-child .tag.hit').length);
 await sortBy('client_spent');log('sort by client spend: ok, first = '+F.d.querySelector('.job2 .j2-client').textContent.replace(/\s+/g,' ').slice(0,70));
 // search + load more (limit 20 > 12 so none) + URL restore
 F.type('[data-f=q]','podcast');await F.until(()=>F.count()===1,'search');log('search "podcast" -> '+F.count()+': '+F.d.querySelector('.job2 h3').textContent);
 F.type('[data-f=q]','zzzzzz');await F.until(()=>F.d.querySelector('#results .empty'),'empty');log('no match -> empty state: "'+F.d.querySelector('#results .empty h3').textContent+'"');
 await F.nav('#/jobs?category=dev&experience=expert&sort=budget_high&verified=1','deep link',()=>F.d.querySelector('#results .job2')||F.d.querySelector('#results .empty'));await sleep(300);log('deep link restores filters: chips='+[...F.d.querySelectorAll('.achips .chip')].map(c=>c.textContent.trim()).join(' | ')+' sort='+F.d.querySelector('[data-f=sort]').value+' checked='+F.d.querySelector('[data-fk=category][data-fv=dev]').checked);

 // job detail
 await F.nav('#/job/2','job detail',()=>F.d.querySelector('.clientbox'));
 const T=F.txt();log('job detail: title="'+F.d.querySelector('h1').textContent+'" | info boxes: '+[...F.d.querySelectorAll('.jinfo div')].map(x=>x.textContent.replace(/\s+/g,' ')).join(' | '));
 log('client box: '+F.d.querySelector('.clientbox').textContent.replace(/\s+/g,' ').slice(0,200));
 log('sections: '+['Description','Skills and expertise','Activity on this job','Client\'s recent history','Reviews from freelancers','Similar jobs'].map(s=>s+'='+T.includes(s)).join(', '));
 log('past jobs listed: '+F.d.querySelectorAll('.prow').length+' | client reviews listed: '+[...F.d.querySelectorAll('h3.sec')].find(h=>h.textContent.startsWith('Reviews')).nextElementSibling.nextElementSibling.children.length+' | bids: '+T.includes('Average bid')+' | your proposal panel: '+T.includes('Your proposal'));
 log('matching skills highlighted on detail: '+F.d.querySelectorAll('.tag.hit').length+' | message: '+(T.match(/\d+ of your skills match[^.]*/)||['none'])[0]);
 await F.nav('#/job/1','job 1',()=>F.d.querySelector('[data-form=proposal]'));log('unapplied job shows proposal form + Apply now button: '+!!F.d.querySelector('a[data-a=jump]'));
 F.click('[data-a=jump]');
 const pf=F.d.querySelector('[data-form=proposal]');pf.elements.bid.value='1700';pf.elements.days.value='10';pf.elements.text.value='I have designed several booking flows and can start this week with a short call.';F.submit(pf);
 await F.until(()=>F.txt().includes('Your proposal'),'applied');log('applied from the job page; panel shows status "'+F.d.querySelector('#propose .pill').textContent+'" and a Withdraw button: '+!!F.d.querySelector('[data-a=withdraw]'));
 await F.nav('#/jobs','jobs again',()=>F.d.querySelector('#results .job2'));log('My proposals panel now lists '+F.d.querySelectorAll('.mprop').length+' proposals; Applied badges: '+[...F.d.querySelectorAll('.job2')].filter(a=>a.textContent.includes('Applied')).length);
 await F.nav('#/client/13','client profile',()=>F.d.querySelector('.kpis'));log('client profile: '+F.d.querySelector('h1').textContent+' | '+[...F.d.querySelectorAll('.kpi')].map(k=>k.textContent.replace(/\s+/g,' ')).join(' | ')+' | reviews '+(F.d.querySelectorAll('.order .stars').length)+' | past jobs '+F.d.querySelectorAll('.prow').length);
 // client views own job + posts one with new fields
 await C.login('client','helen@crewline.dev');await C.until(()=>C.d.querySelector('.dash'),'client dash');
 await C.nav('#/post-job','post',()=>C.d.querySelector('[data-form=job]'));const jf=C.d.querySelector('[data-form=job]');log('post-job form has level + length selects: '+!!jf.elements.experience_level+' '+!!jf.elements.duration);
 jf.elements.title.value='Design a pitch deck for investors';jf.elements.category.value='design';jf.elements.budget.value='750';jf.elements.experience_level.value='expert';jf.elements.duration.value='week';jf.elements.description.value='We need a clean 12 slide pitch deck for our seed round, with charts and a consistent system.';jf.elements.skills.value='Figma, Slides';C.submit(jf);
 await C.until(()=>/#\/job\/\d+/.test(C.w.location.hash)&&C.txt().includes('Proposals (0)'),'posted');log('client posted job; detail shows: '+[...C.d.querySelectorAll('.jinfo div')].slice(1,3).map(x=>x.textContent.replace(/\s+/g,' ')).join(' | '));
 await C.nav('#/job/1','own job',()=>C.txt().includes('Proposals ('));log('owner sees proposals on own job: '+C.d.querySelectorAll('[data-a=hire]').length+' with Hire buttons, and the same client box');
 // client reviews flow: freelancer reviews client after release
 await C.nav('#/dashboard/orders?f=released','released',()=>C.d.querySelector('table.dt,.es'));
 console.log('\nERRORS:',errors.length?'\n'+errors.join('\n'):'none');
 for(const x of [F,G,C])x.w.close();process.exit(0);
})().catch(e=>{console.log('FATAL',e.message,'\nERRORS so far:',errors);process.exit(1)});
