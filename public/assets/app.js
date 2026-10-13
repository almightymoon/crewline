/* Crewline front end. Vanilla JS, hash routing, talks to /api. */
(()=>{
'use strict';
const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>{n=Math.round((+n||0)*100)/100;return '$'+n.toLocaleString('en-US',{minimumFractionDigits:Number.isInteger(n)?0:2,maximumFractionDigits:2})};
const ago=iso=>{if(!iso)return'';const s=(Date.now()-new Date(iso))/1000;if(s<60)return'just now';if(s<3600)return Math.floor(s/60)+'m ago';if(s<86400)return Math.floor(s/3600)+'h ago';if(s<86400*30)return Math.floor(s/86400)+'d ago';return new Date(iso).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})};
const clock=iso=>new Date(iso).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});
const inits=n=>String(n||'?').split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase();
const app=$('#app');

/* ---------- state + api ---------- */
const S={token:null,user:null,unread:0,meta:{categories:[],stats:{}}};
try{S.token=localStorage.getItem('cl_token')}catch(e){}
class ApiError extends Error{constructor(m,status){super(m);this.status=status}}
function signOutLocal(){S.token=null;S.user=null;S.unread=0;S.notes={items:[],unread:0};try{localStorage.removeItem('cl_token')}catch(e){}try{rt.close()}catch(e){}}
let apiEpoch=0; // bumped on every navigation so slow reads from an old page can never overwrite the new one
async function api(path,{method='GET',body,keep}={}){
 const ep=apiEpoch;
 const h={};if(body!==undefined)h['Content-Type']='application/json';if(S.token)h.Authorization='Bearer '+S.token;
 let r;try{r=await fetch('/api'+path,{method,headers:h,body:body!==undefined?JSON.stringify(body):undefined})}
 catch(e){throw new ApiError('Cannot reach the server. Check your connection.',0)}
 let data=null;try{data=await r.json()}catch(e){}
 if(method==='GET'&&!keep&&ep!==apiEpoch)return new Promise(()=>{});
 if(!r.ok){let m=data&&data.detail;
  if(Array.isArray(m))m=m.map(x=>{const f=x.loc&&x.loc[x.loc.length-1];return(f&&f!=='body'?f+': ':'')+x.msg}).join('. ');
  if(r.status===401&&S.token){signOutLocal();header()}
  throw new ApiError(m||'Something went wrong',r.status)}
 return data}
const setSession=r=>{S.token=r.token;S.user=r.user;try{localStorage.setItem('cl_token',r.token)}catch(e){}rt.close();rt.connect();loadNotes();refreshUnread()};

/* ---------- theme ---------- */
const root=document.documentElement;
const curTheme=()=>root.dataset.theme||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');
const ICON={
 sun:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
 moon:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
 chat:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-5.4A8 8 0 1 1 21 12z"/></svg>'};

/* ---------- shared bits ---------- */
const CATC={design:['#F6D365','#FDA085'],dev:['#A8EDEA','#8FB8F7'],writing:['#C7B8F0','#F5C6E7'],video:['#FFB199','#FF6F91'],marketing:['#B6EBA8','#E4F59A'],data:['#7F9CF5','#B8C4FF'],audio:['#F9C5D5','#A6C1EE']};
const catName=id=>(S.meta.categories.find(c=>c.id===id)||{}).name||id;
function rng(s){let h=2166136261;for(const ch of String(s)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)}return()=>{h^=h<<13;h^=h>>>17;h^=h<<5;return((h>>>0)%1000)/1000}}
let tid=0;
function thumb(seed,cat){
 const c=CATC[cat]||CATC.design,r=rng(seed),id='t'+(++tid);
 let s=`<svg viewBox="0 0 320 200" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c[0]}"/><stop offset="1" stop-color="${c[1]}"/></linearGradient></defs><rect width="320" height="200" fill="url(#${id})"/>`;
 for(let i=0;i<3;i++){const x=r()*320,y=r()*200,z=60+r()*90;s+=`<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${z.toFixed(0)}" fill="#fff" opacity="${(.14+r()*.2).toFixed(2)}"/>`}
 return s+'</svg>'}
const SWATCH=['#0071e3','#5e5ce6','#bf5af2','#ff375f','#ff9f0a','#30b0c7','#34c759','#ac8e68'];
const av=(u,lg)=>{const pic=u.avatar&&/^(https?:\/\/|\/)/i.test(u.avatar);
 return `<span class="av${lg?' lg':''}${pic?' pic':''}" style="background:${esc(u.color||'#0071e3')}" aria-hidden="true">${pic?`<img src="${esc(u.avatar)}" alt="">`:esc(inits(u.name))}</span>`};
const rating=(r,n)=>r?`<span class="rt"><span class="stars" aria-hidden="true">★</span> ${(+r).toFixed(1)} (${n})</span>`:`<span class="rt">New</span>`;
const displayName=u=>u.company?`${esc(u.name)} · ${esc(u.company)}`:esc(u.name);
function cover(g){const pic=g.image&&/^(https?:\/\/|\/)/i.test(g.image);
 return pic?`<img src="${esc(g.image)}" alt="">`:thumb('g'+g.id,g.category)}
const gigCard=g=>`<article class="card"><div class="thumb">${cover(g)}</div><div class="in">
 <a class="who" href="#/freelancer/${g.freelancer.id}">${av(g.freelancer)}<b>${esc(g.freelancer.name)}</b></a>
 <h3><a class="stretch" href="#/gig/${g.id}">${esc(g.title)}</a></h3>
 <div class="meta">${rating(g.freelancer.rating,g.freelancer.reviews_count)}<span class="price">From ${fmt(g.from_price)}</span></div></div></article>`;
const freelancerCard=f=>`<article class="fcard"><div class="row">${av(f,true)}<div><h3><a class="stretch" href="#/freelancer/${f.id}">${esc(f.name)}</a></h3><span class="muted">${esc(f.headline)}</span><br>${rating(f.rating,f.reviews_count)}</div></div>
 <div class="tags">${(f.skills||[]).slice(0,4).map(s=>`<span class="tag">${esc(s)}</span>`).join('')}</div>
 <div class="between" style="font-size:14px"><span class="muted">${esc(f.location)}</span><span><b>${fmt(f.hourly_rate)}</b><span class="muted"> / hour</span></span></div></article>`;
const jobCard=j=>`<article class="job"><div><h3><a class="stretch" href="#/job/${j.id}" style="position:static">${esc(j.title)}</a></h3><p>${esc(j.description.length>200?j.description.slice(0,200)+'…':j.description)}</p>
 <div class="tags">${j.skills.map(s=>`<span class="tag">${esc(s)}</span>`).join('')}<span class="tag">${esc(catName(j.category))}</span></div>
 <p style="margin:10px 0 0;font-size:14px">${esc(j.client.company||j.client.name)}${j.client.verified?' · payment verified':''} · ${ago(j.created_at)}</p></div>
 <div class="side"><span class="price">${fmt(j.budget)}</span><span class="muted" style="font-size:14px">${j.proposals_count} proposal${j.proposals_count===1?'':'s'}</span>${j.status!=='open'?`<span class="pill">${j.status==='in_progress'?'In progress':'Closed'}</span>`:''}<a class="btn sm" href="#/job/${j.id}">View job</a></div></article>`;
const STEPS=['Funded','In progress','Delivered','Released'];
const stepIdx={funded:0,in_progress:1,revision:1,delivered:2,released:3,cancelled:-1};
const statusLabel={funded:'Funded, waiting to start',in_progress:'In progress',revision:'Revision requested',delivered:'Delivered, awaiting approval',released:'Complete',cancelled:'Cancelled'};
const stepper=o=>{const i=stepIdx[o.status];return `<div class="steps" aria-label="Progress">${STEPS.map((s,k)=>`<div class="${k<=i?'on':''}">${s}</div>`).join('')}</div>`};
const orderCard=o=>`<article class="order"><div class="top"><div><h3 style="font-size:18px"><a href="#/order/${o.id}" style="color:inherit">${esc(o.title)}</a></h3><span class="muted">${S.user.role==='client'?'Freelancer':'Client'}: ${esc(o.counterpart.name)} · ${fmt(o.amount)} · ${ago(o.created_at)}</span></div><span class="pill ${o.status==='revision'?'warn':o.status==='released'?'ok':''}">${statusLabel[o.status]}</span></div>${o.status==='cancelled'?'':stepper(o)}</article>`;
const empty=(msg,cta)=>esState('inbox',msg,cta||'');
const field=(label,input,hint)=>`<div class="field"><label>${label}</label>${input}${hint?`<small>${hint}</small>`:''}</div>`;
const page=html=>{app.innerHTML=html};
const wrapPage=(inner,cls='page2')=>`<div class="${cls}"><div class="wrap">${inner}</div></div>`;

/* ---------- dialog + toast ---------- */
const dlg=$('#dlg');
function openDlg(html){dlg.innerHTML=`<button class="x" data-a="close" aria-label="Close">×</button><div class="dlg">${html}</div>`;if(!dlg.open)dlg.showModal()}
const closeDlg=()=>{if(dlg.open)dlg.close()};
dlg.addEventListener('click',e=>{if(e.target===dlg)closeDlg()});
let tt;function toast(m){const t=$('#toast');t.textContent=m;t.classList.add('show');clearTimeout(tt);tt=setTimeout(()=>t.classList.remove('show'),3000)}
const errBox=el=>{let e=$('.err',el);if(!e){e=document.createElement('p');e.className='err';e.setAttribute('role','alert');el.appendChild(e)}return e};
async function submitting(form,fn){
 const b=$('button:not([type=button])',form),old=b&&b.textContent;if(b){b.disabled=true}
 const eb=errBox(form);eb.textContent='';
 try{await fn()}catch(e){eb.textContent=e.message}finally{if(b){b.disabled=false}}}

/* ---------- notifications, realtime, header / footer ---------- */
S.notes={items:[],unread:0};S.online={};
ICON.bell='<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>';
const BASE_TITLE=document.title;
const noteHtml=n=>`<a class="note ${n.read?'':'unread'}" href="${n.link?'#'+esc(n.link):'#/notifications'}" data-a="note" data-v="${n.id}"><i class="nk nk-${esc(n.kind)}"></i><span><b>${esc(n.title)}</b>${n.body?`<small>${esc(n.body)}</small>`:''}<small>${ago(n.created_at)}</small></span></a>`;
const bellInner=()=>`<div class="note-h"><b>Notifications</b><button class="link" data-a="notes-read">Mark all read</button></div><div class="note-list">${S.notes.items.length?S.notes.items.slice(0,8).map(noteHtml).join(''):'<p class="muted" style="padding:18px;margin:0">You are all caught up.</p>'}</div><a class="note-f" href="#/notifications">See all notifications</a>`;
function updateBadges(){
 const m=$('#unread');if(m){m.textContent=S.unread;m.hidden=!S.unread}
 const b=$('#bellc');if(b){b.textContent=S.notes.unread;b.hidden=!S.notes.unread}
 const bb=$('#bellbox');if(bb)bb.innerHTML=bellInner();
 const n=S.unread+S.notes.unread;document.title=(n?`(${n}) `:'')+BASE_TITLE}
async function loadNotes(){if(!S.user)return;try{const r=await api('/notifications?limit=30',{keep:true});S.notes={items:r.items,unread:r.unread};updateBadges()}catch(e){}}
async function refreshUnread(){
 if(!S.user||S.user.role==='admin')return;
 try{const r=await api('/messages/unread',{keep:true});S.unread=r.count;updateBadges()}catch(e){}}

