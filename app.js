'use strict';
(() => {
const BANK=window.BANK, byId=new Map(BANK.map(q=>[q.id,q]));
const TYPES={single:'单选',multi:'多选',judge:'判断',short:'简答',essay:'论述'};
const KEY='wenxi-study-v1', DAY=86400000, INTERVALS=[1,3,7,14,30];
const $=s=>document.querySelector(s), esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fresh=()=>({version:1,records:{},history:[],settings:{daily:15,recall:false},session:null});
let state=fresh(),storageOK=true,view='review',filters={search:'',type:'',topic:''},page=0,detail=null,toastTimer;
try{const raw=localStorage.getItem(KEY);if(raw){state=validate(JSON.parse(raw));}}catch{storageOK=false;}
function validate(x){
 if(!x||x.version!==1||!x.records||typeof x.records!=='object'||Array.isArray(x.records)||!Array.isArray(x.history))throw Error('备份格式不匹配');
 const next=fresh();
 for(const [id,r] of Object.entries(x.records)){
  if(!byId.has(id)||!r||typeof r!=='object')continue;
  const n=(key,max=1e12)=>Number.isFinite(r[key])&&r[key]>=0?Math.min(r[key],max):0;
  next.records[id]={attempts:n('attempts',1e6),correct:n('correct',1e6),stage:n('stage',5),due:n('due',1e14),last:n('last',1e14),wrong:!!r.wrong,saved:!!r.saved,note:typeof r.note==='string'?r.note.slice(0,20000):'',draft:typeof r.draft==='string'?r.draft.slice(0,20000):'',lastGrade:n('lastGrade',2)};
 }
 next.history=x.history.filter(h=>h&&byId.has(h.id)&&Number.isFinite(h.at)&&h.at>0&&h.at<1e14).slice(-30000).map(h=>({id:h.id,at:h.at,grade:[0,1,2].includes(h.grade)?h.grade:0,correct:typeof h.correct==='boolean'?h.correct:null}));
 next.settings={daily:[10,15,20,30].includes(x.settings?.daily)?x.settings.daily:15,recall:!!x.settings?.recall};
 const s=x.session;
 if(s&&['daily','wrong','cards','quiz','filtered'].includes(s.mode)&&Array.isArray(s.ids)&&s.ids.length<=250&&s.ids.length&&s.ids.every(id=>byId.has(id))&&Number.isInteger(s.index)&&s.index>=0&&s.index<=s.ids.length){
  const ids=[...new Set(s.ids)];
  next.session={mode:s.mode,ids,index:Math.min(s.index,ids.length),results:Array.isArray(s.results)?s.results.filter(r=>r&&ids.includes(r.id)).map(r=>({id:r.id,grade:[0,1,2].includes(r.grade)?r.grade:0,correct:typeof r.correct==='boolean'?r.correct:null,picks:Array.isArray(r.picks)?r.picks.filter(v=>['A','B','C','D','T','F'].includes(v)):[]})):[],picks:Array.isArray(s.picks)?s.picks.filter(v=>['A','B','C','D','T','F'].includes(v)):[],revealed:!!s.revealed,confidence:['sure','unsure'].includes(s.confidence)?s.confidence:'unsure',showOptions:!!s.showOptions};
 }
 return next;
}
function save(){try{localStorage.setItem(KEY,JSON.stringify(state));storageOK=true;}catch{storageOK=false;toast('浏览器未能保存，请导出备份。');}}
function record(id){return state.records[id]||{attempts:0,correct:0,stage:0,due:0,last:0,wrong:false,saved:false,note:'',draft:'',lastGrade:0};}
function update(id,patch){state.records[id]={...record(id),...patch};save();}
function dayKey(t=Date.now()){const d=new Date(t);return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;}
const todayHistory=()=>state.history.filter(h=>dayKey(h.at)===dayKey());
const dueQuestions=()=>BANK.filter(q=>record(q.id).attempts&&record(q.id).due<=Date.now());
const isObjective=q=>['single','multi','judge'].includes(q.type);
const comparable=q=>isObjective(q)&&!q.flag;
function match(q){return(!filters.type||q.type===filters.type)&&(!filters.topic||q.topic===filters.topic)&&(!filters.search||[q.stem,...q.options.map(o=>o.text)].join(' ').toLowerCase().includes(filters.search.toLowerCase()));}
function scoped(){return BANK.filter(q=>view==='wrong'?record(q.id).wrong:view==='saved'?record(q.id).saved:true).filter(match);}
function shuffle(a){const b=[...a];for(let i=b.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[b[i],b[j]]=[b[j],b[i]];}return b;}
function interleave(qs){const groups=new Map();for(const q of qs){if(!groups.has(q.topic))groups.set(q.topic,[]);groups.get(q.topic).push(q);}const list=[];while([...groups.values()].some(a=>a.length)){for(const a of groups.values())if(a.length)list.push(a.shift());}return list;}
function dueText(ms){if(ms<DAY)return '10 分钟';return `${Math.round(ms/DAY)} 天`;}
function interval(id,grade){const r=record(id);return grade===0?600000:grade===1?DAY:INTERVALS[Math.min(Math.floor(r.stage),4)]*DAY;}
function applyGrade(q,grade,correct){const r=record(q.id),now=Date.now();const delay=interval(q.id,grade);state.records[q.id]={...r,attempts:r.attempts+1,correct:r.correct+(correct===true?1:0),stage:grade===2?Math.min(r.stage+1,5):grade===1?Math.max(0,r.stage-1):0,due:now+delay,last:now,lastGrade:grade,wrong:grade===0||correct===false||(grade===1&&r.wrong)};state.history.push({id:q.id,at:now,grade,correct});save();}
function toast(msg){$('#toast').textContent=msg;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,3800);}
function render(){
 document.querySelectorAll('nav button').forEach(b=>{b.classList.toggle('active',b.dataset.view===view);b.setAttribute('aria-current',b.dataset.view===view?'page':'false');});
 $('#due-count').textContent=dueQuestions().length||'';$('#wrong-count').textContent=BANK.filter(q=>record(q.id).wrong).length||'';$('#saved-count').textContent=BANK.filter(q=>record(q.id).saved).length||'';
 const seen=BANK.filter(q=>record(q.id).attempts).length;$('#seen-count').textContent=`${seen} / 225 已练`;
 $('#seen-bar').style.width=seen/BANK.length*100+'%';
 if(detail)renderQuestion();else if(view==='review')renderHome();else renderList();
}
function stemText(s){return esc(s.replace(/\s+/g,' ')).replace(/（\s*）/g,'<span class="blank">（　）</span>');}
function header(title,right=''){return `<header class="page-head"><h1>${title}</h1>${right}</header>`;}
function renderHome(){
 const due=dueQuestions().length,unseen=BANK.filter(q=>!record(q.id).attempts).length,done=todayHistory().length,session=state.session;
 const recent=Array.from({length:7},(_,i)=>{const d=new Date();d.setDate(d.getDate()-6+i);return{day:d,key:dayKey(d),n:state.history.filter(h=>dayKey(h.at)===dayKey(d)).length};}),max=Math.max(...recent.map(d=>d.n),state.settings.daily);
 $('#main').innerHTML=`<div class="home">${header('复习',`<span class="subtle">${new Intl.DateTimeFormat('zh-CN',{month:'long',day:'numeric',weekday:'short'}).format(new Date())}</span>`)}${!storageOK?'<p class="save-warning">本地保存不可用，请在设置中导出备份。</p>':''}
 <section class="daily"><h2>今日练习</h2><div class="numbers"><span><strong>${due}</strong>待复习</span><span><strong>${unseen}</strong>未练习</span><span><strong>${done}</strong>今日完成</span></div>
 <div class="daily-actions"><button class="primary" data-action="start" data-mode="daily">${due?'开始复习':'开始练习'} <span>→</span></button><span class="subtle">${state.settings.daily} 题一组</span></div>
 ${session&&session.index<session.ids.length?`<div class="resume"><span>上次的${modeName(session.mode)}<small>${session.index} / ${session.ids.length}</small></span><button class="text-btn" data-action="resume">继续 →</button></div>`:''}</section>
 <section><div class="section-line"><h2>最近 7 天</h2><span class="subtle">${recent.reduce((n,d)=>n+d.n,0)} 次练习</span></div><div class="week">${recent.map((d,i)=>`<div class="day ${i===6?'today':''}" title="${d.day.getMonth()+1}月${d.day.getDate()}日 · ${d.n} 次"><span class="day-value">${d.n||''}</span><div class="bar" style="height:${Math.max(4,d.n/max*58)}px"></div><span>${i===6?'今天':['日','一','二','三','四','五','六'][d.day.getDay()]}</span></div>`).join('')}</div></section>
 <div class="modes"><button class="mode" data-action="start" data-mode="cards"><span><strong>简答与论述</strong><small>25 道题</small></span><span>↗</span></button><button class="mode" data-action="start" data-mode="quiz"><span><strong>随机自测</strong><small>20 道客观题</small></span><span>↗</span></button></div></div>`;
}
function renderList(){const list=scoped(),title={library:'题库',wrong:'错题',saved:'收藏'}[view];const topics=[...new Set(BANK.map(q=>q.topic))];page=Math.max(0,Math.min(page,Math.ceil(list.length/20)-1));
 $('#main').innerHTML=`${header(title,list.length?'<button class="secondary" data-action="start" data-mode="filtered">练习这一组 →</button>':'')}<div class="tools"><input class="search" id="search" aria-label="搜索题目" placeholder="搜索" value="${esc(filters.search)}"><select class="filter" id="type-filter" aria-label="题型"><option value="">全部题型</option>${Object.entries(TYPES).map(([k,v])=>`<option value="${k}" ${filters.type===k?'selected':''}>${v}</option>`).join('')}</select><select class="filter" id="topic-filter" aria-label="主题"><option value="">全部主题</option>${topics.map(t=>`<option ${filters.topic===t?'selected':''}>${t}</option>`).join('')}</select></div><div class="list-summary"><span>${list.length} 道题</span><span>${view==='library'?'原题顺序':''}</span></div><div class="question-list">${list.slice(page*20,page*20+20).map(q=>{const r=record(q.id);return`<div class="question-row"><span class="row-state ${r.wrong?'wrong':r.stage>=3?'mastered':''}" aria-label="${r.wrong?'待巩固':r.stage>=3?'已巩固':'未巩固'}"></span><span class="row-no">${String(q.num).padStart(2,'0')}</span><button class="row-open" data-action="open" data-id="${q.id}"><span class="row-title">${stemText(q.stem)}</span><span class="row-meta">${TYPES[q.type]} · ${q.topic}</span></button><button class="icon-btn ${r.saved?'on':''}" data-action="bookmark" data-id="${q.id}" aria-label="${r.saved?'取消收藏':'收藏'}" aria-pressed="${r.saved}">${r.saved?'★':'☆'}</button></div>`;}).join('')}</div>${!list.length?`<div class="empty"><h2>${filters.search||filters.type||filters.topic?'没有匹配的题目':view==='wrong'?'还没有错题':'还没有收藏'}</h2>${view==='wrong'?'<p>答错或标记“没记住”的题会留在这里。</p>':''}<button class="text-btn" data-action="${filters.search||filters.type||filters.topic?'clear-filters':'nav'}" data-view="library">${filters.search||filters.type||filters.topic?'清除筛选':'去题库 →'}</button></div>`:''}${list.length>20?`<div class="pagination"><button class="text-btn" data-action="page" data-dir="-1" ${page===0?'disabled':''}>← 上一页</button><span>${page+1} / ${Math.ceil(list.length/20)}</span><button class="text-btn" data-action="page" data-dir="1" ${(page+1)*20>=list.length?'disabled':''}>下一页 →</button></div>`:''}`;
}
function modeName(mode){return {daily:'复习',wrong:'错题练习',cards:'背诵',quiz:'自测',filtered:'练习'}[mode]||'练习';}
function newQuestion(){return{picks:[],revealed:false,confidence:'unsure',showOptions:!state.settings.recall};}
function start(mode){
 if(state.session&&state.session.index<state.session.ids.length&&!confirm('开始新的一组？上次未完成的进度会被替换，已完成的记录会保留。'))return;
 let qs=[];
 if(mode==='daily'){const due=dueQuestions().sort((a,b)=>record(a.id).due-record(b.id).due),freshQs=interleave(BANK.filter(q=>!record(q.id).attempts));qs=[...due,...freshQs].slice(0,state.settings.daily);if(!qs.length){toast('本轮已完成，暂时没有到期题目。可以去题库自由练习。');return;}}
 if(mode==='cards')qs=interleave(BANK.filter(q=>['short','essay'].includes(q.type)).sort((a,b)=>record(a.id).due-record(b.id).due)).slice(0,state.settings.daily);
 if(mode==='quiz')qs=shuffle(BANK.filter(comparable)).slice(0,20);
 if(mode==='filtered')qs=shuffle(scoped()).slice(0,state.settings.daily);
 if(!qs.length){toast('暂无题目');return;}
 state.session={mode,ids:qs.map(q=>q.id),index:0,results:[],...newQuestion()};detail={session:true};save();render();scrollTop();
}
function current(){const s=detail.session?state.session:detail;return{s,q:byId.get(detail.session?s.ids[s.index]:s.id)};}
function optionItems(q){return q.type==='judge'?[{key:'T',text:'正确'},{key:'F',text:'错误'}]:q.options;}
function answerText(q){return q.type==='judge'?(q.answer==='T'?'正确':'错误'):q.answer;}
function picksCorrect(q,s){return s.picks.slice().sort().join('')===q.answer.split('').sort().join('');}
function renderQuestion(){
 if(detail.session&&state.session.index>=state.session.ids.length){renderResult();return;}
 const {s,q}=current(),r=record(q.id),quiz=detail.session&&s.mode==='quiz',objective=isObjective(q),revealed=s.revealed,correct=objective&&picksCorrect(q,s),choices=optionItems(q),showOptions=!objective||s.showOptions||revealed||quiz;
 $('#main').innerHTML=`<div class="study"><header class="study-head"><button class="back" data-action="back">← ${detail.session?'退出':'返回'}</button>${detail.session?`<div class="study-progress"><span class="subtle">${s.index+1} / ${s.ids.length}</span><div class="track"><i style="width:${s.index/s.ids.length*100}%"></i></div></div>`:`<span class="subtle">${q.topic}</span>`}</header><div class="question-top"><span>${TYPES[q.type]} ${String(q.num).padStart(2,'0')}</span><button class="icon-btn ${r.saved?'on':''}" data-action="bookmark" data-id="${q.id}" aria-label="${r.saved?'取消收藏':'收藏'}" aria-pressed="${r.saved}">${r.saved?'★':'☆'}</button></div><h1 class="question-title">${stemText(q.stem)}</h1>
 ${objective?`${showOptions?`<div class="options" role="group" aria-label="答案选项">${choices.map(o=>`<button class="option ${s.picks.includes(o.key)?'selected':''} ${revealed&&!q.flag&&q.answer.includes(o.key)?'correct':''} ${revealed&&!q.flag&&s.picks.includes(o.key)&&!q.answer.includes(o.key)?'incorrect':''}" data-action="pick" data-key="${o.key}" aria-pressed="${s.picks.includes(o.key)}" ${revealed?'disabled':''}><span class="letter">${q.type==='judge'?(o.key==='T'?'✓':'×'):o.key}</span><span>${esc(o.text)}</span></button>`).join('')}</div>`:'<div class="recall-blank">先回想，再看选项。</div><button class="text-btn toggle-options" data-action="show-options">显示选项</button>'}`:`<textarea class="answer-entry" id="draft" aria-label="我的回答" placeholder="写下你记得的要点…" ${revealed?'readonly':''}>${esc(r.draft)}</textarea>`}
 ${!revealed?`${objective&&showOptions&&!quiz?`<div class="confidence"><span>把握</span><button data-action="confidence" data-value="unsure" class="${s.confidence==='unsure'?'chosen':''}">不确定</button><button data-action="confidence" data-value="sure" class="${s.confidence==='sure'?'chosen':''}">确定</button></div>`:''}<div class="question-actions"><button class="primary" data-action="reveal" ${objective&&(!s.picks.length||!showOptions)?'disabled':''}>${quiz?(s.index===s.ids.length-1?'交卷':'下一题 →'):objective?'核对答案':'核对要点'}</button>${!quiz?'<button class="text-btn" data-action="forgot">想不起来</button>':''}</div>`:renderFeedback(q,s,correct)}
 ${!quiz?`<details class="notes" ${r.note?'open':''}><summary>笔记</summary><textarea id="note" class="note-entry" aria-label="本题笔记" placeholder="记一个易混点…">${esc(r.note)}</textarea></details>`:''}</div>`;
}
function renderFeedback(q,s,correct){const canScore=comparable(q),defaultGrade=canScore&&!correct?0:1;return `<section class="feedback" aria-live="polite"><div class="feedback-title ${canScore?(correct?'good':'bad'):''}">${canScore?(correct?'答对了':'再记一次'):isObjective(q)?'待核对':'参考要点'}${isObjective(q)?`<span>${answerText(q)}</span>`:''}<span class="source-label">${isObjective(q)?'参考答案':'非标准评分答案'}</span></div>${q.flag?`<div class="flag">${esc(q.flag)} · 本题不自动判分</div>`:''}${q.points.length?`<ol class="points">${q.points.map(p=>`<li>${esc(p)}</li>`).join('')}</ol>`:`<p class="feedback-text">${esc(q.explanation)}</p>`}${canScore&&!correct&&s.confidence==='sure'?'<p class="muted-line">这题之前很确定，可以记下混淆的原因。</p>':''}${q.sources.length?`<div class="sources">${q.sources.map(([name,url])=>`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(name)} ↗</a>`).join('')}</div>`:''}${s.readOnly?`<div class="question-actions"><button class="secondary" data-action="back">返回</button></div>`:canScore&&!correct?`<div class="question-actions"><button class="primary" data-action="grade" data-grade="0">${detail.session?'继续 →':'完成'} </button><span class="subtle">10 分钟后复习</span></div>`:`<div class="grade-actions"><button data-action="grade" data-grade="0">没记住<small>${dueText(interval(q.id,0))}</small></button><button data-action="grade" data-grade="1">有点模糊<small>${dueText(interval(q.id,1))}</small></button><button data-action="grade" data-grade="2">记住了<small>${dueText(interval(q.id,2))}</small></button></div>`}</section>`;}
function reveal(forgot=false){const {s,q}=current();if(s.revealed)return;if(forgot)s.picks=[];if(detail.session&&s.mode==='quiz'){if(!s.picks.length)return;const correct=picksCorrect(q,s),grade=correct?2:0;applyGrade(q,grade,correct);s.results.push({id:q.id,correct,grade,picks:[...s.picks]});s.index++;Object.assign(s,newQuestion());save();render();scrollTop();return;}if(isObjective(q)&&!s.picks.length&&!forgot)return;s.revealed=true;s.showOptions=true;if(detail.session)save();render();}
function grade(g){const {s,q}=current();if(!s.revealed||s.readOnly)return;const correct=comparable(q)?picksCorrect(q,s):null;if(correct===false)g=0;applyGrade(q,g,correct);if(detail.session){s.results.push({id:q.id,correct,grade:g,picks:[...s.picks]});s.index++;Object.assign(s,newQuestion());save();}else{detail=null;toast('已保存');}render();scrollTop();}
function renderResult(){const s=state.session,scored=s.results.filter(r=>typeof r.correct==='boolean'),n=scored.filter(r=>r.correct).length,weak=s.results.filter(r=>r.grade===0);$('#main').innerHTML=`<div class="study">${header('已完成')}<section class="session-result"><h1>本组完成</h1><div class="result-numbers"><div><strong>${s.results.length}</strong><span>完成题数</span></div><div><strong>${scored.length?Math.round(n/scored.length*100)+'%':'—'}</strong><span>客观题正确率</span></div><div><strong>${weak.length}</strong><span>待巩固</span></div></div><div class="question-actions"><button class="primary" data-action="back">返回复习</button>${weak.length?'<button class="text-btn" data-action="nav" data-view="wrong">查看错题 →</button>':''}</div></section><div class="result-list">${s.results.map(r=>{const q=byId.get(r.id);return`<div class="result-row"><span class="${r.grade===0?'bad':''}">${r.grade===0?'↺':'✓'}</span><button data-action="result-detail" data-id="${q.id}">${stemText(q.stem)}</button></div>`;}).join('')}</div></div>`;}
function openSettings(){const d=$('#settings');$('#settings-body').innerHTML=`<div class="setting-row"><span>每组题数</span><select id="daily-setting" aria-label="每组题数">${[10,15,20,30].map(n=>`<option ${state.settings.daily===n?'selected':''}>${n}</option>`).join('')}</select></div><label class="setting-row" for="recall-setting"><span>先隐藏选项</span><input type="checkbox" id="recall-setting" ${state.settings.recall?'checked':''}></label><p class="setting-note">进度保存在当前浏览器。更换设备或清理浏览器前，请导出备份。</p><div class="backup-actions"><button class="secondary" data-action="export">导出备份</button><button class="secondary" data-action="import">导入备份</button></div><details class="method"><summary>题库与复习方法</summary><p>题目来自《习思想题库（学生版）》：单选 100、多选 50、判断 50、简答 20、论述 5。补齐单选第 3 题题号，拆分同段的简答第 5、6 题；原题表述保留。主题是辅助分类，并非原文章节。</p><p>原文件没有答案。本页答案及主观题要点为辅助整理，尚未逐题取得教师确认；存疑题不参与自动评分。以课程教材和教师口径为准。</p><p>先回忆、再核对，并跨天重复。答错的题 10 分钟后重现；模糊的题隔 1 天；记住的题按 1、3、7、14、30 天推进。这是透明的实用规则，不是经过本题库验证的最优间隔。</p><p>正确率只统计可自动核对的客观题；主观题由你自评。今日完成数按练习次数计，左下角按练过的不同题目计。</p><a href="https://www.psychologicalscience.org/publications/journals/pspi/learning-techniques.html" target="_blank" rel="noopener noreferrer">Dunlosky 等（2013）：自测与分散练习 ↗</a><br><a href="https://pubmed.ncbi.nlm.nih.gov/21252317/" target="_blank" rel="noopener noreferrer">Karpicke 与 Blunt（2011）：检索练习 ↗</a></details>`;d.showModal();}
function exportBackup(){const blob=new Blob([JSON.stringify({...state,exportedAt:new Date().toISOString()},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`温习备份-${new Date().toLocaleDateString('sv-SE')}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('备份已导出');}
function scrollTop(){window.scrollTo({top:0});$('#main').focus({preventScroll:true});}
document.addEventListener('click',e=>{const b=e.target.closest('[data-action]');if(!b||b.disabled)return;const action=b.dataset.action;
 if(action==='nav'){view=b.dataset.view;detail=null;filters={search:'',type:'',topic:''};page=0;render();scrollTop();}
 if(action==='start')start(b.dataset.mode);
 if(action==='resume'){if(state.session){detail={session:true};render();scrollTop();}}
 if(action==='back'){if(detail?.readOnly&&detail.fromResult){detail={session:true};}else detail=null;render();scrollTop();}
 if(action==='open'){detail={id:b.dataset.id,...newQuestion()};render();scrollTop();}
 if(action==='result-detail'){const r=state.session.results.find(r=>r.id===b.dataset.id);detail={id:r.id,...newQuestion(),picks:r.picks,revealed:true,showOptions:true,readOnly:true,fromResult:true};render();scrollTop();}
 if(action==='bookmark'){const id=b.dataset.id;update(id,{saved:!record(id).saved});render();}
 if(action==='page'){page+=+b.dataset.dir;render();scrollTop();}
 if(action==='clear-filters'){filters={search:'',type:'',topic:''};page=0;render();}
 if(action==='pick'){const {s,q}=current();if(s.revealed)return;const key=b.dataset.key;s.picks=q.type==='multi'?(s.picks.includes(key)?s.picks.filter(k=>k!==key):[...s.picks,key]):[key];if(detail.session)save();render();}
 if(action==='confidence'){const {s}=current();s.confidence=b.dataset.value;if(detail.session)save();render();}
 if(action==='show-options'){const {s}=current();s.showOptions=true;if(detail.session)save();render();}
 if(action==='reveal')reveal();if(action==='forgot')reveal(true);if(action==='grade')grade(+b.dataset.grade);
 if(action==='settings')openSettings();if(action==='close-settings')$('#settings').close();if(action==='export')exportBackup();if(action==='import')$('#import-file').click();
});
document.addEventListener('input',e=>{const t=e.target;if(t.id==='search'){const pos=t.selectionStart;filters.search=t.value;page=0;renderList();$('#search').focus();$('#search').setSelectionRange(pos,pos);}if(t.id==='draft'||t.id==='note'){const {q}=current();update(q.id,{[t.id==='draft'?'draft':'note']:t.value});}});
document.addEventListener('change',e=>{const t=e.target;if(t.id==='type-filter'||t.id==='topic-filter'){filters[t.id==='type-filter'?'type':'topic']=t.value;page=0;renderList();}if(t.id==='daily-setting'){state.settings.daily=+t.value;save();if(!detail&&view==='review')renderHome();}if(t.id==='recall-setting'){state.settings.recall=t.checked;save();}});
$('#import-file').addEventListener('change',async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>10*1024*1024)throw Error('备份文件超过 10 MB');const next=validate(JSON.parse(await file.text()));if(!confirm('用这份备份替换当前进度？建议先导出当前备份。'))return;state=next;save();detail=null;view='review';$('#settings').close();render();toast('备份已恢复');}catch(err){toast('导入失败：'+err.message);}finally{e.target.value='';}});
document.addEventListener('keydown',e=>{if(!detail||e.ctrlKey||e.metaKey||e.altKey||/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)||$('#settings').open)return;const {s,q}=current();if(!q||s.revealed)return;const opts=optionItems(q);if(/^[1-4]$/.test(e.key)){const o=opts[+e.key-1];if(o&&s.showOptions){e.preventDefault();document.querySelector(`[data-action="pick"][data-key="${o.key}"]`)?.click();}}});
render();
})();