/* realtime socket with automatic reconnect; falls back to polling when it is down */
const pageHandlers=[];const onRt=fn=>pageHandlers.push(fn);
const setConn=ok=>{const c=$('#conn');if(c){c.textContent=ok?'Live':'Reconnecting…';c.classList.toggle('ok',ok)}};
const rt={ws:null,ok:false,tries:0,timer:null,
 connect(){
  if(!S.token||this.ws)return;
  const ws=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/ws?token=${encodeURIComponent(S.token)}`);this.ws=ws;
  ws.onopen=()=>{this.ok=true;this.tries=0;setConn(true);refreshUnread();loadNotes()};
  ws.onmessage=e=>{let d;try{d=JSON.parse(e.data)}catch(x){return}onEvent(d)};
  ws.onclose=()=>{this.ok=false;this.ws=null;setConn(false);if(S.token&&S.user){clearTimeout(this.timer);this.timer=setTimeout(()=>this.connect(),Math.min(15000,1000*2**this.tries++))}};
  ws.onerror=()=>{}},
 close(){clearTimeout(this.timer);const w=this.ws;this.ws=null;this.ok=false;if(w){w.onclose=null;try{w.close()}catch(e){}}},
 send(o){if(this.ok&&this.ws&&this.ws.readyState===1){this.ws.send(JSON.stringify(o));return true}return false}};
function onEvent(d){
 if(d.t==='presence'){S.online[d.user]=d.online;$$(`.pdot[data-u="${d.user}"]`).forEach(x=>x.classList.toggle('on',d.online));return}
 if(d.t==='unread'){S.unread=d.count;updateBadges();return}
 if(d.t==='suspended'){toast('Your account was suspended.');signOutLocal();header();go('#/login');return}
 if(d.t==='notification'){S.notes.items.unshift(d.notification);S.notes.unread++;updateBadges();toast(d.notification.title);
  const lk=d.notification.link,cur=parseHash().path;if(lk&&lk===cur&&cur.startsWith('/order/'))setTimeout(()=>{if(parseHash().path===lk)loadOrder(lk.split('/').pop())},50)}
 const handled=pageHandlers.some(h=>h(d)===true);
 if(d.t==='message'&&!handled&&d.message.sender_id!==(S.user&&S.user.id)){S.unread++;updateBadges();if((S.user.notify_prefs||{}).messages!==false)toast('New message')}
}
const bell=()=>`<details class="menu" id="bell"><summary class="icon" aria-label="Notifications" style="position:relative">${ICON.bell}<span class="badge" id="bellc" ${S.notes.unread?'':'hidden'} style="position:absolute;top:-2px;right:-4px;margin:0">${S.notes.unread}</span></summary><div class="pop notes" id="bellbox">${bellInner()}</div></details>`;
function header(){
 const dark=curTheme()==='dark',u=S.user;
 const themeBtn=`<button class="icon" data-a="theme" aria-label="Switch to ${dark?'light':'dark'} mode" title="Switch to ${dark?'light':'dark'} mode">${dark?ICON.sun:ICON.moon}</button>`;
 if(u&&u.role==='admin'){
  $('#hdr').innerHTML=`<div class="bar"><a class="brand" href="#/admin" aria-label="Admin home" style="color:var(--ink);text-decoration:none"><span class="mark"></span>Crewline</a><span class="pill adm">Super admin</span><span style="flex:1"></span><a class="navb" href="#/">View site</a>${themeBtn}${bell()}
  <details class="menu"><summary aria-label="Account menu">${av(u)}</summary><div class="pop"><div class="who-am"><b>${esc(u.name)}</b><br><span class="muted">${esc(u.email)}</span></div><a href="#/settings/account">Account settings</a><button data-a="signout">Sign out</button></div></details></div>`;
  return}
 const nav=[['gigs','Gigs'],['jobs','Jobs'],['freelancers','Freelancers']];
 const here=parseHash().path.split('/')[1]||'';
 let right='';
 if(u){
  right=`${bell()}<a class="icon" href="#/messages" aria-label="Messages" title="Messages" style="position:relative">${ICON.chat}<span class="badge" id="unread" ${S.unread?'':'hidden'} style="position:absolute;top:-2px;right:-4px;margin:0">${S.unread}</span></a>
  ${u.role==='client'?'<a class="btn pri sm" href="#/post-job">Post a job</a>':'<a class="btn pri sm" href="#/dashboard/gigs">Create a gig</a>'}
  <details class="menu"><summary aria-label="Account menu">${av(u)}</summary><div class="pop"><div class="who-am"><b>${esc(u.name)}</b><br><span class="muted">${u.role==='client'?'Client account':'Freelancer account'}</span></div>
  <a href="#/dashboard">Dashboard</a><a href="#/messages">Messages</a><a href="#/profile">Your profile</a><a href="#/settings/account">Settings</a><button data-a="signout">Sign out</button></div></details>`;
 }else right=`<a class="navb" href="#/login">Sign in</a><a class="btn pri sm" href="#/signup">Join</a>`;
 $('#hdr').innerHTML=`<div class="bar"><a class="brand" href="#/" aria-label="Crewline home" style="color:var(--ink);text-decoration:none"><span class="mark"></span>Crewline</a>
 <nav aria-label="Main">${nav.map(([v,l])=>`<a class="navb" href="#/${v}" ${here===v?'aria-current="page"':''}>${l}</a>`).join('')}</nav>${themeBtn}${right}</div>`;
}
function footer(){
 $('#ftr').innerHTML=`<div class="wrap foot"><div class="cols"><div><a class="brand" href="#/" style="text-decoration:none"><span class="mark"></span>Crewline</a><p style="max-width:32ch;margin:0">A freelance marketplace with escrow payments and built-in messaging.</p></div>
 <div><b>Clients</b><a href="#/gigs">Browse gigs</a><a href="#/freelancers">Find freelancers</a><a href="#/post-job">Post a job</a><a href="#/login/client">Client sign in</a></div>
 <div><b>Freelancers</b><a href="#/jobs">Find jobs</a><a href="#/signup/freelancer">Become a freelancer</a><a href="#/login/freelancer">Freelancer sign in</a></div>
 <div><b>Company</b><a href="#/settings/account">Account settings</a><a href="#/messages">Messages</a><a href="#/admin/login">Admin console</a></div></div>
 <div class="fine">Crewline is a demo build. Payments are simulated and no real money moves.</div></div>`;
}

/* ---------- router ---------- */
const routes=[];
const R=(pattern,fn,opts={})=>routes.push({re:new RegExp('^'+pattern.replace(/:(\w+)/g,'(?<$1>[^/]+)')+'$'),fn,...opts});
const APP_RE=/^\/(dashboard|order|messages|profile|settings|notifications|post-job|admin(?!\/login))/;
let timers=[];
const every=(fn,ms)=>timers.push(setInterval(fn,ms));
const clearTimers=()=>{timers.forEach(clearInterval);timers=[];pageHandlers.length=0};
let onFilter=null,onFilterK=null;
function parseHash(){const h=location.hash.slice(1)||'/';const i=h.indexOf('?');const p=i<0?h:h.slice(0,i);return{path:(p.replace(/\/+$/,'')||'/'),q:new URLSearchParams(i<0?'':h.slice(i+1))}}
async function route(){
 apiEpoch++;clearTimers();onFilter=null;onFilterK=null;closeDlg();
 const{path,q}=parseHash();
 document.body.dataset.area=APP_RE.test(path)?'app':'site';
 header();
 for(const r of routes){
  const m=path.match(r.re);if(!m)continue;
  if(r.auth&&!S.user){location.hash=(r.role==='admin'?'#/admin/login?next=':'#/login?next=')+encodeURIComponent(location.hash.slice(1));return}
  if(r.role){const ok=r.role==='member'?S.user.role!=='admin':S.user.role===r.role;
   if(!ok){if(S.user.role==='admin'){go('#/admin');return}
    page(wrapPage(`<div class="empty"><h3>This page is for ${r.role==='member'?'client and freelancer':r.role} accounts</h3><a class="btn mt" href="#/dashboard">Go to your dashboard</a></div>`));footer();return}}
  page(`<div class="wrap page2"><div class="skel"></div></div>`);
  window.scrollTo(0,0);
  try{await r.fn(m.groups||{},q)}catch(e){page(wrapPage(`<div class="empty"><h3>${esc(e.message)}</h3><a class="btn mt" href="#/">Back to home</a></div>`))}
  footer();return}
 page(wrapPage(`<div class="empty"><h3>Page not found</h3><a class="btn mt" href="#/">Back to home</a></div>`));footer();
}
const go=h=>{if(location.hash===h)route();else location.hash=h};

/* ---------- landing ---------- */
const HOW={
 client:[['Post a job or pick a gig','Describe what you need, or choose a ready-made gig with fixed packages.'],['Compare proposals','Freelancers send a price and a plan. Read profiles, reviews and past work.'],['Fund escrow','Your payment is held safely. The freelancer starts only after it is funded.'],['Approve and release','Review the delivery. Release payment, or ask for a revision.']],
 freelancer:[['Build your profile','Add your skills, rate and a short bio so clients know what you do best.'],['Create gigs, send proposals','Sell fixed-price packages, or answer open jobs with a tailored proposal.'],['Work with funded orders','Every order is funded before you begin, so you never chase payment.'],['Get paid on approval','When the client approves, your earnings land in your wallet.']]};
const howHtml=t=>`<div class="steps4">${HOW[t].map(([h,p],i)=>`<div class="step4"><i>${i+1}</i><b>${h}</b><p>${p}</p></div>`).join('')}</div>`;
R('/',async()=>{
 const[gigs,freel,jobs]=await Promise.all([api('/gigs?limit=8'),api('/freelancers?limit=6'),api('/jobs?limit=4')]);
 const st=S.meta.stats||{};
 page(`<section class="wrap hero"><h1>Hire the right freelancer.<br>Pay when the work is approved.</h1>
 <p class="lede">Crewline holds your payment in escrow until you are happy with the result.</p>
 <form class="search" data-form="search" role="search"><input name="q" placeholder="Search for logo design, Next.js, podcast editing" aria-label="Search gigs"><button class="btn pri">Search</button></form>
 <div class="pop-chips"><span>Popular</span>${['logo design','web app','video editing','SEO','copywriting'].map(t=>`<a class="chip" href="#/gigs?q=${encodeURIComponent(t)}">${t}</a>`).join('')}</div>
 <div class="stats"><div><b>${st.freelancers??0}</b><span>Freelancers</span></div><div><b>${st.gigs??0}</b><span>Gigs</span></div><div><b>${st.open_jobs??0}</b><span>Open jobs</span></div><div><b>${st.completed_orders??0}</b><span>Projects completed</span></div></div></section>
 <section class="wrap section"><div class="sec-h"><h2>Browse by category</h2></div><div class="cats">${S.meta.categories.map(c=>{const pic=c.image&&/^(https?:\/\/|\/)/i.test(c.image);
  return `<a class="cat${pic?' pic':''}" href="#/gigs?category=${c.id}">${pic?`<img src="${esc(c.image)}" alt="">`:thumb('c'+c.id,c.id)}<b>${esc(c.name)}</b><span>${c.gigs} gig${c.gigs===1?'':'s'} · ${c.jobs} open job${c.jobs===1?'':'s'}</span></a>`}).join('')}</div></section>
 <section class="wrap section" style="padding-top:0"><div class="sec-h"><h2>Top rated gigs</h2><a href="#/gigs">See all gigs</a></div><div class="grid" style="padding-bottom:0">${gigs.slice(0,8).map(gigCard).join('')}</div></section>
 <section class="wrap section"><div class="sec-h"><h2>How Crewline works</h2><div class="tabsw" role="group" aria-label="Audience"><button data-a="how" data-v="client" aria-pressed="true">For clients</button><button data-a="how" data-v="freelancer" aria-pressed="false">For freelancers</button></div></div><div id="how">${howHtml('client')}</div></section>
 <section class="wrap"><div class="how"><h2>Your money moves only when you say so.</h2><div class="how-grid">${[['Fund','Your payment is held in escrow.'],['Work','The freelancer starts and delivers.'],['Review','Approve it, or ask for a revision.'],['Release','Payment goes to the freelancer.']].map(([t,d])=>`<div><b>${t}</b><p>${d}</p></div>`).join('')}</div></div></section>
 <section class="wrap section" style="padding-top:0"><div class="sec-h"><h2>Freelancers clients hire again</h2><a href="#/freelancers">See all freelancers</a></div><div class="fcards">${freel.map(freelancerCard).join('')}</div></section>
 <section class="wrap section" style="padding-top:0"><div class="sec-h"><h2>Open jobs</h2><a href="#/jobs">See all jobs</a></div><div class="list" style="margin-top:0">${jobs.map(jobCard).join('')}</div></section>
 <section class="wrap section" style="padding-top:0"><div class="cta2"><div class="cta dark"><h3>Hire with confidence.</h3><p>Post a job in two minutes and compare proposals from vetted freelancers.</p><a class="btn" href="#/signup?role=client">Start hiring</a></div><div class="cta"><h3>Do the work you love.</h3><p>Create gigs, answer jobs, and get paid when the client approves.</p><a class="btn pri" href="#/signup?role=freelancer">Start earning</a></div></div></section>`);
});

/* ---------- gigs / jobs / freelancers lists ---------- */
const sel=(name,val,opts)=>`<select data-f="${name}" aria-label="${name}">${opts.map(([v,l])=>`<option value="${v}" ${String(val)===String(v)?'selected':''}>${l}</option>`).join('')}</select>`;
const catChips=(cur,key='category')=>`<div class="chips" style="justify-content:flex-start;margin:0 0 6px" role="group" aria-label="Categories"><button class="chip" data-a="fcat" data-k="${key}" data-v="all" aria-pressed="${cur==='all'}">All</button>${S.meta.categories.map(c=>`<button class="chip" data-a="fcat" data-k="${key}" data-v="${c.id}" aria-pressed="${cur===c.id}">${esc(c.name)}</button>`).join('')}</div>`;
const qs=o=>new URLSearchParams(Object.entries(o).filter(([,v])=>v!==''&&v!=null&&v!=='all')).toString();
function listPage({base,title,lead,state,toolbar,render,load,emptyMsg}){
 const run=async()=>{
  const p=new URLSearchParams();Object.entries(state).forEach(([k,v])=>{if(v&&v!=='all'&&v!=='recommended'&&v!=='rating')p.set(k,v)});
  history.replaceState(null,'','#/'+base+(p.toString()?'?'+p:''));
  const box=$('#results');if(!box)return;
  try{const rows=await load(state);if(!$('#results'))return;
   $('#count').textContent=`${rows.length} result${rows.length===1?'':'s'}`;
   box.innerHTML=rows.length?render(rows):`<div class="empty">${emptyMsg}</div>`}
  catch(e){box.innerHTML=`<div class="empty">${esc(e.message)}</div>`}};
 page(wrapPage(`<h1>${title}</h1><p class="muted lead">${lead}</p>
  <div class="toolbar2"><input type="search" data-f="q" value="${esc(state.q||'')}" placeholder="Search" aria-label="Search">${toolbar(state)}</div>
  ${catChips(state.category||'all')}<p class="muted" id="count" style="font-size:14px;margin:12px 0 18px" aria-live="polite"></p><div id="results"></div>`));
 let t;onFilter=(k,v,now)=>{state[k]=v;clearTimeout(t);if(now||k!=='q')run();else t=setTimeout(run,250)};
 run();
}
R('/gigs',async(m,q)=>{
 const st={q:q.get('q')||'',category:q.get('category')||'all',max_price:q.get('max_price')||'',max_days:q.get('max_days')||'',sort:q.get('sort')||'recommended'};
 listPage({base:'gigs',title:'Browse gigs',lead:'Fixed-price services with clear packages.',state:st,
  toolbar:s=>sel('max_price',s.max_price,[['','Any budget'],[50,'Up to $50'],[100,'Up to $100'],[250,'Up to $250'],[500,'Up to $500']])+sel('max_days',s.max_days,[['','Any delivery time'],[2,'2 days or less'],[5,'5 days or less'],[10,'10 days or less']])+sel('sort',s.sort,[['recommended','Recommended'],['price_low','Price, low to high'],['price_high','Price, high to low'],['newest','Newest']]),
  load:s=>api('/gigs?'+qs({q:s.q,category:s.category,max_price:s.max_price,max_days:s.max_days,sort:s.sort})),
  render:rows=>`<div class="grid" style="padding-bottom:0">${rows.map(gigCard).join('')}</div>`,
  emptyMsg:'<h3>No gigs match</h3><p class="muted">Clear a filter, or post a job and let freelancers come to you.</p>'});
});
/* ---------- Find Jobs: advanced filters, sorting and applied proposals ---------- */
const EXP={entry:'Entry level',intermediate:'Intermediate',expert:'Expert'};
const DUR={week:'Under 1 week',month:'1 to 4 weeks',quarter:'1 to 3 months',long:'3+ months'};
const PROPS={lt5:[null,4],'5_10':[5,10],'10_20':[10,20],'20p':[20,null]};
const PROP_LABEL={lt5:'Less than 5','5_10':'5 to 10','10_20':'10 to 20','20p':'20 or more'};
const POSTED={24:'Last 24 hours',72:'Last 3 days',168:'Last 7 days',720:'Last 30 days'};
const propsLabel=n=>n<5?'Less than 5':n<=10?'5 to 10':n<=15?'10 to 15':n<=20?'15 to 20':n<=50?'20 to 50':'50+';
const kfmt=n=>n>=1000?'$'+(Math.round(n/100)/10).toString().replace(/\.0$/,'')+'K':'$'+Math.round(n||0);
const starsOf=r=>{const n=Math.round(r||0);return `<span class="stars" aria-hidden="true">${'★'.repeat(n)}${'☆'.repeat(5-n)}</span>`};
const cap=s=>String(s).replace(/_/g,' ').replace(/^./,c=>c.toUpperCase());
const excerpt=(t,n=240)=>t.length>n?t.slice(0,n).trimEnd()+'…':t;
const sinceYear=iso=>iso?new Date(iso).toLocaleDateString('en-US',{month:'short',year:'numeric'}):'';
const jobCard2=j=>{
 const st=j.client_stats||{},hit=new Set((j.match||[]).map(x=>x.toLowerCase()));
 return `<article class="job2"><div class="j2-main"><div class="j2-meta">${esc(EXP[j.experience_level]||'')} · ${esc(DUR[j.duration]||'')} · Posted ${ago(j.created_at)}</div>
  <h3><a class="stretch" href="#/job/${j.id}">${esc(j.title)}</a></h3><p class="j2-desc">${esc(excerpt(j.description))}</p>
  <div class="tags">${j.skills.map(s=>`<span class="tag ${hit.has(s.toLowerCase())?'hit':''}">${esc(s)}</span>`).join('')}</div>
  <div class="j2-client">${st.verified?'<span class="vf">✓ Payment verified</span>':'<span class="muted">Payment unverified</span>'}<span>${st.reviews_count?`${starsOf(st.rating)} ${st.rating.toFixed(1)}`:'No reviews yet'}</span><span>${kfmt(st.total_spent)} spent</span>${st.location?`<span class="muted">${esc(st.location)}</span>`:''}</div></div>
  <div class="j2-side"><span class="price">${fmt(j.budget)}</span><span class="muted">Fixed price</span><span class="muted">Proposals: ${propsLabel(j.proposals_count)}</span>${j.applied?`<span class="pill ok">Applied · ${esc(cap(j.applied))}</span>`:`<a class="btn sm" href="#/job/${j.id}">View job</a>`}</div></article>`};
let JC=null;
R('/jobs',async(m,q)=>{
 const jf={};['q','category','experience','duration','skills','min_budget','max_budget','verified','min_rating','min_spent','proposals','posted_within','applied'].forEach(k=>jf[k]=q.get(k)||'');jf.sort=q.get('sort')||'newest';
 const fl=!!S.user&&S.user.role==='freelancer';
 const myProps=fl?await api('/me/proposals').catch(()=>[]):[];
 let items=[],total=0,facets={},seq=0,t;
 const has=(k,v)=>jf[k].split(',').includes(v);
 const cb=(key,val,label,checked,csv=true)=>`<label class="fck"><input type="checkbox" data-fk="${key}" data-fv="${esc(val)}" ${csv?'data-csv="1"':''} ${checked?'checked':''}><span>${esc(label)}</span><i class="cnt" data-count="${key}:${esc(val)}"></i></label>`;
 const rb=(key,val,label)=>`<label class="fck"><input type="radio" name="r_${key}" data-fk="${key}" data-fv="${val}" ${String(jf[key])===String(val)?'checked':''}><span>${label}</span></label>`;
 const group=(title,body,open=true)=>`<details class="fg" ${open?'open':''}><summary>${title}</summary><div class="fg-b">${body}</div></details>`;
 const panel=()=>{
  const mine=fl?`<div class="fbox"><div class="between"><b>My proposals</b><span class="pill">${myProps.length}</span></div>${myProps.length?myProps.slice(0,5).map(p=>`<a class="mprop" href="#/job/${p.job.id}"><span>${esc(p.job.title)}</span><small>${fmt(p.bid)} · <i class="st st-${p.status}">${cap(p.status)}</i> · ${ago(p.created_at)}</small></a>`).join(''):'<p class="muted" style="margin:8px 0 0;font-size:14px">You have not applied to a job yet.</p>'}${myProps.length?'<a class="fbox-f" href="#/dashboard/proposals">View all proposals</a>':''}</div>`
   :S.user?'<div class="fbox"><b>Hiring?</b><p class="muted" style="margin:6px 0 10px;font-size:14px">Post a job and let freelancers come to you.</p><a class="btn sm" href="#/post-job">Post a job</a></div>'
   :'<div class="fbox"><b>Looking for work?</b><p class="muted" style="margin:6px 0 10px;font-size:14px">Sign in as a freelancer to track proposals and see best matches.</p><a class="btn sm" href="#/login/freelancer">Sign in</a></div>';
  return mine+
  group('Category',S.meta.categories.map(c=>cb('category',c.id,c.name,has('category',c.id))).join(''))+
  group('Experience level',Object.entries(EXP).map(([v,l])=>cb('experience',v,l,has('experience',v))).join(''))+
  group('Budget',`<div class="row2" style="gap:8px"><input class="pin" type="number" min="0" step="50" placeholder="Min $" value="${esc(jf.min_budget)}" data-f="min_budget" aria-label="Minimum budget"><input class="pin" type="number" min="0" step="50" placeholder="Max $" value="${esc(jf.max_budget)}" data-f="max_budget" aria-label="Maximum budget"></div><div class="presets">${[[0,500,'Under $500'],[500,1000,'$500 to $1K'],[1000,3000,'$1K to $3K'],[3000,'','$3K+']].map(([a,b,l])=>`<button type="button" class="chip" data-a="jf-budget" data-min="${a||''}" data-max="${b}">${l}</button>`).join('')}</div>`)+
  group('Project length',Object.entries(DUR).map(([v,l])=>cb('duration',v,l,has('duration',v))).join(''),false)+
  group('Number of proposals',rb('proposals','','Any')+Object.entries(PROP_LABEL).map(([v,l])=>rb('proposals',v,l)).join(''),false)+
  group('Posted',rb('posted_within','','Any time')+Object.entries(POSTED).map(([v,l])=>rb('posted_within',v,l)).join(''),false)+
  group('Client info',cb('verified','1','Payment method verified',!!jf.verified,false)+cb('min_rating','4.5','Client rating 4.5 and up',jf.min_rating==='4.5',false)+cb('min_spent','10000','Spent $10K or more',jf.min_spent==='10000',false))+
  group('Skills',`<input class="pin" data-f="skills" value="${esc(jf.skills)}" placeholder="Figma, Next.js" aria-label="Skills"><small class="muted">Separate with commas. Matches any.</small>`,false)+
  (fl?group('Applied jobs',rb('applied','','Show all jobs')+rb('applied','hide','Hide jobs I applied to')+rb('applied','only','Only jobs I applied to')):'')+
  `<button class="link" style="margin-top:14px" data-a="jf-clear">Clear all filters</button>`};
 const chipsOf=()=>{const out=[];
  const csv=(key,label)=>jf[key].split(',').filter(Boolean).forEach(v=>out.push([key,v,label(v)]));
  csv('category',catName);csv('experience',v=>EXP[v]||v);csv('duration',v=>DUR[v]||v);csv('skills',v=>v);
  if(jf.min_budget||jf.max_budget)out.push(['budget','','Budget '+(jf.min_budget?fmt(jf.min_budget):'$0')+(jf.max_budget?' to '+fmt(jf.max_budget):'+')]);
  if(jf.verified)out.push(['verified','','Payment verified']);if(jf.min_rating)out.push(['min_rating','','Client rating '+jf.min_rating+'+']);if(jf.min_spent)out.push(['min_spent','','Spent '+kfmt(+jf.min_spent)+'+']);
  if(jf.proposals)out.push(['proposals','','Proposals: '+PROP_LABEL[jf.proposals]]);if(jf.posted_within)out.push(['posted_within','',POSTED[jf.posted_within]]);
  if(jf.applied)out.push(['applied','',jf.applied==='hide'?'Hiding applied jobs':'Applied jobs only']);return out};
 const drawChips=()=>{const c=chipsOf(),el=$('#achips');if(el)el.innerHTML=c.length?c.map(([k,v,l])=>`<button class="chip x" data-a="jf-rm" data-k="${k}" data-v="${esc(v)}" aria-label="Remove filter ${esc(l)}">${esc(l)} <span aria-hidden="true">×</span></button>`).join('')+'<button class="link" data-a="jf-clear" style="font-size:14px">Clear all</button>':''};
 const counts=()=>{for(const [fk,map] of Object.entries({category:facets.category,experience:facets.experience,duration:facets.duration}))$$(`[data-count^="${fk}:"]`).forEach(e=>{e.textContent=(map||{})[e.dataset.count.split(':')[1]]||0})};
 const params=offset=>{const p={q:jf.q,category:jf.category,experience:jf.experience,duration:jf.duration,skills:jf.skills,min_budget:jf.min_budget,max_budget:jf.max_budget,verified:jf.verified?'true':'',min_rating:jf.min_rating,min_spent:jf.min_spent,posted_within:jf.posted_within,applied:jf.applied,sort:jf.sort==='newest'?'':jf.sort,limit:20,offset};const pr=PROPS[jf.proposals];if(pr){if(pr[0]!=null)p.min_proposals=pr[0];if(pr[1]!=null)p.max_proposals=pr[1]}return qs(p)};
 const sync=()=>{const p=new URLSearchParams();for(const[k,v]of Object.entries(jf))if(v&&!(k==='sort'&&v==='newest'))p.set(k,v);history.replaceState(null,'','#/jobs'+(p.toString()?'?'+p:''))};
 const draw=()=>{const c=$('#count');if(!c)return;c.textContent=`${total} job${total===1?'':'s'} found`;
  $('#results').innerHTML=items.length?items.map(jobCard2).join('')+(items.length<total?'<p class="center mt"><button class="btn ghost" data-a="jf-more">Load more jobs</button></p>':''):`<div class="empty"><h3>No jobs match these filters</h3><p class="muted">Try removing a filter or broadening your search.</p><button class="btn mt" data-a="jf-clear">Clear all filters</button></div>`;
  drawChips();counts()};
 const run=async append=>{const my=++seq;sync();
  try{const r=await api('/jobs/search?'+params(append?items.length:0));if(my!==seq)return;items=append?[...items,...r.items]:r.items;total=r.total;facets=r.facets;draw()}
  catch(e){if(my===seq&&$('#results'))$('#results').innerHTML=`<div class="empty">${esc(e.message)}</div>`}};
 const redrawPanel=()=>{const p=$('#fpanel');if(p){p.innerHTML=panel();counts()}};
 JC={jf,run,more:()=>run(true),redrawPanel,drawChips};
 page(wrapPage(`<h1>Find jobs</h1><p class="muted lead">Filter by budget, level, client history and more. Clients fund escrow before you start.</p>
  <div class="jobs-layout mt"><aside class="fpanel" id="fpanel" aria-label="Filters">${panel()}</aside><div class="jobs-main">
  <div class="toolbar2" style="margin-top:0"><input type="search" data-f="q" value="${esc(jf.q)}" placeholder="Search jobs, skills or clients" aria-label="Search jobs"><select data-f="sort" aria-label="Sort jobs">${[['newest','Newest'],...(fl?[['best_match','Best match']]:[]),['budget_high','Budget: high to low'],['budget_low','Budget: low to high'],['fewest_proposals','Fewest proposals'],['client_rating','Client rating'],['client_spent','Client spend']].map(([v,l])=>`<option value="${v}" ${jf.sort===v?'selected':''}>${l}</option>`).join('')}</select><button class="btn ghost sm filter-toggle" data-a="jf-toggle">Filters</button></div>
  <div class="achips" id="achips"></div><p class="muted" id="count" style="font-size:14px;margin:6px 0 14px" aria-live="polite"></p><div id="results" class="list" style="margin-top:0"></div></div></div>`));
 onFilter=(k,v)=>{jf[k]=v;clearTimeout(t);t=setTimeout(()=>run(false),k==='q'||k==='skills'||k.endsWith('budget')?280:0);if(k==='skills')drawChips()};
 onFilterK=el=>{const k=el.dataset.fk,v=el.dataset.fv;
  if(el.dataset.csv){const set=new Set(jf[k].split(',').filter(Boolean));el.checked?set.add(v):set.delete(v);jf[k]=[...set].join(',')}
  else if(el.type==='checkbox')jf[k]=el.checked?v:'';else jf[k]=v;
  drawChips();run(false)};
 await run(false);
});

R('/freelancers',async(m,q)=>{
 const st={q:q.get('q')||'',category:q.get('category')||'all',sort:q.get('sort')||'rating'};
 listPage({base:'freelancers',title:'Find freelancers',lead:'Browse profiles, ratings and rates.',state:st,
  toolbar:s=>sel('sort',s.sort,[['rating','Top rated'],['rate','Lowest rate']]),
  load:s=>api('/freelancers?'+qs({q:s.q,category:s.category,sort:s.sort})),
  render:rows=>`<div class="fcards">${rows.map(freelancerCard).join('')}</div>`,
  emptyMsg:'<h3>No freelancers match</h3><p class="muted">Try different keywords or another category.</p>'});
});

/* ---------- gig detail + checkout ---------- */
let cur=null,pend=null;
const pkgHtml=()=>{const{g,k}=cur,p=g.packages[k];
 return `<div class="tabs" role="tablist">${g.packages.map((x,i)=>`<button role="tab" aria-selected="${i===k}" data-a="pkg" data-v="${i}">${x.tier[0].toUpperCase()+x.tier.slice(1)}</button>`).join('')}</div>
 <div class="between" style="align-items:baseline"><h3 style="font-size:32px">${fmt(p.price)}</h3><span class="muted">${p.delivery_days}-day delivery</span></div>
 <ul>${p.features.map(f=>`<li>${esc(f)}</li>`).join('')}<li>${p.revisions<0?'Unlimited revisions':p.revisions+' revision'+(p.revisions===1?'':'s')}</li></ul>
 <button class="btn pri" data-a="checkout" ${S.user&&S.user.role!=='client'?'disabled':''}>${S.user&&S.user.role!=='client'?'Hiring needs a client account':'Continue to payment'}</button>`};
R('/gig/:id',async({id})=>{
 const g=await api('/gigs/'+id);cur={g,k:0};const f=g.freelancer;
 page(wrapPage(`<a class="crumb" href="#/gigs">‹ All gigs</a><div class="grid3"><div>
  <div class="thumb" style="border-radius:24px;overflow:hidden;margin-bottom:24px">${cover(g)}</div>
  <h1 style="font-size:clamp(28px,4vw,40px);margin-bottom:16px">${esc(g.title)}</h1>
  <a class="who" href="#/freelancer/${f.id}" style="margin-bottom:18px">${av(f)}<span><b>${esc(f.name)}</b><br><span class="muted">${esc(f.headline)}</span></span></a>
  <p style="font-size:18px;line-height:1.5;max-width:60ch">${esc(g.description)}</p>
  <div class="tags mt">${g.tags.map(t=>`<span class="tag">${esc(t)}</span>`).join('')}<span class="tag">${esc(catName(g.category))}</span></div>
  <h3 class="sec">About ${esc(f.name.split(' ')[0])}</h3><p class="muted" style="max-width:60ch">${esc(g.bio)}</p><div class="tags">${g.skills.map(s=>`<span class="tag">${esc(s)}</span>`).join('')}</div>
  <p class="mt"><a href="#/freelancer/${f.id}">View full profile</a></p></div>
  <div class="pkg" id="pkgbox" style="position:sticky;top:80px">${pkgHtml()}</div></div>`));
});

/* ---------- freelancer + client profiles ---------- */
R('/freelancer/:id',async({id})=>{
 const f=await api('/freelancers/'+id),p=f.profile,mine=S.user&&String(S.user.id)===String(f.id);
 page(wrapPage(`<div class="hero2 phero">${av(f,true)}<div style="flex:1"><h1>${esc(f.name)}</h1><p class="muted" style="margin:4px 0 8px;font-size:18px">${esc(p.headline)}</p><div class="row">${rating(p.rating,p.reviews_count)}<span class="muted">${esc(p.location)}</span>${(p.languages||[]).length?`<span class="muted">${p.languages.map(esc).join(' · ')}</span>`:''}<span class="pill ${p.available?'ok':''}">${p.available?'Available for work':'Not available'}</span></div></div>
  <div class="row">${mine?`<a class="btn ghost" href="#/profile">Edit profile</a>`:''}${S.user&&S.user.role==='client'?`<button class="btn pri" data-a="msg" data-v="${f.id}">Message</button>`:''}${!S.user?'<a class="btn pri" href="#/login">Sign in to message</a>':''}</div></div>
  <div class="dgrid" style="margin-top:28px"><div class="stat"><span class="muted">Hourly rate</span><b>${fmt(p.hourly_rate)}</b></div><div class="stat"><span class="muted">Projects completed</span><b>${p.jobs_completed}</b></div><div class="stat"><span class="muted">Reviews</span><b>${p.reviews_count}</b></div></div>
  <h3 class="sec">About</h3><p style="max-width:64ch;font-size:18px;line-height:1.5">${esc(p.bio)}</p><div class="tags">${(p.skills||[]).map(s=>`<span class="tag">${esc(s)}</span>`).join('')}</div>
  ${(p.experience||[]).length?`<h3 class="sec">Experience</h3><div class="list">${p.experience.map(e=>`<div class="order"><div class="between"><b>${esc(e.role)}${e.company?' · '+esc(e.company):''}</b><span class="muted">${esc(e.period)}</span></div>${e.description?`<p style="margin:0">${esc(e.description)}</p>`:''}</div>`).join('')}</div>`:''}
  ${(p.portfolio||[]).length?`<h3 class="sec">Portfolio</h3><div class="fcards">${p.portfolio.map(x=>`<div class="fcard"><h3>${/^https?:\/\//i.test(x.link)?`<a href="${esc(x.link)}" target="_blank" rel="noopener noreferrer">${esc(x.title)}</a>`:esc(x.title)}</h3><p class="muted" style="margin:0">${esc(x.description)}</p></div>`).join('')}</div>`:''}
  <h3 class="sec">Gigs</h3><div class="grid" style="padding-bottom:0;margin-top:18px">${f.gigs.length?f.gigs.map(gigCard).join(''):empty('No gigs yet.')}</div>
  <h3 class="sec">Reviews</h3><div class="list">${f.reviews.length?f.reviews.map(r=>`<div class="order"><div class="between"><span class="row">${av(r.client)}<b>${esc(r.client.name)}</b><span class="muted">${esc(r.client.company||'')}</span></span><span class="stars" aria-label="${r.rating} out of 5">${'★'.repeat(r.rating)}</span></div><p style="margin:0">${esc(r.comment)}</p><small class="muted">${ago(r.created_at)}</small></div>`).join(''):empty('No written reviews yet.')}</div>`));
});
/* ---------- client history blocks (shared by job pages and client profiles) ---------- */
const jobStatusPill=s=>`<span class="pill ${s==='open'?'ok':''}">${s==='open'?'Open':s==='in_progress'?'In progress':'Completed'}</span>`;
const clientRows=(st)=>[['Jobs posted',st.jobs_posted],['Hire rate',st.jobs_posted?st.hire_rate+'%':'No data'],['Total spent',fmt(st.total_spent)],['Member since',sinceYear(st.member_since)||'—']].map(([a,b])=>`<div><span class="muted">${a}</span><b>${b}</b></div>`).join('');
const clientBox=(c,st)=>`<div class="clientbox"><h3 style="font-size:18px;margin-bottom:14px">About the client</h3>
 <div class="row" style="margin-bottom:12px">${av(c)}<span><a href="#/client/${c.id}"><b>${esc(c.company||c.name)}</b></a>${c.company?`<br><span class="muted" style="font-size:14px">${esc(c.name)}</span>`:''}</span></div>
 <p style="margin:0 0 8px">${st.verified?'<b class="vf">✓ Payment method verified</b>':'<span class="muted">Payment method not verified</span>'}</p>
 <p style="margin:0 0 4px">${st.reviews_count?`${starsOf(st.rating)} <b>${st.rating.toFixed(1)}</b> <span class="muted">of ${st.reviews_count} review${st.reviews_count===1?'':'s'}</span>`:'<span class="muted">No reviews yet</span>'}</p>
 ${st.location?`<p class="muted" style="margin:0 0 14px">${esc(st.location)}</p>`:'<div style="height:14px"></div>'}
 <div class="stat-rows">${clientRows(st)}</div><p style="margin:14px 0 0"><a href="#/client/${c.id}">View client profile</a></p></div>`;
const pastJobsHtml=jobs=>jobs.length?`<div class="list" style="margin-top:12px">${jobs.map(p=>`<div class="order prow"><div class="between"><span><a href="#/job/${p.id}"><b>${esc(p.title)}</b></a><br><small class="muted">Posted ${ago(p.created_at)} · ${esc(catName(p.category))}</small></span><span class="row">${fmt(p.budget)} ${jobStatusPill(p.status)}</span></div></div>`).join('')}</div>`:'<p class="muted">No other jobs yet.</p>';
const clientReviewsHtml=(list,st)=>`<div class="row" style="gap:10px;margin-top:6px"><b style="font-size:18px">${st.reviews_count?`${starsOf(st.rating)} ${st.rating.toFixed(1)}`:'No reviews yet'}</b>${st.reviews_count?`<span class="muted">${st.reviews_count} review${st.reviews_count===1?'':'s'} from freelancers</span>`:''}</div>
 <div class="list" style="margin-top:12px">${list.map(r=>`<div class="order"><div class="between"><span class="row">${av(r.freelancer)}<span><a href="#/freelancer/${r.freelancer.id}"><b>${esc(r.freelancer.name)}</b></a><br><span class="muted" style="font-size:13px">${esc(r.freelancer.headline||'')}</span></span></span><span class="stars" aria-label="${r.rating} out of 5">${'★'.repeat(r.rating)}${'☆'.repeat(5-r.rating)}</span></div>${r.comment?`<p style="margin:0">${esc(r.comment)}</p>`:''}<small class="muted">${ago(r.created_at)}</small></div>`).join('')}</div>`;

R('/client/:id',async({id})=>{
 const c=await api('/clients/'+id),p=c.profile,st=c.stats;
 page(wrapPage(`<div class="hero2">${av(c,true)}<div style="flex:1"><h1>${esc(p.company||c.name)}</h1><p class="muted" style="margin:4px 0 8px;font-size:18px">${esc(c.name)}${p.location?' · '+esc(p.location):''}${p.industry?' · '+esc(p.industry):''}</p><div class="row">${st.verified?'<span class="pill ok">✓ Payment verified</span>':'<span class="pill">Payment not verified</span>'}${p.website&&/^https?:\/\//i.test(p.website)?`<a href="${esc(p.website)}" target="_blank" rel="noopener noreferrer">${esc(p.website.replace(/^https?:\/\//,''))}</a>`:''}</div></div></div>
  <div class="kpis" style="grid-template-columns:repeat(4,1fr)">${kpi('Rating',st.reviews_count?st.rating.toFixed(1)+' ★':'New',st.reviews_count+' review'+(st.reviews_count===1?'':'s'))}${kpi('Total spent',fmt(st.total_spent))}${kpi('Jobs posted',st.jobs_posted)}${kpi('Hire rate',st.jobs_posted?st.hire_rate+'%':'—','Member since '+(sinceYear(st.member_since)||'—'))}</div>
  ${p.bio?`<h3 class="sec">About</h3><p style="max-width:64ch;font-size:18px;line-height:1.5;margin-top:8px">${esc(p.bio)}</p>`:''}
  <h3 class="sec">Open jobs</h3><div class="list">${c.open_jobs.length?c.open_jobs.map(jobCard).join(''):empty('No open jobs right now.')}</div>
  <h3 class="sec">Work history</h3>${pastJobsHtml(c.past_jobs)}
  <h3 class="sec">Reviews from freelancers</h3>${clientReviewsHtml(c.reviews,st)}`));
});

/* ---------- job detail ---------- */
R('/job/:id',async({id})=>{
 const j=await api('/jobs/'+id),u=S.user,mine=u&&u.id===j.client.id,st=j.client_stats;curJob=j;
 const hit=new Set((j.match||[]).map(x=>x.toLowerCase()));
 let action='';
 if(mine){
  const props=await api(`/jobs/${id}/proposals`);
  action=`<h3 class="sec" id="propose">Proposals (${props.length})</h3><div class="list">${props.length?props.map(p=>`<article class="order"><div class="between"><span class="row">${av(p.freelancer)}<span><a href="#/freelancer/${p.freelancer.id}"><b>${esc(p.freelancer.name)}</b></a><br><span class="muted">${esc(p.freelancer.headline)}</span></span></span><span class="price" style="font-size:20px">${fmt(p.bid)} · ${p.delivery_days} days</span></div><p style="margin:0">${esc(p.cover_letter)}</p><div class="acts">${p.status==='pending'&&j.status==='open'?`<button class="btn pri sm" data-a="hire" data-v="${p.id}" data-bid="${p.bid}" data-name="${esc(p.freelancer.name)}" data-days="${p.delivery_days}">Hire ${esc(p.freelancer.name.split(' ')[0])}</button><button class="btn ghost sm" data-a="msg" data-v="${p.freelancer.id}">Message</button>`:`<span class="pill ${p.status==='accepted'?'ok':''}">${cap(p.status)}</span>`}</div></article>`).join(''):empty('No proposals yet. Freelancers will appear here.')}</div>
  ${j.status==='open'?`<p class="mt"><button class="btn ghost sm" data-a="closejob" data-v="${j.id}">Close this job</button></p>`:''}`;
 }else if(u&&u.role==='freelancer'){
  const mp=j.my_proposal;
  action=mp?`<div class="panel mt" id="propose"><div class="between"><b>Your proposal</b><span class="pill ${mp.status==='accepted'?'ok':mp.status==='rejected'?'warn':''}">${cap(mp.status)}</span></div><p style="margin:8px 0 4px"><b>${fmt(mp.bid)}</b> <span class="muted">in ${mp.delivery_days} days · sent ${ago(mp.created_at)}</span></p><p style="margin:0;white-space:pre-wrap">${esc(mp.cover_letter)}</p>${mp.status==='pending'?`<div class="acts mt"><button class="btn ghost sm" data-a="withdraw" data-v="${mp.id}">Withdraw proposal</button></div>`:''}</div>`
   :j.status==='open'?`<form class="form panel mt" id="propose" data-form="proposal" data-j="${j.id}" style="max-width:none"><h3 style="font-size:22px">Send a proposal</h3><div class="row2">${field('Your price (USD)',`<input name="bid" type="number" min="5" step="5" required value="${j.budget}">`,`You keep ${100-(S.meta.fees||{seller:10}).seller}% after the platform fee. Client budget ${fmt(j.budget)}.`)}${field('Delivery time (days)','<input name="days" type="number" min="1" max="180" required value="7">')}</div>${field('Cover letter','<textarea name="text" rows="5" required minlength="30" maxlength="2000" placeholder="What you will do and a similar project you finished"></textarea>','At least 30 characters.')}<div><button class="btn pri">Send proposal</button></div></form>`
   :'<p class="muted mt">This job is no longer accepting proposals.</p>';
 }else if(u){action='<p class="muted mt">Switch to a freelancer account to send a proposal.</p>'}
 else action=`<div class="panel mt" id="propose"><b>Interested?</b><p class="muted">Sign in as a freelancer to send a proposal.</p><a class="btn pri" href="#/login/freelancer?next=${encodeURIComponent('/job/'+j.id)}">Sign in as a freelancer</a></div>`;
 const b=j.bids;
 page(wrapPage(`<a class="crumb" href="#/jobs">‹ All jobs</a><div class="grid3"><div>
  <p class="muted" style="margin:0 0 6px;font-size:14px">${esc(catName(j.category))} · Posted ${ago(j.created_at)}</p><h1 style="font-size:clamp(28px,4vw,42px)">${esc(j.title)}</h1>
  <div class="jinfo">${[['Budget',fmt(j.budget),'Fixed price'],['Experience',EXP[j.experience_level],''],['Project length',DUR[j.duration],''],['Proposals',propsLabel(j.proposals_count),j.status==='open'?'Open':j.status==='in_progress'?'In progress':'Closed']].map(([a,v,s])=>`<div><span class="muted">${a}</span><b>${esc(v)}</b>${s?`<small class="muted">${s}</small>`:''}</div>`).join('')}</div>
  <h3 class="sec" style="margin-top:28px">Description</h3><p style="font-size:18px;line-height:1.55;max-width:64ch;white-space:pre-wrap;margin-top:8px">${esc(j.description)}</p>
  <h3 class="sec">Skills and expertise</h3><div class="tags" style="margin-top:10px">${j.skills.map(s=>`<span class="tag ${hit.has(s.toLowerCase())?'hit':''}">${esc(s)}</span>`).join('')}</div>${hit.size?`<p class="muted" style="font-size:14px;margin:8px 0 0">${hit.size} of your skills match this job.</p>`:''}
  <h3 class="sec">Activity on this job</h3><div class="stat-rows wide"><div><span class="muted">Proposals</span><b>${propsLabel(j.proposals_count)}</b></div>${b?`<div><span class="muted">Average bid</span><b>${fmt(b.avg)}</b></div><div><span class="muted">Lowest bid</span><b>${fmt(b.low)}</b></div><div><span class="muted">Highest bid</span><b>${fmt(b.high)}</b></div>`:'<div><span class="muted">Bids</span><b>None yet</b></div>'}</div>
  ${action}
  <h3 class="sec">Client's recent history</h3>${pastJobsHtml(j.client_jobs)}
  <h3 class="sec">Reviews from freelancers</h3>${clientReviewsHtml(j.client_reviews,st)}
  ${j.similar.length?`<h3 class="sec">Similar jobs</h3><div class="list">${j.similar.map(jobCard).join('')}</div>`:''}</div>
  <aside style="position:sticky;top:80px;display:grid;gap:14px"><div class="pkg"><span class="muted">Budget</span><h3 style="font-size:36px">${fmt(j.budget)}</h3>${j.status==='open'&&(!u||u.role==='freelancer')&&!(j.my_proposal)?'<a class="btn pri" href="#propose" data-a="jump" data-v="propose">Apply now</a>':''}${j.my_proposal?`<span class="pill ok" style="justify-self:start">Applied · ${cap(j.my_proposal.status)}</span>`:''}</div>${clientBox(j.client,st)}</aside></div>`));
});

/* ---------- auth: separate portals for clients, freelancers and admins ---------- */
const afterAuth=()=>{const n=parseHash().q.get('next');go(n?'#'+n:S.user.role==='admin'?'#/admin':'#/dashboard')};
const PORTALS={
 client:{title:'Client sign in',lead:'Hire talent, manage orders and release payments.',demo:'helen@crewline.dev',demoLabel:'Use the demo client',alt:'freelancer',altLabel:'Freelancer? Sign in here'},
 freelancer:{title:'Freelancer sign in',lead:'Find work, manage gigs and get paid.',demo:'tomas@crewline.dev',demoLabel:'Use the demo freelancer',alt:'client',altLabel:'Client? Sign in here'},
 admin:{title:'Admin console',lead:'Restricted. Authorised Crewline staff only.',demo:'admin@crewline.dev',pw:'admin12345',demoLabel:'Use the demo admin',alt:null}};
const portalCard=(href,title,sub)=>`<a class="portal" href="${href}"><b>${title}</b><span>${sub}</span><i aria-hidden="true">›</i></a>`;
R('/login',async()=>{
 if(S.user){go(S.user.role==='admin'?'#/admin':'#/dashboard');return}
 page(`<div class="authbox"><h1>Sign in</h1><p class="muted center" style="margin:0 0 28px">Choose your account type.</p>
 <div class="portals">${portalCard('#/login/client','I am a client','Hire freelancers and manage projects')}${portalCard('#/login/freelancer','I am a freelancer','Find work and manage gigs')}</div>
 <p class="center muted mt">New to Crewline? <a href="#/signup">Create an account</a></p><p class="center muted" style="font-size:14px"><a href="#/admin/login">Staff sign in</a></p></div>`);
});
function loginPage(portal){
 if(S.user){go(S.user.role==='admin'?'#/admin':'#/dashboard');return}
 const P=PORTALS[portal],adm=portal==='admin';
 page(`<div class="authbox ${adm?'adminbox':''}"><span class="pill ${adm?'adm':''}" style="justify-self:center">${adm?'Super admin':portal==='client'?'Client portal':'Freelancer portal'}</span><h1 style="margin-top:14px">${P.title}</h1><p class="muted center" style="margin:0 0 28px">${P.lead}</p>
 <form class="form" data-form="login" data-portal="${portal}">${field('Email','<input name="email" type="email" required autocomplete="email">')}${field('Password','<input name="password" type="password" required autocomplete="current-password">')}<button class="btn pri">Sign in</button></form>
 <div class="demo"><b>Demo access</b><p class="muted" style="margin:4px 0 12px">Sample data is loaded.${adm?'':' The password for every demo account is <code>password123</code>.'}</p><button class="btn ghost sm" data-a="demo" data-v="${P.demo}" data-portal="${portal}" data-pw="${P.pw||'password123'}">${P.demoLabel}</button></div>
 <p class="center muted mt">${adm?'<a href="#/">Back to Crewline</a>':`${P.alt?`<a href="#/login/${P.alt}">${P.altLabel}</a> · `:''}<a href="#/signup/${portal}">Create an account</a>`}</p></div>`);
}
R('/login/:portal',async({portal})=>{if(portal==='admin'){go('#/admin/login');return}if(!PORTALS[portal]){go('#/login');return}loginPage(portal)});
R('/admin/login',async()=>loginPage('admin'));
R('/signup',async(m,q)=>{
 if(S.user){go('#/dashboard');return}
 if(q.get('role'))return go('#/signup/'+(q.get('role')==='freelancer'?'freelancer':'client'));
 page(`<div class="authbox"><h1>Join Crewline</h1><p class="muted center" style="margin:0 0 28px">Free to join. Choose how you will use it.</p>
 <div class="portals">${portalCard('#/signup/client','I want to hire','Post jobs and buy gigs')}${portalCard('#/signup/freelancer','I want to work','Sell gigs and send proposals')}</div>
 <p class="center muted mt">Already have an account? <a href="#/login">Sign in</a></p></div>`);
});
R('/signup/:role',async({role})=>{
 if(S.user){go('#/dashboard');return}
 if(!['client','freelancer'].includes(role)){go('#/signup');return}
 const cl=role==='client';
 page(`<div class="authbox"><span class="pill" style="justify-self:center">${cl?'Client account':'Freelancer account'}</span><h1 style="margin-top:14px">${cl?'Start hiring':'Start earning'}</h1><p class="muted center" style="margin:0 0 28px">${cl?'Post a job in two minutes and compare proposals.':'Build a profile, sell gigs and answer open jobs.'}</p>
 <form class="form" data-form="signup" data-role="${role}">${field('Full name','<input name="name" required minlength="2" autocomplete="name">')}${field('Email','<input name="email" type="email" required autocomplete="email">')}${field('Password','<input name="password" type="password" required minlength="8" autocomplete="new-password">','At least 8 characters.')}
 ${field(cl?'Company (optional)':'Professional headline (optional)',`<input name="extra" maxlength="140" placeholder="${cl?'Acme Inc.':'Brand designer'}">`)}<button class="btn pri">Create ${cl?'client':'freelancer'} account</button></form>
 <p class="center muted mt">Already registered? <a href="#/login/${role}">Sign in</a> · <a href="#/signup/${cl?'freelancer':'client'}">${cl?'I want to work':'I want to hire'}</a></p></div>`);
});

/* ---------- chat: live over WebSocket, with optimistic sends, typing, read receipts ---------- */
const chats={};let activeConv=null;
const dayLabel=iso=>{const d=new Date(iso),t=new Date(),y=new Date(Date.now()-864e5);const same=(a,b)=>a.toDateString()===b.toDateString();return same(d,t)?'Today':same(d,y)?'Yesterday':d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:d.getFullYear()===t.getFullYear()?undefined:'numeric'})};
const avp=u=>`<span class="avwrap">${av(u)}<i class="pdot ${(S.online[u.id]??u.online)?'on':''}" data-u="${u.id}"></i></span>`;
function mountChat(el,convId,onOther){
 const me=S.user.id;activeConv=convId;let msgs=[],hasMore=false,newest=0,typingT=null,lastTyping=0,busy=false;
 el.innerHTML=`<div class="thread-b" tabindex="0" aria-live="polite"><button class="link more" hidden data-a="chat-more">Load earlier messages</button><div class="msgbox"></div></div><div class="typing" hidden aria-live="polite"><span></span><span></span><span></span> Typing…</div><form class="composer" data-form="msg" data-c="${convId}"><textarea name="body" rows="1" placeholder="Write a message…" maxlength="4000" aria-label="Message"></textarea><button class="btn pri sm" type="submit" aria-label="Send">Send</button></form>`;
 const box=$('.thread-b',el),list=$('.msgbox',el),more=$('.more',el),typ=$('.typing',el),ta=$('textarea',el);
 const lastMine=()=>{for(let i=msgs.length-1;i>=0;i--)if(msgs[i].sender_id===me)return msgs[i];return null};
 function render(stick){
  const keep=box.scrollHeight-box.scrollTop;let html='',day='';const lm=lastMine();
  for(const m of msgs){
   const d=dayLabel(m.created_at);if(d!==day){html+=`<div class="sep"><span>${d}</span></div>`;day=d}
   const mine=m.sender_id===me;
   let st='';if(mine&&m===lm)st=m.failed?`<button class="link" data-a="chat-retry" data-v="${esc(m.cid)}">Not sent · Retry</button>`:m.pending?'Sending…':m.read?'Seen':'Delivered';
   html+=`<div class="bub ${mine?'me':''} ${m.pending?'pend':''} ${m.failed?'fail':''}" data-id="${m.id||''}"><div class="bub-t">${esc(m.body)}</div><small>${clock(m.created_at)}</small></div>${st?`<div class="rcpt ${mine?'me':''}">${st}</div>`:''}`}
  list.innerHTML=msgs.length?html:'<div class="chat-empty"><b>No messages yet</b><p class="muted">Say hello to start the conversation.</p></div>';
  more.hidden=!hasMore;
  if(stick)box.scrollTop=box.scrollHeight;else box.scrollTop=box.scrollHeight-keep}
 const nearBottom=()=>box.scrollHeight-box.scrollTop-box.clientHeight<120;
 function add(m,cid){
  if(msgs.some(x=>x.id&&x.id===m.id))return;
  const i=cid?msgs.findIndex(x=>x.cid===cid):-1;
  const stick=nearBottom()||m.sender_id===me;
  if(i>=0)msgs[i]=m;else msgs.push(m);
  newest=Math.max(newest,m.id||0);render(stick)}
 async function load(before){
  if(busy)return;busy=true;
  try{const r=await api(`/conversations/${convId}/messages?limit=40${before?'&before_id='+before:''}`);
   if(before){msgs=[...r.messages,...msgs];hasMore=r.has_more;render(false)}
   else{msgs=r.messages;hasMore=r.has_more;newest=msgs.length?msgs[msgs.length-1].id:0;render(true);if(onOther)onOther(r.other);refreshUnread()}}
  catch(e){list.innerHTML=`<p class="muted center" style="margin:40px 0">${esc(e.message)}</p>`}finally{busy=false}}
 function send(body,retryCid){
  body=body.trim();if(!body)return;
  const cid=retryCid||'c'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
  let m=retryCid&&msgs.find(x=>x.cid===cid);
  if(m){m.failed=false;m.pending=true}else{m={cid,sender_id:me,body,created_at:new Date().toISOString(),pending:true,read:false};msgs.push(m)}
  render(true);
  const fail=()=>{const x=msgs.find(y=>y.cid===cid&&y.pending);if(x){x.failed=true;x.pending=false;render(false)}};
  if(rt.send({t:'send',conv:convId,body:m.body,cid}))setTimeout(fail,9000);
  else api(`/conversations/${convId}/messages`,{method:'POST',body:{body:m.body}}).then(r=>add(r,cid)).catch(fail)}
 chats[convId]={send,retry:cid=>{const m=msgs.find(x=>x.cid===cid);if(m)send(m.body,cid)},more:()=>msgs.length&&load(msgs[0].id)};
 ta.addEventListener('input',()=>{ta.style.height='auto';ta.style.height=Math.min(ta.scrollHeight,140)+'px';const n=Date.now();if(n-lastTyping>2000&&ta.value.trim()){lastTyping=n;rt.send({t:'typing',conv:convId})}});
 onRt(d=>{
  if(d.t==='message'&&d.conv===convId){add(d.message,d.cid);if(d.message.sender_id!==me){typ.hidden=true;if(!document.hidden)rt.send({t:'read',conv:convId})}return true}
  if(d.t==='typing'&&d.conv===convId){typ.hidden=false;if(nearBottom())box.scrollTop=box.scrollHeight;clearTimeout(typingT);typingT=setTimeout(()=>typ.hidden=true,3200);return true}
  if(d.t==='read'&&d.conv===convId){let ch=false;msgs.forEach(m=>{if(m.sender_id===me&&m.id&&m.id<=d.upto&&!m.read){m.read=true;ch=true}});if(ch)render(nearBottom());return true}
  return false});
 every(async()=>{if(rt.ok)return;try{const r=await api(`/conversations/${convId}/messages?after_id=${newest}`);r.messages.forEach(m=>add(m))}catch(e){}},5000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&document.body.contains(el))rt.send({t:'read',conv:convId})});
 load();
}

/* ---------- app shell components (dashboards, admin, settings) ---------- */
const IC={
 overview:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
 orders:'<path d="M21 8l-9-5-9 5v8l9 5 9-5V8z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
 jobs:'<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18"/>',
 wallet:'<path d="M3 7a2 2 0 0 1 2-2h13v4"/><path d="M3 7v11a2 2 0 0 0 2 2h15V9H5a2 2 0 0 1-2-2z"/><circle cx="16.5" cy="14.5" r="1"/>',
 proposals:'<path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/>',
 gigs:'<path d="M12 2l9 5-9 5-9-5 9-5z"/><path d="M3 12l9 5 9-5M3 17l9 5 9-5"/>',
 messages:'<path d="M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-5.4A8 8 0 1 1 21 12z"/>',
 bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
 profile:'<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
 settings:'<path d="M4 6h8M16 6h4M4 12h2M10 12h10M4 18h10M18 18h2"/><circle cx="14" cy="6" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="16" cy="18" r="2"/>',
 signout:'<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/>',
 users:'<circle cx="9" cy="8" r="3.5"/><path d="M2 21a7 7 0 0 1 14 0"/><path d="M17 4.5a3.5 3.5 0 0 1 0 7M22 21a7 7 0 0 0-4-6.3"/>',
 disputes:'<path d="M12 3l10 18H2L12 3z"/><path d="M12 10v5M12 18h.01"/>',
 money:'<circle cx="12" cy="12" r="9"/><path d="M14.5 9a2.5 2.5 0 0 0-2.5-1.5c-1.4 0-2.5.8-2.5 2s1 1.7 2.5 2 2.5.8 2.5 2-1.1 2-2.5 2A2.7 2.7 0 0 1 9.5 15M12 6v2M12 16v2"/>',
 announce:'<path d="M3 11v2a1 1 0 0 0 1 1h3l8 4V6L7 10H4a1 1 0 0 0-1 1z"/><path d="M19 9a4 4 0 0 1 0 6"/>',
 logs:'<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
 inbox:'<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5h13L22 12v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6l3.5-7z"/>',
 check:'<path d="M5 12l5 5 9-10"/>',
 star:'<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3z"/>'};
const icon=n=>`<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[n]||''}</svg>`;
const BADGE={funded:['info','Funded'],in_progress:['info','In progress'],revision:['warn','Revision'],delivered:['accent','Delivered'],released:['ok','Completed'],cancelled:['','Cancelled'],disputed:['warn','Disputed'],pending:['info','Pending'],accepted:['ok','Accepted'],rejected:['','Declined'],withdrawn:['','Withdrawn'],open:['ok','Open'],closed:['','Closed'],active:['ok','Active'],suspended:['warn','Suspended'],deposit:['ok','Deposit'],escrow_hold:['info','Escrow'],refund:['accent','Refund'],earning:['ok','Earning'],withdrawal:['','Withdrawal']};
const badge=s=>{const[c,l]=BADGE[s]||['',cap(s)];return `<span class="bd ${c}"><i></i>${l}</span>`};
const stat=(label,value,sub,ic)=>`<div class="stat2"><div class="stat2-h"><span>${label}</span>${ic?`<i class="stat2-i">${icon(ic)}</i>`:''}</div><b>${value}</b>${sub?`<small>${sub}</small>`:''}</div>`;
const kpi=(l,v,s,ic)=>stat(l,v,s,ic);
const card=(title,body,action='')=>`<section class="card2"><header class="card2-h"><h3>${title}</h3>${action}</header>${body}</section>`;
const esState=(ic,msg,cta='')=>`<div class="es"><i>${icon(ic)}</i><p>${msg}</p>${cta}</div>`;
const pageHead=(title,sub,actions='')=>`<div class="ph"><div><h1>${title}</h1>${sub?`<p class="sub">${sub}</p>`:''}</div>${actions?`<div class="ph-a">${actions}</div>`:''}</div>`;
const dtable=(heads,rows,emptyHtml)=>rows.length?`<div class="tw"><table class="dt"><thead><tr>${heads.map(h=>Array.isArray(h)?`<th class="${h[1]}">${h[0]}</th>`:`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`:emptyHtml;
function sideNav(u,groups){
 return `<nav class="snav" aria-label="Navigation"><div class="snav-user">${av(u)}<span><b>${esc(u.name)}</b><small>${u.role==='client'?'Client':u.role==='freelancer'?'Freelancer':'Super admin'}</small></span></div>${groups.map(g=>`<div class="snav-g">${g.title?`<span class="snav-t">${g.title}</span>`:''}${g.items.map(i=>i.action?`<button class="snav-i" data-a="${i.action}">${icon(i.icon)}<span>${i.label}</span></button>`:`<a class="snav-i" href="${i.href}" ${i.cur?'aria-current="page"':''}>${icon(i.icon)}<span>${i.label}</span>${i.badge?`<em>${i.badge}</em>`:''}</a>`).join('')}</div>`).join('')}</nav>`}
const dueIn=o=>{const d=Math.ceil((new Date(o.created_at).getTime()+o.delivery_days*864e5-Date.now())/864e5);return d<0?`<span class="late">${-d}d overdue</span>`:d===0?'Due today':`Due in ${d}d`};
const orderRow=(o,compact)=>{const cl=S.user.role==='client',i=stepIdx[o.status],live=['funded','in_progress','revision'].includes(o.status);
 return `<tr class="lnk" data-href="#/order/${o.id}"><td><a class="t-main" href="#/order/${o.id}">${esc(o.title)}</a><small>${cl?'Freelancer':'Client'}: ${esc(o.counterpart.name)}</small></td><td>${badge(o.disputed?'disputed':o.status)}</td>${compact?'':`<td class="hide-s"><span class="seg4" aria-hidden="true">${[0,1,2,3].map(k=>`<i class="${o.status!=='cancelled'&&k<=i?'on':''}"></i>`).join('')}</span></td>`}<td class="num">${fmt(o.amount)}</td><td class="num hide-s">${live?dueIn(o):ago(o.created_at)}</td></tr>`};
const ORDER_HEADS=['Order','Status',['Progress','hide-s'],['Amount','num'],['Due','num hide-s']];
const ORDER_HEADS_COMPACT=['Order','Status',['Amount','num'],['Due','num hide-s']];
const bars=series=>{const max=Math.max(1,...series.map(s=>s.amount));
 return `<div class="bars" role="img" aria-label="Last six months">${series.map(s=>`<div class="bar-c ${s.amount?'':'zero'}" title="${s.label}: ${fmt(s.amount)}"><span class="bar-v">${s.amount?kfmt(s.amount):''}</span><div class="bar-area"><i style="height:${s.amount?Math.max(4,Math.round(s.amount/max*100)):3}%"></i></div><em>${s.label}</em></div>`).join('')}</div>`};
const checklist=(items,title='Get started')=>{const done=items.filter(i=>i[0]).length,pct=Math.round(done/items.length*100);
 return card(title,`<div class="card2-b" style="padding-bottom:14px"><div class="between" style="font-size:13px"><span class="muted">${done} of ${items.length} complete</span><b>${pct}%</b></div><div class="meter" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><i style="width:${pct}%"></i></div></div><div class="ck">${items.map(([ok,label,href])=>ok?`<div class="done"><span class="tick">${icon('check')}</span><span>${label}</span></div>`:`<a href="#${href}"><span class="tick"></span><span>${label}</span><span class="go">Start ›</span></a>`).join('')}</div>`)};
const todo=rows=>rows.length?`<div class="todo">${rows.map(([n,l,h])=>`<a href="#${h}"><span>${l}</span><b>${n}</b></a>`).join('')}</div>`:esState('check','You are all caught up. Nothing needs your attention.');
const jobRow=j=>{const st=j.client_stats||{};return `<div class="jr"><div style="min-width:0"><a class="t-main" href="#/job/${j.id}">${esc(j.title)}</a><small>${esc(EXP[j.experience_level]||'')} · ${esc(DUR[j.duration]||'')} · ${ago(j.created_at)}${st.verified?' · <span class="vf">✓ Verified</span>':''}</small><div class="tags">${j.skills.slice(0,3).map(s=>`<span class="tag ${(j.match||[]).map(x=>x.toLowerCase()).includes(s.toLowerCase())?'hit':''}">${esc(s)}</span>`).join('')}</div></div><div class="r"><b>${fmt(j.budget)}</b><a class="btn sm" href="#/job/${j.id}">View</a></div></div>`};

/* ---------- dashboard ---------- */
const memberNav=tab=>{const cl=S.user.role==='client';
 const w=[['overview','Overview','overview'],['orders',cl?'Orders':'Active work','orders']];
 if(cl)w.push(['jobs','My jobs','jobs']);else w.push(['proposals','Proposals','proposals'],['gigs','My gigs','gigs']);
 w.push(['wallet',cl?'Wallet':'Earnings','wallet']);
 return [{title:'Workspace',items:w.map(([t,l,i])=>({href:'#/dashboard'+(t==='overview'?'':'/'+t),label:l,icon:i,cur:tab===t}))},
  {title:'Communicate',items:[{href:'#/messages',label:'Messages',icon:'messages',badge:S.unread},{href:'#/notifications',label:'Notifications',icon:'bell',badge:S.notes.unread}]},
  {title:'Account',items:[{href:'#/profile',label:'Profile',icon:'profile'},{href:'#/settings/account',label:'Settings',icon:'settings'},{action:'signout',label:'Sign out',icon:'signout'}]}]};
const dashShell=(tab,inner)=>`<div class="wrap dash"><aside>${sideNav(S.user,memberNav(tab))}</aside><section style="min-width:0">${inner}</section></div>`;
async function overviewFreelancer(){
 const u=S.user,p=u.profile||{};
 const[d,act,props,rec]=await Promise.all([api('/dashboard'),api('/me/orders?status=active'),api('/me/proposals'),api('/jobs/search?sort=best_match&limit=4').catch(()=>({items:[]}))]);
 const items=[[!!p.headline,'Add a professional headline','/profile'],[(p.bio||'').length>=80,'Write your overview (80+ characters)','/profile'],[(p.skills||[]).length>=3,'List at least 3 skills','/profile'],[+p.hourly_rate>0,'Set your hourly rate','/profile'],[(p.experience||[]).length>0,'Add work experience','/profile'],[(p.portfolio||[]).length>0,'Add a portfolio project','/profile'],[d.gigs>0,'Publish your first gig','/dashboard/gigs'],[props.length>0||d.jobs_completed>0,'Send your first proposal','/jobs']];
 const total=d.series.reduce((a,s)=>a+s.amount,0);
 const needs=[[d.to_deliver,'Orders to work on','/dashboard/orders?f=active'],[d.pending_proposals,'Proposals awaiting a reply','/dashboard/proposals'],[d.disputes,'Orders under dispute review','/dashboard/orders?f=active']].filter(x=>x[0]);
 return pageHead('Overview',`Welcome back, ${esc(u.name.split(' ')[0])}. Here is where your work stands.`,'<a class="btn pri" href="#/jobs">Find jobs</a><a class="btn" href="#/dashboard/gigs">Manage gigs</a>')+
 `<div class="stats-grid">${stat('Available balance',fmt(d.balance),'Ready to withdraw','wallet')}${stat('Pending earnings',fmt(d.pending_earnings),`${act.length} active order${act.length===1?'':'s'}`,'orders')}${stat('Total earned',fmt(d.total_earned),`${d.jobs_completed} completed job${d.jobs_completed===1?'':'s'}`,'money')}${stat('Rating',d.rating?d.rating.toFixed(1)+' ★':'No rating yet',`${d.reviews_count} review${d.reviews_count===1?'':'s'}`,'star')}</div>
 <div class="g2"><div class="stack">
  ${card('Earnings','<div class="card2-b">'+bars(d.series)+'</div>',`<span class="muted" style="font-size:13px">Last 6 months · ${fmt(total)}</span>`)}
  ${card('Active work',dtable(ORDER_HEADS_COMPACT,act.slice(0,5).map(o=>orderRow(o,true)),esState('orders','No active work yet. Send proposals or publish a gig to land your first order.','<a class="btn sm pri" href="#/jobs">Find jobs</a>')),act.length?'<a href="#/dashboard/orders">View all</a>':'')}
 </div><div class="stack">
  ${items.every(i=>i[0])?card('Profile','<div class="card2-b"><p style="margin:0 0 12px">Your profile is complete. Clients can see everything they need to hire you.</p><a class="btn sm" href="#/freelancer/'+u.id+'">View public profile</a></div>'):checklist(items)}
  ${card('Needs your attention',todo(needs))}
 </div></div>
 <div class="two" style="margin-top:0;align-items:start">${card('Jobs matched to your skills',rec.items.length?rec.items.map(jobRow).join(''):esState('jobs','Add skills to your profile to see matched jobs.','<a class="btn sm" href="#/profile">Edit profile</a>'),'<a href="#/jobs?sort=best_match">See all</a>')}
 ${card('Recent proposals',dtable(['Job',['Bid','num'],'Status'],props.slice(0,5).map(x=>`<tr class="lnk" data-href="#/job/${x.job.id}"><td><a class="t-main" href="#/job/${x.job.id}">${esc(x.job.title)}</a><small>${esc(x.job.client.company||x.job.client.name)} · ${ago(x.created_at)}</small></td><td class="num">${fmt(x.bid)}</td><td>${badge(x.status)}</td></tr>`),esState('proposals','You have not sent a proposal yet.','<a class="btn sm pri" href="#/jobs">Browse jobs</a>')),props.length?'<a href="#/dashboard/proposals">View all</a>':'')}</div>`;
}
async function overviewClient(){
 const u=S.user,p=u.profile||{};
 const[d,act,jobs,top]=await Promise.all([api('/dashboard'),api('/me/orders?status=active'),api('/me/jobs'),api('/freelancers?limit=4').catch(()=>[])]);
 const open=jobs.filter(j=>j.status==='open');
 const items=[[!!p.company&&(p.bio||'').length>=40,'Complete your company profile','/profile'],[d.balance>0||d.total_spent>0||d.in_escrow>0,'Add funds to your wallet','/dashboard/wallet'],[jobs.length>0,'Post your first job','/post-job'],[d.active_orders>0||d.total_spent>0,'Hire a freelancer','/gigs']];
 const total=d.series.reduce((a,s)=>a+s.amount,0);
 const needs=[[d.awaiting_review,'Deliveries awaiting your review','/dashboard/orders?f=active'],[d.pending_proposals,'New proposals to review','/dashboard/jobs'],[d.disputes,'Orders under dispute review','/dashboard/orders?f=active']].filter(x=>x[0]);
 return pageHead('Overview',`Welcome back, ${esc(u.name.split(' ')[0])}. Here is what is happening with your hiring.`,'<a class="btn pri" href="#/post-job">Post a job</a><a class="btn" href="#/gigs">Browse gigs</a>')+
 `<div class="stats-grid">${stat('Wallet balance',fmt(d.balance),'Available to fund orders','wallet')}${stat('In escrow',fmt(d.in_escrow),`${d.active_orders} active order${d.active_orders===1?'':'s'}`,'orders')}${stat('Total spent',fmt(d.total_spent),'Released to freelancers','money')}${stat('Open jobs',d.open_jobs,`${d.pending_proposals} proposal${d.pending_proposals===1?'':'s'} to review`,'jobs')}</div>
 <div class="g2"><div class="stack">
  ${card('Spend','<div class="card2-b">'+bars(d.series)+'</div>',`<span class="muted" style="font-size:13px">Last 6 months · ${fmt(total)}</span>`)}
  ${card('Active orders',dtable(ORDER_HEADS_COMPACT,act.slice(0,5).map(o=>orderRow(o,true)),esState('orders','No active orders. Hire from a gig or accept a proposal to get started.','<a class="btn sm pri" href="#/gigs">Browse gigs</a>')),act.length?'<a href="#/dashboard/orders">View all</a>':'')}
 </div><div class="stack">
  ${items.every(i=>i[0])?card('Setup','<div class="card2-b"><p style="margin:0">Your account is fully set up.</p></div>'):checklist(items)}
  ${card('Needs your attention',todo(needs))}
 </div></div>
 <div class="two" style="margin-top:0;align-items:start">${card('Your open jobs',dtable(['Job',['Proposals','num'],['Budget','num hide-s']],open.slice(0,5).map(j=>`<tr class="lnk" data-href="#/job/${j.id}"><td><a class="t-main" href="#/job/${j.id}">${esc(j.title)}</a><small>Posted ${ago(j.created_at)}</small></td><td class="num">${j.proposals_count}</td><td class="num hide-s">${fmt(j.budget)}</td></tr>`),esState('jobs','You have no open jobs. Post one and freelancers will send proposals.','<a class="btn sm pri" href="#/post-job">Post a job</a>')),open.length?'<a href="#/dashboard/jobs">View all</a>':'')}
 ${card('Top rated freelancers',top.length?top.map(f=>`<div class="who-row">${av(f)}<div class="grow"><a href="#/freelancer/${f.id}">${esc(f.name)}</a><small>${esc(f.headline)}</small></div><span class="rt">★ ${f.rating.toFixed(1)}</span></div>`).join(''):esState('profile','No freelancers to show yet.'),'<a href="#/freelancers">Browse</a>')}</div>`;
}
async function dash(tab,q){
 const u=S.user,cl=u.role==='client';if(!DASH_TABS[u.role].includes(tab))tab='overview';let inner='';
 if(tab==='overview')inner=cl?await overviewClient():await overviewFreelancer();
 else if(tab==='orders'){
  const f=q.get('f')||'active',rows=await api('/me/orders'+(f==='all'?'':'?status='+f));
  inner=pageHead(cl?'Orders':'Active work',cl?'Everything you have hired and paid for.':'Orders from clients, funded in escrow.')+`<div class="tabs2">${[['active','Active'],['released','Completed'],['all','All']].map(([v,l])=>`<a href="#/dashboard/orders?f=${v}" ${f===v?'aria-current="page"':''}>${l}</a>`).join('')}</div>`+card(`${rows.length} order${rows.length===1?'':'s'}`,dtable(ORDER_HEADS.map((h,i)=>i===4?[f==='active'?'Due':'Ordered','num hide-s']:h),rows.map(o=>orderRow(o)),esState('orders','No orders here yet.',cl?'<a class="btn sm pri" href="#/gigs">Browse gigs</a>':'<a class="btn sm pri" href="#/jobs">Find jobs</a>')));
 }else if(tab==='jobs'){
  const rows=await api('/me/jobs');
  inner=pageHead('My jobs','Jobs you have posted and the proposals they received.','<a class="btn pri" href="#/post-job">Post a job</a>')+card(`${rows.length} job${rows.length===1?'':'s'}`,dtable(['Job',['Budget','num'],['Proposals','num'],'Status',['Posted','num hide-s'],''],rows.map(j=>`<tr class="lnk" data-href="#/job/${j.id}"><td><a class="t-main" href="#/job/${j.id}">${esc(j.title)}</a><small>${esc(catName(j.category))} · ${esc(EXP[j.experience_level]||'')}</small></td><td class="num">${fmt(j.budget)}</td><td class="num">${j.proposals_count}</td><td>${badge(j.status)}</td><td class="num hide-s">${ago(j.created_at)}</td><td class="num">${j.status==='open'?`<button class="link" data-a="closejob" data-v="${j.id}">Close</button>`:''}</td></tr>`),esState('jobs','You have not posted a job yet.','<a class="btn sm pri" href="#/post-job">Post a job</a>')));
 }else if(tab==='proposals'){
  const rows=await api('/me/proposals');
  inner=pageHead('Proposals','Track every proposal you have sent.','<a class="btn pri" href="#/jobs">Find jobs</a>')+card(`${rows.length} proposal${rows.length===1?'':'s'}`,dtable(['Job','Client',['Bid','num'],['Delivery','num hide-s'],'Status',['Sent','num hide-s'],''],rows.map(x=>`<tr class="lnk" data-href="#/job/${x.job.id}"><td><a class="t-main" href="#/job/${x.job.id}">${esc(x.job.title)}</a></td><td>${esc(x.job.client.company||x.job.client.name)}</td><td class="num">${fmt(x.bid)}</td><td class="num hide-s">${x.delivery_days} days</td><td>${badge(x.status)}</td><td class="num hide-s">${ago(x.created_at)}</td><td class="num">${x.status==='pending'?`<button class="link" data-a="withdraw" data-v="${x.id}">Withdraw</button>`:''}</td></tr>`),esState('proposals','You have not sent a proposal yet.','<a class="btn sm pri" href="#/jobs">Browse jobs</a>')));
 }else if(tab==='gigs'){
  const rows=await api('/me/gigs');
  inner=pageHead('My gigs','Fixed-price services clients can buy from you.','<button class="btn pri" data-a="newgig">Create a gig</button>')+card(`${rows.length} gig${rows.length===1?'':'s'}`,dtable(['Gig','Category',['Starting at','num'],['Delivery','num hide-s'],'Status',''],rows.map(g=>`<tr><td><a class="t-main" href="#/gig/${g.id}">${esc(g.title)}</a></td><td>${esc(catName(g.category))}</td><td class="num">${fmt(g.from_price)}</td><td class="num hide-s">${g.min_days} days</td><td>${badge('active')}</td><td class="num"><a href="#/gig/${g.id}">View</a> &nbsp; <button class="link" style="color:var(--coral)" data-a="delgig" data-v="${g.id}">Remove</button></td></tr>`),esState('gigs','No gigs yet. Publish a gig so clients can buy from you directly.','<button class="btn sm pri" data-a="newgig">Create a gig</button>')));
 }else if(tab==='wallet'){
  const[w,d]=await Promise.all([api('/wallet'),api('/dashboard')]);
  const kind=t=>badge(t.kind);
  inner=pageHead(cl?'Wallet':'Earnings',cl?'Fund orders and review every transaction.':'Withdraw earnings and review your payment history.')+
  `<div class="stats-grid" style="grid-template-columns:repeat(3,minmax(0,1fr))">${cl?stat('Balance',fmt(w.balance),'Available to fund orders','wallet')+stat('In escrow',fmt(d.in_escrow),'Held until you approve','orders')+stat('Total spent',fmt(d.total_spent),'Released to freelancers','money'):stat('Available to withdraw',fmt(w.balance),'In your wallet','wallet')+stat('Pending earnings',fmt(d.pending_earnings),'Released on client approval','orders')+stat('Total earned',fmt(d.total_earned),'After platform fees','money')}</div>
  <div style="margin-bottom:20px">${card(cl?'Add funds':'Withdraw',`<div class="card2-b">${cl?`<p class="muted" style="margin:0 0 12px">Demo top-up. In production this runs through Stripe Checkout.</p><div class="row">${[100,500,1000].map(v=>`<button class="btn" data-a="topup" data-v="${v}">Add ${fmt(v)}</button>`).join('')}</div>`:`<p class="muted" style="margin:0 0 12px">Demo payout. In production this runs through Stripe Connect.</p><form class="row" data-form="withdraw"><input class="pin" name="amount" type="number" min="1" step="1" required placeholder="Amount in USD" style="width:180px" aria-label="Amount"><button class="btn pri">Withdraw</button></form>`}</div>`)}</div>`+
  card('Transactions',dtable(['Date','Description','Type',['Amount','num']],w.transactions.map(t=>`<tr><td>${ago(t.created_at)}</td><td>${esc(t.description)}</td><td>${kind(t)}</td><td class="num ${t.amount>0?'pos':''}">${t.amount>0?'+':'−'}${fmt(Math.abs(t.amount))}</td></tr>`),esState('wallet','No transactions yet.')));
 }
 page(dashShell(tab,inner));
}
const DASH_TABS={client:['overview','orders','jobs','wallet'],freelancer:['overview','orders','proposals','gigs','wallet']};
R('/dashboard',(m,q)=>dash('overview',q),{auth:true,role:'member'});
R('/dashboard/:tab',({tab},q)=>dash(tab,q),{auth:true,role:'member'});

/* ---------- order page ---------- */
let curOrder=null,curJob=null;
function orderHtml(o){
 const cl=S.user.id===o.client.id,cp=o.counterpart,first=cp.name.split(' ')[0];
 const live=['funded','in_progress','delivered','revision'].includes(o.status);
 let acts='',hint='';
 if(!o.disputed){
  if(cl){
   if(o.status==='delivered')acts=`<button class="btn pri" data-a="release">Approve and release ${fmt(o.amount)}</button><button class="btn ghost" data-a="revdlg">Request revision</button>`;
   else if(o.status==='funded')acts=`<button class="btn ghost" data-a="cancel">Cancel and refund</button>`,hint=`Waiting for ${esc(first)} to start.`;
   else if(o.status==='in_progress'||o.status==='revision')hint=`${esc(first)} is working on it.`;
  }else{
   if(o.status==='funded')acts=`<button class="btn pri" data-a="start">Start work</button>`;
   else if(o.status==='in_progress'||o.status==='revision')acts=`<button class="btn pri" data-a="deliverdlg">Deliver work</button>`;
   else if(o.status==='delivered')hint=`Waiting for ${esc(first)} to review.`;
  }
 }
 const banner=o.disputed?`<div class="banner warn mt" role="status"><b>Under review by Crewline support</b><p style="margin:4px 0 0">${o.dispute_by===S.user.id?'You opened':esc(cp.name)+' opened'} a dispute: ${esc(o.dispute_reason)}</p><p class="muted" style="margin:6px 0 0;font-size:14px">Work and payment are paused until support decides. You can keep messaging in the thread.</p></div>`
  :o.resolution_note?`<div class="banner mt"><b>Support decision</b><p style="margin:4px 0 0">${esc(o.resolution_note)}</p></div>`:'';
 let review='';
 if(o.status==='released'){
  if(o.review)review=`<div class="panel mt"><b>Review</b><p class="stars" style="margin:6px 0">${'★'.repeat(o.review.rating)}</p><p style="margin:0">${esc(o.review.comment)}</p></div>`;
  else if(cl)review=`<form class="panel mt form" data-form="review" style="gap:12px"><b>Rate ${esc(first)}</b><div class="starpick" role="group" aria-label="Rating">${[1,2,3,4,5].map(i=>`<button type="button" class="on" data-a="star" data-v="${i}" aria-label="${i} stars">★</button>`).join('')}</div><input type="hidden" name="rating" value="5">${field('Comment','<textarea name="comment" rows="3" maxlength="1000" placeholder="How was it working together?"></textarea>')}<div><button class="btn pri sm">Submit review</button></div></form>`;
 }
 if(o.status==='released'&&!cl){review+=o.client_review?`<div class="panel mt"><b>Your review of ${esc(cp.name)}</b><p class="stars" style="margin:6px 0">${'★'.repeat(o.client_review.rating)}</p><p style="margin:0">${esc(o.client_review.comment)}</p></div>`
   :`<form class="panel mt form" data-form="clientreview" style="gap:12px"><b>Rate ${esc(cp.company||cp.name)} as a client</b><p class="muted" style="margin:0;font-size:14px">Your review appears on their job posts and profile to help other freelancers.</p><div class="starpick" role="group" aria-label="Rating">${[1,2,3,4,5].map(i=>`<button type="button" class="on" data-a="star" data-v="${i}" aria-label="${i} stars">★</button>`).join('')}</div><input type="hidden" name="rating" value="5">${field('Comment','<textarea name="comment" rows="3" maxlength="1000" placeholder="Was the brief clear? Was feedback and payment prompt?"></textarea>')}<div><button class="btn pri sm">Submit review</button></div></form>`}
 const sp=Math.round((o.seller_fee_pct||0)*1000)/10,row=(a,b)=>`<div><span class="muted">${a}</span><span>${b}</span></div>`;
 const net=Math.round(o.amount*(1-(o.seller_fee_pct||0))*100)/100,bp=o.amount?Math.round(o.buyer_fee/o.amount*1000)/10:0;
 return `<div class="wrap page2"><a class="crumb" href="#/dashboard/orders">‹ Orders</a>
 <div class="between"><div><h1 style="font-size:22px">${esc(o.title)}</h1><p class="muted" style="margin:6px 0 0">${cl?'Freelancer':'Client'}: <a href="#/${cl?'freelancer':'client'}/${cp.id}">${esc(cp.name)}</a>${cp.company?' · '+esc(cp.company):''} · Order #${o.id}</p></div>${badge(o.disputed?'disputed':o.status)}</div>
 ${banner}
 <div class="ord-grid mt"><div>${o.status==='cancelled'?'':`<div class="panel">${stepper(o)}</div>`}
 <div class="panel mt sum">${row('Order amount',fmt(o.amount))}${cl?row(`Service fee (${bp}%)`,fmt(o.buyer_fee)):row(`Platform fee (${sp}%)`,'−'+fmt(o.amount-net))}<div class="tot"><span>${cl?'Total paid':'You receive'}</span><span>${fmt(cl?o.amount+o.buyer_fee:net)}</span></div>${row('Delivery time',o.delivery_days+' days')}${row('Ordered',ago(o.created_at))}${o.delivered_at?row('Delivered',ago(o.delivered_at)):''}${o.released_at?row('Released',ago(o.released_at)):''}</div>
 ${acts||hint?`<div class="acts mt">${acts}${hint?`<span class="muted">${hint}</span>`:''}</div>`:''}
 ${live&&!o.disputed?`<p class="mt" style="font-size:14px"><button class="link" data-a="disputedlg">Report a problem with this order</button></p>`:''}${review}</div>
 <div class="chatbox"><div class="thread-h"><span class="th-who">${avp(cp)}<div class="th-meta"><b>${esc(cp.name)}</b>${cp.company?`<span class="muted">${esc(cp.company)}</span>`:''}</div></span></div><div id="chat" style="display:flex;flex-direction:column;flex:1;min-height:0"></div></div></div></div>`}
async function loadOrder(id){
 clearTimers();const o=await api('/orders/'+id);curOrder=o;page(orderHtml(o));mountChat($('#chat'),o.conversation_id);
}
R('/order/:id',({id})=>loadOrder(id),{auth:true,role:'member'});
const orderCall=async(path,body,msg)=>{try{await api(`/orders/${curOrder.id}/${path}`,{method:'POST',body});closeDlg();if(msg)toast(msg);await loadOrder(curOrder.id);refreshUnread()}catch(e){toast(e.message)}};

/* ---------- messages ---------- */
const convSnippet=c=>{if(!c.last_message)return'No messages yet';const you=c.last_message.sender_id===S.user.id?'You: ':'';const line=c.last_message.body.split('\n')[0];return you+line};
const convItem=(c,id)=>{const on=String(c.id)===String(id),when=c.last_message?ago(c.last_message.created_at):'';
 return `<a class="conv ${c.unread?'unread':''}" href="#/messages/${c.id}" ${on?'aria-current="true"':''} data-name="${esc((c.other.name+' '+(c.other.company||'')).toLowerCase())}">${avp(c.other)}<span class="txt"><b><span>${esc(c.other.name)}</span><em>${when}</em></b>${c.other.company?`<span class="co">${esc(c.other.company)}</span>`:''}<small>${esc(convSnippet(c))}</small></span>${c.unread?`<span class="badge">${c.unread}</span>`:''}</a>`};
const convList=(cs,id)=>cs.length?cs.map(c=>convItem(c,id)).join(''):'<div class="chat-empty"><b>No conversations yet</b><p class="muted">Message someone from their profile, or send a proposal to start one.</p></div>';
const threadHead=o=>{if(!o)return'';const role=o.role==='client'?(o.company||'Client'):(o.headline||'Freelancer');
 const href=o.role==='client'?`#/client/${o.id}`:`#/freelancer/${o.id}`;
 return `${avp(o)}<div class="th-meta"><a href="${href}"><b>${esc(o.name)}</b></a><span class="muted">${esc(role)}${(S.online[o.id]??o.online)?' · Online':' · Offline'}</span></div>`};
R('/messages',async()=>{const cs=await api('/conversations');if(cs.length&&innerWidth>900){location.replace('#/messages/'+cs[0].id);return}renderMessages(cs,null)},{auth:true,role:'member'});
R('/messages/:id',async({id})=>renderMessages(await api('/conversations'),id),{auth:true,role:'member'});
function renderMessages(cs,id){
 const me=id&&cs.find(c=>String(c.id)===String(id));
 const unread=cs.reduce((n,c)=>n+(c.unread||0),0);
 page(`<div class="wrap page2 msgs-page"><div class="between msgs-head"><div><h1>Messages</h1><p class="muted lead" style="margin:4px 0 0">${cs.length?`${cs.length} conversation${cs.length===1?'':'s'}${unread?` · ${unread} unread`:''}`:'Your inbox is empty.'}</p></div><span class="pill ${rt.ok?'ok':''}" id="conn">${rt.ok?'● Live':'Reconnecting…'}</span></div>
 <div class="msgs"><div class="convs ${id?'hide-m':''}"><div class="convs-s"><input type="search" data-f="cq" placeholder="Search by name or company" aria-label="Search conversations"></div><div id="convs">${convList(cs,id)}</div></div>
 <div class="thread ${id?'':'hide-m'}">${id?`<div class="thread-h"><a class="back-m link" href="#/messages" aria-label="Back to conversations">‹</a><span id="oth" class="th-who">${me?threadHead(me.other):''}</span></div><div id="chat" style="display:flex;flex-direction:column;flex:1;min-height:0"></div>`:`<div class="thread-empty"><div class="chat-empty"><b>Select a conversation</b><p class="muted">Pick someone from the list to keep chatting.</p></div></div>`}</div></div></div>`);
 onFilter=(k,v)=>{const w=v.toLowerCase().trim();$$('#convs .conv').forEach(a=>a.hidden=!!w&&!a.dataset.name.includes(w))};
 let t;const refresh=()=>{clearTimeout(t);t=setTimeout(async()=>{try{const c2=await api('/conversations');const b=$('#convs');if(b){b.innerHTML=convList(c2,id);const q=($('[data-f=cq]')||{}).value;if(q)onFilter('cq',q)}refreshUnread()}catch(e){}},250)};
 onRt(d=>{if(d.t==='message'||d.t==='read'||d.t==='unread'||d.t==='presence')refresh();return false});
 if(id)mountChat($('#chat'),+id,o=>{$('#oth').innerHTML=threadHead(o)});
 every(()=>{if(!rt.ok)refresh()},10000);
}

/* ---------- profile + post job ---------- */
function strength(u){
 const p=u.profile||{};let s=0;const miss=[];const chk=(ok,w,label)=>{if(ok)s+=w;else miss.push(label)};
 const hasPic=!!(u.avatar&&/^(https?:\/\/|\/)/i.test(u.avatar));
 if(u.role==='freelancer'){chk(hasPic,10,'Add a profile photo');chk(p.headline,12,'Add a headline');chk((p.bio||'').length>=80,18,'Write an overview of 80+ characters');chk((p.skills||[]).length>=3,12,'List at least 3 skills');chk(+p.hourly_rate>0,8,'Set your hourly rate');chk(p.location,5,'Add your location');chk((p.languages||[]).length,5,'Add the languages you speak');chk((p.experience||[]).length,15,'Add work experience');chk((p.portfolio||[]).length,15,'Add a portfolio item')}
 else{chk(hasPic,10,'Add a profile photo');chk(p.company,20,'Add your company');chk((p.bio||'').length>=40,20,'Describe your company');chk(p.location,15,'Add a location');chk(p.website,15,'Add your website');chk(p.industry,20,'Add your industry')}
 return{pct:Math.min(100,s),miss}}
const meter=u=>{const m=strength(u);return `<div class="panel pe-side"><div class="between"><b>Profile strength</b><span class="pill ${m.pct===100?'ok':''}">${m.pct}%</span></div><div class="meter" role="progressbar" aria-valuenow="${m.pct}" aria-valuemin="0" aria-valuemax="100"><i style="width:${m.pct}%"></i></div>${m.miss.length?`<p class="muted" style="margin:10px 0 0;font-size:14px">Next: ${esc(m.miss[0])}</p>`:'<p class="muted" style="margin:10px 0 0;font-size:14px">Your profile is complete.</p>'}</div>`};
const expRow=(e={})=>`<div class="exp-row panel"><div class="row2"><input class="pin x-role" placeholder="Role" value="${esc(e.role||'')}" maxlength="100" aria-label="Role"><input class="pin x-company" placeholder="Company" value="${esc(e.company||'')}" maxlength="100" aria-label="Company"></div><input class="pin x-period" placeholder="Period, for example 2021 to 2024" value="${esc(e.period||'')}" maxlength="60" aria-label="Period"><textarea class="pin x-desc" rows="2" placeholder="What you did" maxlength="500" aria-label="Description">${esc(e.description||'')}</textarea><button type="button" class="link rm" data-a="delrow">Remove</button></div>`;
const portRow=(p={})=>`<div class="port-row panel"><div class="row2"><input class="pin x-title" placeholder="Project title" value="${esc(p.title||'')}" maxlength="100" aria-label="Project title"><input class="pin x-link" placeholder="Link (https://…)" value="${esc(p.link||'')}" maxlength="300" aria-label="Link"></div><textarea class="pin x-desc" rows="2" placeholder="What it is and what you did" maxlength="400" aria-label="Description">${esc(p.description||'')}</textarea><button type="button" class="link rm" data-a="delrow">Remove</button></div>`;
const pePreview=u=>{const p=u.profile||{},fl=u.role==='freelancer';
 return `<div class="pe-prev" id="peprev"><div class="pe-prev-top">${av(u,true)}<div><b id="pename">${esc(u.name)}</b><span class="muted" id="pesub">${esc(fl?p.headline:(p.company||'Client account'))}</span>${fl&&p.location?`<small class="muted">${esc(p.location)}</small>`:''}</div></div>
  ${fl?`<div class="pe-prev-meta"><span>${p.hourly_rate?fmt(p.hourly_rate)+'/hr':'Rate not set'}</span><span>${(p.skills||[]).length} skill${(p.skills||[]).length===1?'':'s'}</span><span class="pill ${p.available?'ok':''}">${p.available?'Available':'Not available'}</span></div>`:`<div class="pe-prev-meta"><span>${esc(p.industry||'No industry')}</span><span>${esc(p.location||'No location')}</span></div>`}
  <a class="btn ghost sm" href="#/${fl?'freelancer':'client'}/${u.id}">View public profile</a></div>`};
R('/profile',async()=>{
 if(S.user.role==='admin'){go('#/settings/account');return}
 const u=await api('/auth/me');S.user=u;const p=u.profile,fl=u.role==='freelancer';
 const identity=`<div class="pe-id panel"><div class="pe-id-row" id="peid">${av(u,true)}<div class="grow">${field('Name',`<input name="name" required minlength="2" maxlength="80" value="${esc(u.name)}" data-pe="name">`)}
  ${field('Profile photo URL',`<input name="avatar" maxlength="300" placeholder="/assets/avatars/you.jpg" value="${esc(u.avatar||'')}" data-pe="avatar">`,'A local path or https image. Leave blank for initials.')}
  <div class="field"><label>Avatar colour</label><div class="swatches" role="radiogroup" aria-label="Avatar colour">${[...new Set([u.color,...SWATCH].filter(Boolean))].map(c=>`<label><input type="radio" name="color" value="${c}" ${u.color===c?'checked':''} data-pe="color"><span style="background:${c}"></span></label>`).join('')}</div></div>
  </div></div></div>`;
 page(wrapPage(`<div class="between"><div><h1>Your profile</h1><p class="muted lead">${fl?'This is what clients see on your public page.':'This is what freelancers see when you post a job.'}</p></div><a class="btn ghost" href="#/${fl?'freelancer':'client'}/${u.id}">View public profile</a></div>
 <div class="pe-grid mt"><form class="form pe-main" data-form="profile">${identity}
  <div class="panel pe-sec"><h3>Basics</h3>
  ${fl?`${field('Headline',`<input name="headline" maxlength="140" value="${esc(p.headline)}" placeholder="Brand designer" data-pe="headline">`,'One line that says what you do best.')}<div class="row2">${field('Main category',`<select name="category">${S.meta.categories.map(c=>`<option value="${c.id}" ${p.category===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}</select>`)}${field('Hourly rate (USD)',`<input name="hourly_rate" type="number" min="0" max="1000" step="1" value="${p.hourly_rate}">`)}</div>
  <div class="row2">${field('Location',`<input name="location" maxlength="120" value="${esc(p.location)}" data-pe="location">`)}${field('Languages',`<input name="languages" value="${esc((p.languages||[]).join(', '))}" placeholder="English, Spanish">`,'Separate with commas.')}</div>
  ${field('Skills',`<input name="skills" value="${esc((p.skills||[]).join(', '))}" data-pe="skills">`,'Separate with commas. Up to 15.')}`
  :`${field('Company',`<input name="company" maxlength="140" value="${esc(p.company)}" data-pe="company">`)}<div class="row2">${field('Industry',`<input name="industry" maxlength="80" value="${esc(p.industry)}" placeholder="Healthcare">`)}${field('Website',`<input name="website" maxlength="200" value="${esc(p.website)}" placeholder="https://">`)}</div>${field('Location',`<input name="location" maxlength="120" value="${esc(p.location)}" data-pe="location">`)}`}</div>
  <div class="panel pe-sec"><h3>About</h3>${field(fl?'Overview':'About your company',`<textarea name="bio" rows="5" maxlength="1500">${esc(p.bio)}</textarea>`,fl?'Explain how you work and what clients can expect.':'What freelancers should know about working with you.')}
  ${fl?`<label class="switch" style="margin-top:4px"><input type="checkbox" name="available" ${p.available?'checked':''}><span class="track" aria-hidden="true"></span><span><b>Available for new work</b><small class="muted" style="display:block">Shows on your public profile.</small></span></label>`:''}</div>
  ${fl?`<div class="panel pe-sec"><h3>Work experience</h3><div id="exp" style="display:grid;gap:10px">${(p.experience||[]).map(expRow).join('')||expRow()}</div><button type="button" class="btn ghost sm mt" data-a="addrow" data-v="exp">Add experience</button></div>
  <div class="panel pe-sec"><h3>Portfolio</h3><div id="port" style="display:grid;gap:10px">${(p.portfolio||[]).map(portRow).join('')||portRow()}</div><button type="button" class="btn ghost sm mt" data-a="addrow" data-v="port">Add project</button></div>`:''}
  <div class="row pe-save"><button class="btn pri">Save changes</button><a class="btn ghost" href="#/${fl?'freelancer':'client'}/${u.id}">Preview</a></div></form>
  <aside class="pe-aside">${pePreview(u)}${meter(u)}</aside></div>`));
},{auth:true});
function syncProfilePreview(){
 const f=$('[data-form=profile]');if(!f||!S.user)return;
 const u=S.user,p=u.profile||{},fl=u.role==='freelancer';
 const name=f.elements.name.value.trim()||u.name,avatar=String((f.elements.avatar||{}).value||'').trim(),color=(f.querySelector('input[name=color]:checked')||{}).value||u.color;
 const draft={...u,name,avatar,color,profile:{...p,headline:fl?(f.elements.headline||{}).value:p.headline,company:fl?p.company:(f.elements.company||{}).value||'',location:(f.elements.location||{}).value||'',skills:fl?list((f.elements.skills||{}).value):(p.skills||[]),hourly_rate:fl?+(f.elements.hourly_rate||{}).value||0:0,available:fl?!!(f.elements.available||{}).checked:false,industry:fl?'':(f.elements.industry||{}).value||''}};
 const box=$('#peprev');if(box)box.outerHTML=pePreview(draft);
 const id=$('#peid');if(id){const a=id.querySelector('.av');if(a)a.outerHTML=av(draft,true)}
}
R('/post-job',async()=>{
 page(wrapPage(`<h1>Post a job</h1><p class="muted lead">Describe the work. Freelancers send proposals, and you only pay once you hire one.</p>
 <form class="form panel mt" data-form="job">${field('Job title','<input name="title" required minlength="8" maxlength="160" placeholder="Build a landing page for our app">','Say what you need done, in one line.')}
 <div class="row2">${field('Category',`<select name="category">${S.meta.categories.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select>`)}${field('Fixed budget (USD)','<input name="budget" type="number" min="20" max="100000" step="5" required placeholder="500">')}</div>
 <div class="row2">${field('Experience level','<select name="experience_level"><option value="entry">Entry level</option><option value="intermediate" selected>Intermediate</option><option value="expert">Expert</option></select>')}${field('Project length','<select name="duration"><option value="week">Under 1 week</option><option value="month" selected>1 to 4 weeks</option><option value="quarter">1 to 3 months</option><option value="long">3+ months</option></select>')}</div>
 ${field('What needs to happen','<textarea name="description" rows="6" required minlength="40" maxlength="4000" placeholder="Goals, deliverables, links, deadline"></textarea>','At least 40 characters.')}${field('Skills','<input name="skills" placeholder="Figma, Next.js, copywriting">','Separate with commas.')}
 <div><button class="btn pri">Post job</button></div></form>`));
},{auth:true,role:'client'});

/* ---------- actions ---------- */
async function openCheckout(c){
 const w=await api('/wallet');pend=c;const bp=(S.meta.fees||{buyer:5}).buyer,fee=Math.round(c.price*bp)/100,tot=Math.round((c.price+fee)*100)/100,short=w.balance<tot;
 openDlg(`<h2 style="font-size:28px;margin-bottom:6px">Fund escrow</h2><p class="muted" style="margin-top:0">${esc(c.title)} with ${esc(c.who)}</p>
 <div class="sum panel" style="max-width:480px;margin:18px 0"><div><span>Price</span><span>${fmt(c.price)}</span></div><div><span>Service fee (${bp}%)</span><span>${fmt(fee)}</span></div><div class="tot"><span>Total</span><span>${fmt(tot)}</span></div><div class="muted"><span>Wallet balance</span><span>${fmt(w.balance)}</span></div></div>
 ${c.kind==='gig'?`<div class="field" style="max-width:480px;margin-bottom:16px"><label for="reqs">Requirements for ${esc(c.who.split(' ')[0])}</label><textarea id="reqs" rows="3" maxlength="2000" placeholder="Goals, links, deadlines"></textarea></div>`:''}
 <p class="muted" style="max-width:56ch">Your payment is held by Crewline. It goes to the freelancer only after you approve the delivered work.</p>
 ${short?`<p class="err" role="alert">Your wallet is ${fmt(tot-w.balance)} short.</p><button class="btn pri" data-a="topup" data-v="${Math.max(100,Math.ceil((tot-w.balance)/100)*100)}">Add ${fmt(Math.max(100,Math.ceil((tot-w.balance)/100)*100))} (demo)</button>`:`<button class="btn pri" data-a="pay">Pay ${fmt(tot)} and start</button>`}<p class="err" id="payerr" role="alert"></p>`);
}
const gate=()=>{if(!S.user){go('#/login?next='+encodeURIComponent(parseHash().path));return false}return true};
const A={
 theme(){const t=curTheme()==='dark'?'light':'dark';root.dataset.theme=t;try{localStorage.setItem('cl_theme',t)}catch(e){}header()},
 signout(){signOutLocal();go('#/')},
 close:closeDlg,
 how(d,el){$$('[data-a=how]').forEach(b=>b.setAttribute('aria-pressed',String(b===el)));$('#how').innerHTML=howHtml(d.v)},
 fcat(d){$$('[data-a=fcat]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.v===d.v)));onFilter&&onFilter(d.k,d.v,true)},
 pkg(d){cur.k=+d.v;$('#pkgbox').innerHTML=pkgHtml()},
 async checkout(){if(!gate())return;const p=cur.g.packages[cur.k];await openCheckout({kind:'gig',id:cur.g.id,tier:p.tier,price:p.price,title:`${cur.g.title} (${p.tier[0].toUpperCase()+p.tier.slice(1)})`,who:cur.g.freelancer.name})},
 async hire(d,el){await openCheckout({kind:'proposal',id:el.dataset.v,price:+el.dataset.bid,title:curJob?curJob.title:'Job',who:el.dataset.name})},
 async pay(d,el){el.disabled=true;try{const r=pend.kind==='gig'?await api(`/gigs/${pend.id}/orders`,{method:'POST',body:{tier:pend.tier,requirements:($('#reqs')||{}).value||''}}):await api(`/proposals/${pend.id}/accept`,{method:'POST'});closeDlg();toast('Escrow funded. The freelancer can start now.');go('#/order/'+r.order_id)}catch(e){$('#payerr').textContent=e.message;el.disabled=false}},
 async topup(d){try{await api('/wallet/deposit',{method:'POST',body:{amount:+d.v}});toast(`Added ${fmt(+d.v)} of demo funds.`);if(dlg.open&&pend)await openCheckout(pend);else route()}catch(e){toast(e.message)}},
 async msg(d){if(!gate())return;try{const r=await api('/conversations',{method:'POST',body:{user_id:+d.v}});go('#/messages/'+r.id)}catch(e){toast(e.message)}},
 async withdraw(d){try{await api(`/proposals/${d.v}/withdraw`,{method:'POST'});toast('Proposal withdrawn.');route()}catch(e){toast(e.message)}},
 async closejob(d){try{await api(`/jobs/${d.v}/close`,{method:'POST'});toast('Job closed.');route()}catch(e){toast(e.message)}},
 newgig(){openDlg(`<h2 style="font-size:28px;margin-bottom:14px">Create a gig</h2><form class="form" data-form="gig" style="max-width:none">
  ${field('Gig title','<input name="title" required minlength="10" maxlength="160" placeholder="I will design a landing page for your product">')}
  <div class="row2">${field('Category',`<select name="category">${S.meta.categories.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select>`)}${field('Tags','<input name="tags" placeholder="figma, landing page">','Separate with commas.')}</div>
  ${field('Description','<textarea name="description" rows="4" required minlength="30" maxlength="3000" placeholder="What the buyer gets and how you work"></textarea>')}
  ${field('Cover image URL','<input name="image" maxlength="300" placeholder="/assets/gigs/logo.jpg">','Optional. A local path or https image.')}
  ${field('What is included','<textarea name="features" rows="3" placeholder="One item per line. Basic gets the first, Standard the first two, Premium all."></textarea>')}
  <div class="row3">${[['Basic',50,3],['Standard',100,5],['Premium',200,8]].map(([n,p,d],i)=>`<div class="field"><label>${n}</label><input name="p${i}" type="number" min="5" required value="${p}" aria-label="${n} price in USD"><input name="d${i}" type="number" min="1" max="120" required value="${d}" aria-label="${n} delivery days"><small>USD · days</small></div>`).join('')}</div>
  <div><button class="btn pri">Publish gig</button></div></form>`)},
 async delgig(d){try{await api('/gigs/'+d.v,{method:'DELETE'});toast('Gig removed.');route()}catch(e){toast(e.message)}},
 async start(){await orderCall('start',undefined,'Work started.')},
 deliverdlg(){openDlg(`<h2 style="font-size:26px;margin-bottom:8px">Deliver work</h2><form class="form" data-form="deliver">${field('Note to the client','<textarea name="note" rows="4" maxlength="1500" placeholder="What is included, links to files"></textarea>')}<div><button class="btn pri">Deliver</button></div></form>`)},
 revdlg(){openDlg(`<h2 style="font-size:26px;margin-bottom:8px">Request a revision</h2><form class="form" data-form="revise">${field('What should change?','<textarea name="note" rows="4" maxlength="1500" required placeholder="Be specific so the freelancer can fix it in one go"></textarea>')}<div><button class="btn pri">Send request</button></div></form>`)},
 release(){openDlg(`<h2 style="font-size:26px;margin-bottom:8px">Release payment?</h2><p class="muted" style="max-width:46ch">${fmt(curOrder.amount)} will be paid to ${esc(curOrder.counterpart.name)}. This cannot be undone.</p><div class="row mt"><button class="btn pri" data-a="release-go">Release ${fmt(curOrder.amount)}</button><button class="btn ghost" data-a="close">Not yet</button></div>`)},
 async 'release-go'(){await orderCall('release',undefined,'Payment released. Leave a review below.')},
 cancel(){openDlg(`<h2 style="font-size:26px;margin-bottom:8px">Cancel this order?</h2><p class="muted" style="max-width:46ch">You will get the full amount back in your wallet.</p><div class="row mt"><button class="btn pri" data-a="cancel-go">Cancel and refund</button><button class="btn ghost" data-a="close">Keep order</button></div>`)},
 async 'cancel-go'(){await orderCall('cancel',undefined,'Order cancelled and refunded.')},
 star(d){const form=$('[data-form=review]');form.elements.rating.value=d.v;$$('.starpick button',form).forEach((b,i)=>b.classList.toggle('on',i<+d.v))},
 async demo(d){try{setSession(await api('/auth/login',{method:'POST',body:{email:d.v,password:'password123'}}));afterAuth()}catch(e){toast(e.message)}}
};
document.addEventListener('click',e=>{
 const tr=e.target.closest('tr[data-href]');if(tr&&!e.target.closest('a,button,input,select,label')){go(tr.dataset.href);return}
 if(!e.target.closest('.menu'))$$('.menu[open]').forEach(d=>d.removeAttribute('open'));
 const t=e.target.closest('[data-a]');if(!t||t.disabled)return;const f=A[t.dataset.a];if(f){if(t.tagName==='A')e.preventDefault();f(t.dataset,t)}});
document.addEventListener('input',e=>{const k=e.target.dataset&&e.target.dataset.f;if(k&&onFilter)onFilter(k,e.target.value);
 if(e.target.closest&&e.target.closest('[data-form=profile]')&&e.target.matches('[data-pe],input[name=hourly_rate],input[name=available],textarea[name=bio]'))syncProfilePreview()});
document.addEventListener('change',e=>{if(e.target.closest&&e.target.closest('[data-form=profile]')&&e.target.matches('[data-pe],input[name=color],input[name=available]'))syncProfilePreview()});

/* ---------- forms ---------- */
const list=s=>String(s||'').split(',').map(x=>x.trim()).filter(Boolean);
const FORMS={
 search(f){go('#/gigs?q='+encodeURIComponent(f.q.value.trim()))},
 async login(f,el){await submitting(el,async()=>{setSession(await api('/auth/login',{method:'POST',body:{email:f.email.value,password:f.password.value}}));afterAuth()})},
 async signup(f,el){await submitting(el,async()=>{const role=f.role.value,x=f.extra.value.trim();
  setSession(await api('/auth/register',{method:'POST',body:{email:f.email.value,password:f.password.value,name:f.name.value,role,...(role==='client'?{company:x}:{headline:x})}}));afterAuth()})},
 async proposal(f,el){await submitting(el,async()=>{await api(`/jobs/${el.dataset.j}/proposals`,{method:'POST',body:{bid:+f.bid.value,delivery_days:+f.days.value,cover_letter:f.text.value}});toast('Proposal sent. Track it in your dashboard.');route()})},
 async job(f,el){await submitting(el,async()=>{const r=await api('/jobs',{method:'POST',body:{title:f.title.value,category:f.category.value,description:f.description.value,skills:list(f.skills.value),budget:+f.budget.value}});toast('Job posted. Proposals will appear on the job page.');go('#/job/'+r.id)})},
 async gig(f,el){await submitting(el,async()=>{const feats=f.features.value.split('\n').map(x=>x.trim()).filter(Boolean),revs=[1,3,-1],pk=i=>({price:+f['p'+i].value,delivery_days:+f['d'+i].value,revisions:revs[i],features:i===0?feats.slice(0,1):i===1?feats.slice(0,2):feats});
  await api('/gigs',{method:'POST',body:{title:f.title.value,category:f.category.value,description:f.description.value,tags:list(f.tags.value),image:f.image.value.trim(),basic:pk(0),standard:pk(1),premium:pk(2)}});closeDlg();toast('Gig published.');route()})},
 async msg(f,el){const body=f.body.value.trim();if(!body)return;f.body.value='';try{await api(`/conversations/${el.dataset.c}/messages`,{method:'POST',body:{body}});chats[el.dataset.c]&&chats[el.dataset.c]()}catch(e){toast(e.message);f.body.value=body}},
 async deliver(f,el){await orderCall('deliver',{note:f.note.value},'Delivered. The client can now review it.')},
 async revise(f,el){await orderCall('revise',{note:f.note.value},'Revision requested.')},
 async review(f,el){await submitting(el,async()=>{await api(`/orders/${curOrder.id}/review`,{method:'POST',body:{rating:+f.rating.value,comment:f.comment.value}});toast('Thanks for the review.');await loadOrder(curOrder.id)})},
 async profile(f,el){await submitting(el,async()=>{const fl=S.user.role==='freelancer';
  const body=fl?{name:f.name.value,headline:f.headline.value,category:f.category.value,hourly_rate:+f.hourly_rate.value,location:f.location.value,skills:list(f.skills.value),bio:f.bio.value,available:f.available.checked}:{name:f.name.value,company:f.company.value,location:f.location.value,bio:f.bio.value};
  S.user=await api('/me/profile',{method:'PUT',body});header();toast('Profile saved.')})},
 async withdraw(f,el){await submitting(el,async()=>{await api('/wallet/withdraw',{method:'POST',body:{amount:+f.amount.value}});toast('Withdrawal requested (demo).');route()})}
};
document.addEventListener('submit',e=>{const el=e.target,h=FORMS[el.dataset.form];if(!h)return;e.preventDefault();h(el.elements,el)});

/* ---------- notifications page ---------- */
R('/notifications',async(m,q)=>{
 const only=q.get('f')==='unread';
 const r=await api('/notifications?limit=60'+(only?'&unread=true':''));
 S.notes.unread=r.unread;updateBadges();
 const draw=items=>items.length?`<div class="panel notelist">${items.map(noteHtml).join('')}</div>`:empty(only?'No unread notifications.':'Nothing here yet. Updates about orders, proposals and payments will show up here.');
 page(wrapPage(`<div class="between"><div><h1>Notifications</h1><p class="muted lead" id="ncount">${r.unread} unread</p></div><div class="row"><a class="chip" href="#/notifications" aria-pressed="${!only}">All</a><a class="chip" href="#/notifications?f=unread" aria-pressed="${only}">Unread</a><button class="btn ghost sm" data-a="notes-read">Mark all read</button></div></div><div class="mt" id="nlist">${draw(r.items)}</div>`));
 onRt(d=>{if(d.t==='notification'){api('/notifications?limit=60'+(only?'&unread=true':'')).then(x=>{const l=$('#nlist');if(l){l.innerHTML=draw(x.items);$('#ncount').textContent=x.unread+' unread'}}).catch(()=>{})}return false});
},{auth:true});

/* ---------- settings (account, security, notifications, privacy, billing) ---------- */
const SET={client:[['account','Account'],['security','Security'],['notifications','Notifications'],['billing','Billing']],freelancer:[['account','Account'],['security','Security'],['notifications','Notifications'],['privacy','Privacy'],['payouts','Payouts']],admin:[['account','Account'],['security','Security']]};
const toggle=(name,label,on,hint)=>`<label class="switch"><input type="checkbox" name="${name}" ${on?'checked':''}><span class="track" aria-hidden="true"></span><span><b>${label}</b>${hint?`<small class="muted" style="display:block">${hint}</small>`:''}</span></label>`;
R('/settings',async()=>go('#/settings/account'),{auth:true});
R('/settings/:tab',async({tab})=>{
 const u=await api('/auth/me');S.user=u;header();const tabs=SET[u.role];
 if(!tabs.some(t=>t[0]===tab)){go('#/settings/account');return}
 const pr=u.notify_prefs||{};let inner='';
 if(tab==='account')inner=`<h1>Account</h1><p class="muted" style="margin:0">Member since ${new Date(u.created_at).toLocaleDateString('en-US',{month:'long',year:'numeric'})}.</p>
  <form class="form panel mt" data-form="account">${field('Full name',`<input name="name" required minlength="2" maxlength="80" value="${esc(u.name)}">`)}${field('Email',`<input name="email" type="email" required value="${esc(u.email)}">`,'You sign in with this address.')}
  ${field('Profile photo URL',`<input name="avatar" maxlength="300" placeholder="/assets/avatars/you.jpg" value="${esc(u.avatar||'')}">`,'A local path or https image. Leave blank to use initials.')}
  <div class="field"><label>Avatar colour</label><div class="swatches" role="radiogroup" aria-label="Avatar colour">${SWATCH.map(c=>`<label><input type="radio" name="color" value="${c}" ${u.color===c?'checked':''}><span style="background:${c}"></span></label>`).join('')}</div></div>
  <div class="row"><button class="btn pri">Save changes</button>${u.role!=='admin'?`<a class="btn ghost" href="#/profile">Edit profile</a>`:''}</div></form>`;
 else if(tab==='security')inner=`<h1>Security</h1><form class="form panel mt" data-form="password"><h3 style="font-size:20px">Change password</h3>${field('Current password','<input name="current" type="password" required autocomplete="current-password">')}${field('New password','<input name="new" type="password" required minlength="8" autocomplete="new-password">','At least 8 characters.')}${field('Confirm new password','<input name="confirm" type="password" required minlength="8" autocomplete="new-password">')}<div><button class="btn pri">Update password</button></div></form>
  <div class="panel mt"><h3 style="font-size:20px">This device</h3><p class="muted" style="margin:6px 0 14px">You are signed in as ${esc(u.email)}.</p><button class="btn ghost" data-a="signout">Sign out</button></div>
  ${u.role!=='admin'?`<form class="form panel mt" data-form="deactivate"><h3 style="font-size:20px;color:var(--coral)">Close account</h3><p class="muted" style="margin:0">This hides your profile and gigs and signs you out everywhere. You must finish or cancel active orders first.</p>${field('Confirm with your password','<input name="password" type="password" required autocomplete="current-password">')}<div><button class="btn" style="background:var(--coral);color:#fff">Close my account</button></div></form>`:''}`;
 else if(tab==='notifications')inner=`<h1>Notifications</h1><p class="muted" style="margin:0">Choose what appears in your notification bell. Disputes and account alerts are always on.</p><form class="form panel mt" data-form="prefs">${toggle('orders','Orders and payments',pr.orders!==false,'New orders, deliveries, revisions, payouts and reviews')}${toggle('proposals','Proposals and hiring',pr.proposals!==false,'Proposals on your jobs and the outcome of yours')}${toggle('messages','Message alerts',pr.messages!==false,'A pop-up when someone writes while you are elsewhere on the site')}${toggle('announcements','Announcements',pr.announcements!==false,'Product updates and notices from Crewline')}<div><button class="btn pri">Save preferences</button></div></form>`;
 else if(tab==='privacy'){const p=u.profile;inner=`<h1>Privacy</h1><form class="form panel mt" data-form="privacy">${toggle('visible','Public profile',p.visible,'When off, clients cannot find or open your profile page. Your existing orders are not affected.')}${toggle('available','Available for new work',p.available,'Shows an availability badge on your profile.')}<div><button class="btn pri">Save</button></div></form>`}
 else if(tab==='billing'){const w=await api('/wallet');inner=`<h1>Billing</h1><div class="kpis" style="grid-template-columns:1fr 1fr">${kpi('Wallet balance',fmt(w.balance))}${kpi('Service fee',(S.meta.fees||{buyer:5}).buyer+'%','charged on top of each order')}</div><div class="panel mt"><p style="margin:0 0 12px">Add funds, review transactions and see what is held in escrow.</p><a class="btn pri" href="#/dashboard/wallet">Open wallet</a></div><p class="muted mt">Card payments are simulated in this build. In production, funding runs through Stripe Checkout.</p>`}
 else if(tab==='payouts'){const w=await api('/wallet');inner=`<h1>Payouts</h1><div class="kpis" style="grid-template-columns:1fr 1fr">${kpi('Available to withdraw',fmt(w.balance))}${kpi('Platform fee',(S.meta.fees||{seller:10}).seller+'%','taken from each completed order')}</div><div class="panel mt"><p style="margin:0 0 12px">Withdraw your earnings and review your payment history.</p><a class="btn pri" href="#/dashboard/wallet">Open earnings</a></div><p class="muted mt">Bank payouts are simulated in this build. In production, payouts run through Stripe Connect.</p>`}
 const back=u.role==='admin'?{href:'#/admin',label:'Back to admin console',icon:'overview'}:{href:'#/dashboard',label:'Back to dashboard',icon:'overview'};
 const sicon={account:'profile',security:'settings',notifications:'bell',privacy:'users',billing:'wallet',payouts:'wallet'};
 page(`<div class="wrap dash"><aside>${sideNav(u,[{title:'Settings',items:tabs.map(([t,l])=>({href:'#/settings/'+t,label:l,icon:sicon[t]||'settings',cur:t===tab}))},{title:'',items:[back]}])}</aside><section style="min-width:0">${inner}</section></div>`);
},{auth:true});

/* ---------- admin console ---------- */
const ADM=[['','Overview'],['users','Users'],['disputes','Disputes'],['orders','Orders'],['gigs','Gigs'],['jobs','Jobs'],['money','Money'],['announce','Announcements'],['platform','Platform settings'],['logs','Activity log']];
let admMore=null;
function adminShell(tab,inner){
 const it=(t,l,i,extra={})=>({href:'#/admin'+(t?'/'+t:''),label:l,icon:i,cur:tab===t,...extra});
 const groups=[{title:'Marketplace',items:[it('','Overview','overview'),it('users','Users','users'),it('orders','Orders','orders'),it('gigs','Gigs','gigs'),it('jobs','Jobs','jobs')]},
  {title:'Trust and money',items:[it('disputes','Disputes','disputes',{badge:S.adminDisputes||0}),it('money','Money','money'),it('platform','Platform settings','settings')]},
  {title:'Operations',items:[it('announce','Announcements','announce'),it('logs','Activity log','logs'),{href:'#/settings/account',label:'Account settings',icon:'profile'},{action:'signout',label:'Sign out',icon:'signout'}]}];
 return `<div class="wrap dash"><aside>${sideNav(S.user,groups)}</aside><section style="min-width:0">${inner}</section></div>`}
const tbl=(heads,rows,empty_)=>rows.length?`<div class="tw"><table class="table rows"><thead><tr>${heads.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`:empty(empty_||'Nothing to show.');
const sPill=s=>`<span class="pill ${s==='released'||s==='open'||s==='active'?'ok':s==='cancelled'||s==='suspended'||s==='closed'?'warn':''}">${esc(String(s).replace('_',' '))}</span>`;
function barChart(series,key,fmtv){
 const W=640,H=150,pad=8,max=Math.max(1,...series.map(x=>x[key])),bw=(W-pad*2)/series.length;
 return `<svg viewBox="0 0 ${W} ${H+26}" class="chart" role="img" aria-label="${key} per day over the last 30 days">${series.map((x,i)=>{const h=Math.round(x[key]/max*H);return `<rect x="${(pad+i*bw+2).toFixed(1)}" y="${H-h}" width="${Math.max(2,bw-4).toFixed(1)}" height="${h||1}" rx="3" style="fill:var(--accent);opacity:${x[key]?1:.25}"><title>${x.date}: ${fmtv(x[key])}</title></rect>`}).join('')}<text x="${pad}" y="${H+20}" class="ct">${series[0].date.slice(5)}</text><text x="${W-pad}" y="${H+20}" text-anchor="end" class="ct">${series[series.length-1].date.slice(5)}</text></svg>`}
R('/admin',async()=>{
 const s=await api('/admin/stats');S.adminDisputes=s.orders.disputed;
 page(adminShell('',`<h1>Overview</h1><p class="muted" style="margin:0">Marketplace health at a glance.</p>
 <div class="kpis">${kpi('Gross volume',fmt(s.gmv),'completed orders')}${kpi('Platform revenue',fmt(s.revenue),'fees on completed orders')}${kpi('Held in escrow',fmt(s.escrow_held))}${kpi('Live orders',s.orders.live)}</div>
 <div class="kpis">${kpi('Users',s.users.total,`${s.users.clients} clients · ${s.users.freelancers} freelancers`)}${kpi('New this week',s.users.new_7d)}${kpi('Open jobs',s.open_jobs,`${s.gigs} active gigs`)}${kpi('Open disputes',s.orders.disputed,s.users.suspended+' suspended accounts')}</div>
 <div class="two"><div class="panel"><b>Completed volume, last 30 days</b>${barChart(s.series,'gmv',v=>fmt(v))}</div><div class="panel"><b>New sign-ups, last 30 days</b>${barChart(s.series,'signups',v=>v+' sign-ups')}</div></div>
 <h3 class="sec">Disputes waiting</h3><div class="list">${s.disputes.length?s.disputes.map(o=>`<article class="order"><div class="between"><div><b>${esc(o.title)}</b><br><span class="muted">${esc(o.client.name)} vs ${esc(o.freelancer.name)} · ${fmt(o.amount)} · opened ${ago(o.dispute_opened_at)}</span></div><button class="btn pri sm" data-a="adm-resolve" data-v="${o.id}">Review</button></div><p style="margin:0">${esc(o.dispute_reason)}</p></article>`).join(''):empty('No open disputes.')}</div>
 <h3 class="sec">Newest members</h3>${tbl(['Name','Role','Details'],s.recent_users.map(u=>`<tr data-a="adm-user" data-v="${u.id}"><td><span class="row">${av(u)}${esc(u.name)}</span></td><td>${u.role}</td><td>${esc(u.headline||u.company||'')}</td></tr>`))}`));
},{auth:true,role:'admin'});

R('/admin/:tab',async({tab})=>{
 const fn=ADMIN_PAGES[tab];if(!fn){go('#/admin');return}
 await fn(tab);
},{auth:true,role:'admin'});
const ADMIN_PAGES={
 async users(tab){
  const st={q:'',role:'',status:''};let items=[],total=0,t;
  page(adminShell(tab,`<h1>Users</h1><div class="toolbar2"><input type="search" data-f="q" placeholder="Search by name or email" aria-label="Search users"><select data-f="role" class="sel" aria-label="Role"><option value="">All roles</option><option value="client">Clients</option><option value="freelancer">Freelancers</option><option value="admin">Admins</option></select><select data-f="status" class="sel" aria-label="Status"><option value="">Any status</option><option value="active">Active</option><option value="suspended">Suspended</option></select></div><p class="muted" id="ucount" style="font-size:14px"></p><div id="ures"></div>`));
  const draw=()=>{$('#ucount').textContent=`${total} user${total===1?'':'s'}`;$('#ures').innerHTML=tbl(['User','Email','Role','Status','Orders','Balance','Last seen'],items.map(u=>`<tr data-a="adm-user" data-v="${u.id}" tabindex="0"><td><span class="row">${av(u)}${esc(u.name)}</span></td><td>${esc(u.email)}</td><td>${u.role}</td><td>${sPill(u.is_active?'active':'suspended')}</td><td>${u.orders}</td><td>${fmt(u.balance)}</td><td>${u.last_login_at?ago(u.last_login_at):'Never'}</td></tr>`),'No users match.')+(items.length<total?'<p class="center mt"><button class="btn ghost" data-a="adm-more">Load more</button></p>':'')};
  const load=async append=>{const p=new URLSearchParams({limit:25,offset:append?items.length:0});['q','role','status'].forEach(k=>st[k]&&p.set(k,st[k]));const r=await api('/admin/users?'+p);items=append?[...items,...r.items]:r.items;total=r.total;draw()};
  onFilter=(k,v)=>{st[k]=v;clearTimeout(t);t=setTimeout(()=>load(false).catch(e=>toast(e.message)),k==='q'?250:0)};
  admMore=()=>load(true);await load(false)},
 async disputes(tab){
  const rows=await api('/admin/orders?disputed=true');S.adminDisputes=rows.length;
  page(adminShell(tab,`<h1>Disputes</h1><p class="muted" style="margin:0">Payment is frozen on these orders until you decide.</p><div class="list">${rows.length?rows.map(o=>`<article class="order"><div class="top"><div><h3 style="font-size:19px">${esc(o.title)}</h3><span class="muted">${esc(o.client.name)} (client) vs ${esc(o.freelancer.name)} (freelancer) · ${fmt(o.amount)} in escrow</span></div><span class="pill warn">${esc(o.status.replace('_',' '))}</span></div><div class="banner"><b>${o.dispute_by===o.client.id?esc(o.client.name):esc(o.freelancer.name)} reported:</b><p style="margin:4px 0 0">${esc(o.dispute_reason)}</p><small class="muted">Opened ${ago(o.dispute_opened_at)}</small></div><div class="acts"><button class="btn pri sm" data-a="adm-resolve" data-v="${o.id}">Decide</button></div></article>`).join(''):empty('No open disputes. Nice.')}</div>`))},
 async orders(tab){
  const st={status:'',q:''};let t;
  page(adminShell(tab,`<h1>Orders</h1><div class="toolbar2"><input type="search" data-f="q" placeholder="Search by title" aria-label="Search orders"><select data-f="status" class="sel" aria-label="Status"><option value="">Any status</option>${['funded','in_progress','delivered','revision','released','cancelled'].map(s=>`<option value="${s}">${s.replace('_',' ')}</option>`).join('')}</select></div><div id="ores"></div>`));
  const load=async()=>{const p=new URLSearchParams({limit:60});Object.entries(st).forEach(([k,v])=>v&&p.set(k,v));const rows=await api('/admin/orders?'+p);
   $('#ores').innerHTML=tbl(['#','Order','Client','Freelancer','Amount','Status',''],rows.map(o=>`<tr><td>${o.id}</td><td>${esc(o.title.length>44?o.title.slice(0,44)+'…':o.title)}</td><td>${esc(o.client.name)}</td><td>${esc(o.freelancer.name)}</td><td>${fmt(o.amount)}</td><td>${o.disputed?'<span class="pill warn">disputed</span>':sPill(o.status)}</td><td>${['funded','in_progress','delivered','revision'].includes(o.status)?`<button class="link" data-a="adm-refund" data-v="${o.id}">Refund</button>`:''}</td></tr>`),'No orders match.')};
  onFilter=(k,v)=>{st[k]=v;clearTimeout(t);t=setTimeout(()=>load().catch(e=>toast(e.message)),k==='q'?250:0)};await load()},
 async gigs(tab){
  const rows=await api('/admin/gigs?limit=100');
  page(adminShell(tab,`<h1>Gigs</h1>${tbl(['Gig','Freelancer','From','Status',''],rows.map(g=>`<tr><td><a href="#/gig/${g.id}">${esc(g.title.length>56?g.title.slice(0,56)+'…':g.title)}</a></td><td>${esc(g.freelancer.name)}</td><td>${fmt(g.from_price)}</td><td>${sPill(g.active?'active':'closed')}</td><td><button class="link" data-a="adm-gig" data-v="${g.id}">${g.active?'Remove':'Restore'}</button></td></tr>`))}`))},
 async jobs(tab){
  const rows=await api('/admin/jobs?limit=100');
  page(adminShell(tab,`<h1>Jobs</h1>${tbl(['Job','Client','Budget','Status',''],rows.map(j=>`<tr><td><a href="#/job/${j.id}">${esc(j.title.length>56?j.title.slice(0,56)+'…':j.title)}</a></td><td>${esc(j.client.company||j.client.name)}</td><td>${fmt(j.budget)}</td><td>${sPill(j.status)}</td><td>${j.status!=='closed'?`<button class="link" data-a="adm-job" data-v="${j.id}">Close</button>`:''}</td></tr>`))}`))},
 async money(tab){
  const[s,rows]=await Promise.all([api('/admin/stats'),api('/admin/transactions?limit=80')]);
  page(adminShell(tab,`<h1>Money</h1><div class="kpis" style="grid-template-columns:repeat(3,1fr)">${kpi('Gross volume',fmt(s.gmv))}${kpi('Platform revenue',fmt(s.revenue))}${kpi('Held in escrow',fmt(s.escrow_held))}</div><h3 class="sec">Ledger</h3>${tbl(['When','User','Type','Description','Amount'],rows.map(t=>`<tr><td>${ago(t.created_at)}</td><td>${esc(t.user)}</td><td>${esc(t.kind.replace('_',' '))}</td><td>${esc(t.description)}</td><td class="${t.amount>0?'pos':''}" style="text-align:right">${t.amount>0?'+':'−'}${fmt(Math.abs(t.amount))}</td></tr>`))}`))},
 async announce(tab){
  page(adminShell(tab,`<h1>Announcements</h1><p class="muted" style="margin:0">Send a notification to everyone, or to one side of the marketplace.</p><form class="form panel mt" data-form="announce">${field('Title','<input name="title" required minlength="3" maxlength="120" placeholder="Scheduled maintenance on Sunday">')}${field('Message','<textarea name="body" rows="3" maxlength="380" placeholder="Optional details"></textarea>')}${field('Audience','<select name="audience"><option value="all">Everyone</option><option value="client">Clients</option><option value="freelancer">Freelancers</option></select>')}<div><button class="btn pri">Send announcement</button></div></form>`))},
 async platform(tab){
  const c=await api('/admin/settings');
  page(adminShell(tab,`<h1>Platform settings</h1><p class="muted" style="margin:0">Fees apply to new orders. Existing orders keep the rate they were created with.</p><form class="form panel mt" data-form="platform"><div class="row2">${field('Client service fee (%)',`<input name="buyer" type="number" min="0" max="30" step="0.5" required value="${c.buyer_fee_pct}">`,'Added on top of the order price.')}${field('Freelancer platform fee (%)',`<input name="seller" type="number" min="0" max="30" step="0.5" required value="${c.seller_fee_pct}">`,'Deducted when payment is released.')}</div>${toggle('signups','Allow new sign-ups',c.signups_enabled,'Turn off to pause registration. Existing users can still sign in.')}<div><button class="btn pri">Save settings</button></div></form>`))},
 async logs(tab){
  const rows=await api('/admin/logs');
  page(adminShell(tab,`<h1>Activity log</h1><p class="muted" style="margin:0">Every admin action is recorded.</p>${tbl(['When','Admin','Action','Target','Detail'],rows.map(l=>`<tr><td>${ago(l.created_at)}</td><td>${esc(l.admin)}</td><td>${esc(l.action.replace(/_/g,' '))}</td><td>${esc(l.target)}</td><td>${esc(l.detail)}</td></tr>`),'No actions recorded yet.')}`))}
};

/* ---------- extra actions + forms (portals, notifications, settings, disputes, admin) ---------- */
const markRead=async(ids,all)=>{try{const r=await api('/notifications/read',{method:'POST',body:{ids:ids||[],all:!!all}});S.notes.unread=r.unread;updateBadges()}catch(e){}};
const gather=(sel,map)=>$$(sel).map(r=>Object.fromEntries(Object.entries(map).map(([k,c])=>[k,($(c,r)||{}).value||''])));
Object.assign(A,{
 async demo(d){try{setSession(await api(`/auth/login/${d.portal}`,{method:'POST',body:{email:d.v,password:d.pw}}));afterAuth()}catch(e){toast(e.message)}},
 note(d,el){const n=S.notes.items.find(x=>String(x.id)===d.v);if(n&&!n.read){n.read=true;S.notes.unread=Math.max(0,S.notes.unread-1);updateBadges();markRead([n.id])}const b=$('#bell');if(b)b.removeAttribute('open');const h=el.getAttribute('href');if(h&&h!=='#')go(h)},
 async 'notes-read'(){S.notes.items.forEach(n=>n.read=true);S.notes.unread=0;updateBadges();await markRead([],true);if(parseHash().path==='/notifications')route()},
 'chat-more'(){const c=chats[activeConv];c&&c.more()},
 'chat-retry'(d){const c=chats[activeConv];c&&c.retry(d.v)},
 addrow(d){const box=$('#'+d.v);box.insertAdjacentHTML('beforeend',d.v==='exp'?expRow():portRow())},
 delrow(d,el){el.closest('.exp-row,.port-row').remove()},
 disputedlg(){openDlg(`<h2 style="font-size:26px;margin-bottom:8px">Report a problem</h2><p class="muted" style="max-width:52ch">Crewline support will review this order. Work and payment are paused until a decision is made.</p><form class="form" data-form="dispute">${field('What went wrong?','<textarea name="reason" rows="5" required minlength="15" maxlength="1500" placeholder="Describe the problem and what you would like to happen"></textarea>','At least 15 characters.')}<div><button class="btn pri">Open dispute</button></div></form>`)},
 'adm-more'(){admMore&&admMore()},
 async 'adm-user'(d){
  const u=await api('/admin/users/'+d.v),p=u.profile||{};
  openDlg(`<div class="row" style="gap:14px">${av(u,true)}<div><h2 style="font-size:26px">${esc(u.name)}</h2><span class="muted">${esc(u.email)}</span><br><span class="pill">${u.role}</span> ${sPill(u.is_active?'active':'suspended')}</div></div>
  <div class="kpis" style="grid-template-columns:repeat(3,1fr);margin-top:18px">${kpi('Wallet',fmt(u.balance))}${kpi('Orders',u.orders)}${kpi('Last seen',u.last_login_at?ago(u.last_login_at):'Never')}</div>
  ${p.headline||p.company?`<p class="muted" style="margin:6px 0">${esc(p.headline||p.company)}${p.location?' · '+esc(p.location):''}</p>`:''}
  ${u.suspended_reason&&!u.is_active?`<div class="banner warn"><b>Reason</b><p style="margin:4px 0 0">${esc(u.suspended_reason)}</p></div>`:''}
  ${u.orders_list.length?`<h3 class="sec" style="font-size:18px;margin-top:20px">Recent orders</h3>${u.orders_list.map(o=>`<div class="between" style="padding:6px 0;border-bottom:1px solid var(--line)"><span>${esc(o.title.slice(0,50))}</span><span>${fmt(o.amount)} ${o.disputed?'<span class="pill warn">disputed</span>':sPill(o.status)}</span></div>`).join('')}`:''}
  ${u.role!=='admin'?`<div class="mt">${u.is_active?`<form class="row" data-form="suspend" data-u="${u.id}"><input class="pin" name="reason" placeholder="Reason for suspension" maxlength="300" style="flex:1;min-width:200px" aria-label="Reason"><button class="btn sm" style="background:var(--coral);color:#fff">Suspend</button></form>`:`<button class="btn pri" data-a="adm-react" data-v="${u.id}">Reactivate account</button>`}
  <div class="row mt">${u.role==='client'?`<button class="btn ghost sm" data-a="adm-verify" data-v="${u.id}" data-on="${p.verified?'':'1'}">${p.verified?'Remove payment verification':'Mark payment verified'}</button>`:''}${u.role!=='admin'&&u.is_active?`<a class="btn ghost sm" href="#/${u.role}/${u.id}">View public profile</a>`:''}</div></div>`:''}`)},
 async 'adm-react'(d){try{await api(`/admin/users/${d.v}/reactivate`,{method:'POST'});closeDlg();toast('Account reactivated.');route()}catch(e){toast(e.message)}},
 async 'adm-verify'(d){try{await api(`/admin/users/${d.v}/verify`,{method:'POST',body:{verified:!!d.on}});closeDlg();toast('Updated.');route()}catch(e){toast(e.message)}},
 async 'adm-gig'(d){try{const r=await api(`/admin/gigs/${d.v}/toggle`,{method:'POST'});toast(r.active?'Gig restored.':'Gig removed.');route()}catch(e){toast(e.message)}},
 async 'adm-job'(d){try{await api(`/admin/jobs/${d.v}/close`,{method:'POST'});toast('Job closed.');route()}catch(e){toast(e.message)}},
 async 'adm-resolve'(d){
  const o=(await api('/admin/orders?disputed=true')).find(x=>String(x.id)===d.v);if(!o){toast('That dispute is already resolved.');route();return}
  openDlg(`<h2 style="font-size:26px;margin-bottom:6px">Decide dispute</h2><p class="muted" style="margin-top:0">${esc(o.title)} · ${fmt(o.amount)} in escrow</p><div class="banner"><b>Reported problem</b><p style="margin:4px 0 0">${esc(o.dispute_reason)}</p></div>
  <form class="form mt" data-form="resolve" data-o="${o.id}" style="max-width:none"><div class="rolepick"><label><input type="radio" name="decision" value="refund" checked><b>Refund the client</b><span>${fmt(o.amount+o.buyer_fee)} returned to ${esc(o.client.name)}</span></label><label><input type="radio" name="decision" value="release"><b>Pay the freelancer</b><span>Net of fees to ${esc(o.freelancer.name)}</span></label></div>${field('Note to both parties','<textarea name="note" rows="3" required minlength="5" maxlength="600" placeholder="Explain your decision"></textarea>')}<div><button class="btn pri">Confirm decision</button></div></form>`)},
 'adm-refund'(d){openDlg(`<h2 style="font-size:26px;margin-bottom:8px">Refund this order?</h2><p class="muted" style="max-width:48ch">The client gets the full amount back and the order is cancelled.</p><form class="form" data-form="refund" data-o="${d.v}">${field('Reason','<input name="reason" maxlength="300" placeholder="Why is this being refunded?">')}<div><button class="btn pri">Refund order</button></div></form>`)}
});
document.addEventListener('keydown',e=>{
 if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing&&e.target.matches&&e.target.matches('.composer textarea')){e.preventDefault();const f=e.target.form;f.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))}
 if((e.key==='Enter')&&e.target.matches&&e.target.matches('tr[data-a]')){e.target.click()}
});
const flash=m=>toast(m);
Object.assign(FORMS,{
 async login(f,el){await submitting(el,async()=>{setSession(await api('/auth/login/'+el.dataset.portal,{method:'POST',body:{email:f.email.value,password:f.password.value}}));afterAuth()})},
 async signup(f,el){await submitting(el,async()=>{const role=el.dataset.role,x=f.extra.value.trim();
  setSession(await api('/auth/register',{method:'POST',body:{email:f.email.value,password:f.password.value,name:f.name.value,role,...(role==='client'?{company:x}:{headline:x})}}));toast('Welcome to Crewline. Finish your profile to stand out.');afterAuth()})},
 msg(f,el){const c=chats[el.dataset.c];if(!c)return;const v=f.body.value;if(!v.trim())return;f.body.value='';f.body.style.height='auto';c.send(v)},
 async profile(f,el){await submitting(el,async()=>{const fl=S.user.role==='freelancer';
  const color=(el.querySelector('input[name=color]:checked')||{}).value;
  const body=fl?{name:f.name.value,headline:f.headline.value,category:f.category.value,hourly_rate:+f.hourly_rate.value,location:f.location.value,languages:list(f.languages.value),skills:list(f.skills.value),bio:f.bio.value,available:f.available.checked,
   experience:gather('.exp-row',{role:'.x-role',company:'.x-company',period:'.x-period',description:'.x-desc'}).filter(x=>x.role||x.company),
   portfolio:gather('.port-row',{title:'.x-title',link:'.x-link',description:'.x-desc'}).filter(x=>x.title)}
   :{name:f.name.value,company:f.company.value,industry:f.industry.value,website:f.website.value,location:f.location.value,bio:f.bio.value};
  S.user=await api('/me/profile',{method:'PUT',body});
  S.user=await api('/me/account',{method:'PUT',body:{name:f.name.value,avatar:String((f.avatar||{}).value||'').trim(),...(color?{color}:{})}});
  header();toast('Profile saved.');route()})},
 async account(f,el){await submitting(el,async()=>{const color=(el.querySelector('input[name=color]:checked')||{}).value;S.user=await api('/me/account',{method:'PUT',body:{name:f.name.value,email:f.email.value,avatar:f.avatar.value.trim(),...(color?{color}:{})}});header();toast('Account updated.')})},
 async password(f,el){await submitting(el,async()=>{if(f.new.value!==f.confirm.value)throw new Error('The new passwords do not match');await api('/me/password',{method:'POST',body:{current:f.current.value,new:f.new.value}});el.reset();toast('Password updated.')})},
 async prefs(f,el){await submitting(el,async()=>{const b=Object.fromEntries(['orders','proposals','messages','announcements'].map(k=>[k,f[k].checked]));S.user.notify_prefs=await api('/me/preferences',{method:'PUT',body:b});toast('Preferences saved.')})},
 async privacy(f,el){await submitting(el,async()=>{S.user=await api('/me/profile',{method:'PUT',body:{visible:f.visible.checked,available:f.available.checked}});toast('Privacy settings saved.')})},
 async deactivate(f,el){await submitting(el,async()=>{await api('/me/deactivate',{method:'POST',body:{password:f.password.value}});signOutLocal();toast('Your account was closed.');go('#/')})},
 async dispute(f,el){await orderCall('dispute',{reason:f.reason.value},'Dispute opened. Support will review it.')},
 async suspend(f,el){await submitting(el,async()=>{await api(`/admin/users/${el.dataset.u}/suspend`,{method:'POST',body:{reason:f.reason.value}});closeDlg();toast('Account suspended.');route()})},
 async resolve(f,el){await submitting(el,async()=>{await api(`/admin/orders/${el.dataset.o}/resolve`,{method:'POST',body:{decision:f.decision.value,note:f.note.value}});closeDlg();toast('Dispute resolved. Both parties were notified.');route()})},
 async refund(f,el){await submitting(el,async()=>{await api(`/admin/orders/${el.dataset.o}/refund`,{method:'POST',body:{reason:f.reason.value}});closeDlg();toast('Order refunded.');route()})},
 async announce(f,el){await submitting(el,async()=>{const r=await api('/admin/announcements',{method:'POST',body:{title:f.title.value,body:f.body.value,audience:f.audience.value}});el.reset();toast(`Sent to ${r.delivered} people.`)})},
 async platform(f,el){await submitting(el,async()=>{const c=await api('/admin/settings',{method:'PUT',body:{buyer_fee_pct:+f.buyer.value,seller_fee_pct:+f.seller.value,signups_enabled:f.signups.checked}});S.meta.fees={buyer:c.buyer_fee_pct,seller:c.seller_fee_pct};toast('Settings saved.')})}
});

/* ---------- Find Jobs + review actions ---------- */
document.addEventListener('change',e=>{const t=e.target;if(t.dataset&&t.dataset.fk&&onFilterK)onFilterK(t)});
Object.assign(A,{
 jump(d,el){const t=document.getElementById(d.v);if(t)t.scrollIntoView({behavior:'smooth',block:'start'})},
 'jf-toggle'(){const p=$('#fpanel');if(p)p.classList.toggle('open')},
 'jf-more'(){JC&&JC.more()},
 'jf-budget'(d){if(!JC)return;JC.jf.min_budget=d.min||'';JC.jf.max_budget=d.max||'';JC.redrawPanel();JC.drawChips();JC.run(false)},
 'jf-rm'(d){if(!JC)return;const jf=JC.jf,k=d.k;
  if(['category','experience','duration','skills'].includes(k))jf[k]=jf[k].split(',').filter(x=>x&&x!==d.v).join(',');
  else if(k==='budget'){jf.min_budget='';jf.max_budget=''}else jf[k]='';
  JC.redrawPanel();JC.drawChips();JC.run(false)},
 'jf-clear'(){if(!JC)return;const jf=JC.jf;Object.keys(jf).forEach(k=>{if(k!=='q'&&k!=='sort')jf[k]=''});JC.redrawPanel();JC.drawChips();JC.run(false)},
 star(d,el){const form=el.closest('form');form.elements.rating.value=d.v;$$('.starpick button',form).forEach((b,i)=>b.classList.toggle('on',i<+d.v))}
});
Object.assign(FORMS,{
 async clientreview(f,el){await submitting(el,async()=>{await api(`/orders/${curOrder.id}/client-review`,{method:'POST',body:{rating:+f.rating.value,comment:f.comment.value}});toast('Thanks for reviewing the client.');await loadOrder(curOrder.id)})},
 async job(f,el){await submitting(el,async()=>{const r=await api('/jobs',{method:'POST',body:{title:f.title.value,category:f.category.value,description:f.description.value,skills:list(f.skills.value),budget:+f.budget.value,experience_level:f.experience_level.value,duration:f.duration.value}});toast('Job posted. Proposals will appear on the job page.');go('#/job/'+r.id)})}
});

/* ---------- boot ---------- */
window.addEventListener('hashchange',route);
document.addEventListener('toggle',e=>{if(e.target.id==='bell'&&e.target.open)loadNotes()},true);
(async()=>{
 try{S.meta=await api('/meta')}catch(e){}
 if(S.token){try{S.user=await api('/auth/me')}catch(e){signOutLocal()}}
 if(S.user){rt.connect();await Promise.all([refreshUnread(),loadNotes()])}
 await route();
 setInterval(()=>{if(S.user&&!document.hidden&&!rt.ok){refreshUnread();loadNotes()}},30000);
})();
})();
