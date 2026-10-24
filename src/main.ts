import * as THREE from 'three';
import './style.css';
import { createRendering } from './rendering.ts';
import { createScenery } from './scenery.ts';
import type { SnowPoles } from './snow-poles.ts';
import { Input } from './input.ts';
import { Vehicle } from './vehicle.ts';
import { Course, courses, WORLD_SIZE } from './track.ts';
import { Race } from './race.ts';
import { CollisionWorld } from './collision.ts';
import { Wildlife } from './wildlife.ts';
import { Traffic } from './traffic.ts';
import { disposeGroup } from './dispose.ts';
import { detectLanguage, isCourseAvailable, loadProgress, recordResult, saveProgress } from './storage.ts';
import type { Language, StorageLike } from './storage.ts';
import { formatTime, text } from './i18n.ts';
import type { TextKey } from './i18n.ts';

const el=<T extends HTMLElement=HTMLElement>(id:string) => document.getElementById(id)! as T;
function start(): void {
  let storage:StorageLike|null=null;
  try {storage=window.localStorage;} catch { /* Private browsing may block storage. */ }
  const progress=loadProgress(storage,navigator.language);
  let language=progress.language;
  const t=(key:TextKey)=>text(language,key);
  const time=(value:number)=>formatTime(value,language);
  const {renderer,scene,camera,follow}=createRendering(el('viewport'));
  const input=new Input();
  let group=new THREE.Group();
  let selected=0;
  let course:Course;
  let car:Vehicle;
  let race:Race;
  let world:CollisionWorld;
  let wildlife:Wildlife;
  let traffic:Traffic;
  let snowPoles:SnowPoles;
  let lastState='';
  let lastImpact=0;
  let accumulator=0;
  let toastUntil=0;
  let toastKey:TextKey='recovered';
  let personalBest=false;
  let previousBest:number|null=null;
  let storageUnavailable=false;
  const menus=el('menus');
  const languageSelect=el<HTMLSelectElement>('language');
  const step=1/120;

  function persist(): void {storageUnavailable=!saveProgress(storage,progress);updateStorageWarning();}
  function updateStorageWarning(): void {el('storage-warning').hidden=!storageUnavailable;el('storage-warning').textContent=t('storageWarning');}
  function announce(key:TextKey): void {toastKey=key;toastUntil=performance.now()+2200;el('toast').textContent=t(key);el('toast').hidden=false;}

  function loadCourse(index:number): void {
    if(!isCourseAvailable(index)) return;
    input.clear(); accumulator=0;
    disposeGroup(group);
    selected=index;course=new Course(courses[index]);world=new CollisionWorld();group=new THREE.Group();scene.add(group);
    snowPoles=createScenery(group,course,world);
    car=new Vehicle(course);group.add(car.mesh);
    const seed=new Uint32Array(1);crypto.getRandomValues(seed);
    wildlife=new Wildlife(course,world,group,seed[0]);
    traffic=new Traffic(course,world,group);
    race=new Race(course);lastImpact=0;personalBest=false;previousBest=null;
    addGates();updateMap();follow(car,0,true);
    scene.background=new THREE.Color(course.definition.region==='hills'?'#c1d2cd':'#c8d9cf');
    if(scene.fog instanceof THREE.Fog) scene.fog.color.copy(scene.background);
  }

  function addGates(): void {
    const gateMaterial=new THREE.MeshStandardMaterial({color:'#e9ddba'});
    const accent=new THREE.MeshStandardMaterial({color:'#bd6c40'});
    const make=(progress:number)=> {
      const sample=course.sample(progress);
      const gate=new THREE.Group();
      for(const sign of [-1,1]) {
        const post=new THREE.Mesh(new THREE.BoxGeometry(.25,3.5,.25),gateMaterial);post.position.set(sign*(course.definition.width/2+1),1.75,0);post.castShadow=true;gate.add(post);
      }
      const beam=new THREE.Mesh(new THREE.BoxGeometry(course.definition.width+2.5,.7,.15),gateMaterial);beam.position.y=3.7;gate.add(beam);
      for(let i=0;i<18;i++) {
        const check=new THREE.Mesh(new THREE.BoxGeometry((course.definition.width+2.5)/18,.35,.16),i%2?accent:gateMaterial);
        check.position.set((i-8.5)*(course.definition.width+2.5)/18,3.7+(i%2?.175:-.175),0);gate.add(check);
      }
      gate.position.copy(sample.point);gate.rotation.y=Math.atan2(sample.tangent.x,sample.tangent.z);group.add(gate);
    };
    make(0); if(!course.definition.closed) make(1);
  }

  function updateMap(): void {
    const xs=course.points.map(p=>p.x), zs=course.points.map(p=>p.z);
    const minX=Math.min(...xs)-20,minZ=Math.min(...zs)-20;
    const size=Math.max(Math.max(...xs)-minX,Math.max(...zs)-minZ)+20;
    el('route-map').setAttribute('viewBox',`${minX} ${minZ} ${size} ${size}`);
    el('map-track').setAttribute('d',course.points.map((p,i)=>`${i?'L':'M'}${p.x.toFixed(1)},${p.z.toFixed(1)}`).join(' '));
    el('map-gates').innerHTML=course.checkpoints.filter((_,i)=>i%3===0).map(p=>`<circle cx="${p.point.x}" cy="${p.point.z}" r="2"/>`).join('');
  }

  function begin(practice=false): void {
    loadCourse(selected);race.start(practice);lastTime=performance.now();input.clear();lastState='';renderMenus();updateLabels();
  }
  function showSelection(): void {input.clear();race.state='select';lastState='';renderMenus();updateLabels();}
  function showTitle(): void {input.clear();race.state='title';lastState='';renderMenus();updateLabels();}
  function pause(): void {if(race.state!=='racing'&&race.state!=='countdown')return;race.pause();input.clear();accumulator=0;renderMenus();updateLabels();}
  function resume(): void {race.resume();lastTime=performance.now();input.clear();accumulator=0;renderMenus();updateLabels();}
  function recover(key:TextKey='recovered'): void {
    if(!race.recover()) return;
    const point=race.recoveryPoint;
    car.recover(point.point,point.tangent);race.damage=car.damage;follow(car,0,true);accumulator=0;announce(key);
  }

  function updateLabels(): void {
    document.documentElement.lang=language;
    languageSelect.value=language;languageSelect.setAttribute('aria-label',t('language'));el('language-label').textContent=t('language');
    el('home').setAttribute('aria-label',t('homeLabel'));el('viewport').setAttribute('aria-label',t('gameLabel'));
    renderer.domElement.setAttribute('aria-label',t('gameLabel'));
    el('route-map').setAttribute('aria-label',t('mapLabel'));
    el('countdown').setAttribute('aria-label',t('countdownLabel'));
    el('pause-button').textContent=t('pause');
    el('pause-button').hidden=!['racing','countdown'].includes(race.state);
    el('mode-label').textContent=`${t(course.definition.region)} / ${t(race.practice?'freeDrive':'racing')}`;
    for(const [id,key] of [['time-label','time'],['checkpoint-label','checkpoints'],['condition-label','condition'],['drive-label','drive'],['handbrake-label','handbrake'],['recover-label','recover']] as [string,TextKey][]) el(id).textContent=t(key);
    el('course-name').textContent=course.definition.name;
    el('route-length').textContent=`${(course.length/1000).toLocaleString(language,{maximumFractionDigits:2})} ${t('distance')}`;
    el('route-type').textContent=t(course.definition.closed?'circuit':'stage');
    updateStorageWarning();
    if(!el('toast').hidden) el('toast').textContent=t(toastKey);
  }

  const button=(action:string,key:TextKey,primary=false)=>`<button data-action="${action}" class="${primary?'primary':'secondary'}">${t(key)}${primary?'<span aria-hidden="true">↗</span>':''}</button>`;
  const targets=()=>`<div class="targets">${(['gold','silver','bronze'] as const).map(m=>`<span class="medal-target ${m}"><i></i>${t(m)}<b>${time(course.definition.medals[m])}</b></span>`).join('')}</div>`;

  const languageOptions=()=>`<label class="language pause-language"><span>${t('language')}</span><select data-language aria-label="${t('language')}">${(['en','nl','sv'] as const).map(code=>`<option value="${code}" ${code===language?'selected':''}>${{en:'English',nl:'Nederlands',sv:'Svenska'}[code]}</option>`).join('')}</select></label>`;
  function renderMenus(): void {
    const state=race.state;
    el('race-hud').hidden=!['racing','countdown','paused'].includes(state);
    el('countdown').hidden=state!=='countdown';
    menus.className=state==='title'?'title-menu':state==='select'?'selection-menu':state==='paused'||state==='finished'||state==='crashed'?'center-menu':'';
    if(state==='title') {
      menus.innerHTML=`<section class="title-copy"><span class="eyebrow">${t('eyebrow')}</span><h1>${t('escape')}</h1><p class="subtitle">${t('subtitle')}</p><div class="title-actions">${button('select','choose',true)}<span class="volume">01 — 06 / SMÅLAND, ${t('country').toUpperCase()}</span></div><div class="title-details"><p>${t('rules')}</p><p>${t('caution')}</p><details><summary>${t('controls')}</summary><p>${t('controlInfo')}</p></details></div></section><div class="title-stamp" aria-hidden="true"><span>SMÅLAND</span><b>GRAVEL<br>CLUB</b><span>EST. 2026</span></div>`;
    } else if(state==='select') {
      menus.innerHTML=`<section class="selection-panel" aria-label="${t('selectLabel')}"><div class="selection-header"><div><span class="eyebrow">SMÅLAND / 01—06</span><h1>${t('routes')}</h1><p>${t('routeIntro')}</p></div><button data-action="title" class="text-button">← ${t('back')}</button></div><div class="course-grid">${courses.map((def,i)=> {
        const record=progress.records[def.id];
        const preview=new Course(def);const xs=preview.points.map(p=>p.x),zs=preview.points.map(p=>p.z);const x=Math.min(...xs)-20,z=Math.min(...zs)-20,size=Math.max(Math.max(...xs)-x,Math.max(...zs)-z)+20;
        const path=preview.points.filter((_,j)=>j%5===0).map((p,j)=>`${j?'L':'M'}${p.x},${p.z}`).join(' ')+(def.closed?'Z':'');
        return `<button class="course-tile ${i===selected?'selected':''}" data-course="${i}" aria-pressed="${i===selected}"><div class="tile-top"><span>0${i+1} / ${t(def.region)}</span><span>${record?t(record.medal):'↗'}</span></div><svg viewBox="${x} ${z} ${size} ${size}" aria-hidden="true"><path d="${path}"/></svg><h2>${def.name}</h2><span class="course-type">${t(def.closed?'circuit':'stage')} · ${(preview.length/1000).toLocaleString(language,{maximumFractionDigits:2})} km</span><div class="tile-record">${record?`${t('best')} <strong>${time(record.total)}</strong>`:t('noRecord')}</div></button>`;
      }).join('')}</div><div class="selection-bottom"><div><h3>${course.definition.name}</h3>${targets()}</div><div class="selection-actions">${button('practice','practice')}${button('start','play',true)}<small>${t('practiceNote')}</small></div></div></section>`;
    } else if(state==='paused') {
      menus.innerHTML=`<section class="dialog-panel" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><span class="eyebrow">${t(race.practice?'freeDrive':'racing')} / ${course.definition.name}</span><h1 id="dialog-title">${t('paused')}</h1><p>${t('pausedInfo')}</p>${languageOptions()}<div class="dialog-actions">${button('resume','resume',true)}${button('retry','restart')}${button('select','menu')}</div><p class="fine-print">${t('controlInfo')}</p></section>`;
    } else if(state==='finished') {
      const result=race.result!;
      menus.innerHTML=`<section class="dialog-panel result-panel" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><span class="eyebrow">${course.definition.name} / ${t(result.medal)}</span><h1 id="dialog-title">${t('finished')}</h1>${personalBest?`<div class="record-badge">${t('newRecord')}</div>`:''}<div class="result-time">${time(result.total)}</div><dl class="result-breakdown"><div><dt>${t('drivingTime')}</dt><dd>${time(result.elapsed)}</dd></div><div><dt>${t('damagePenalty')} (${result.damage.toLocaleString(language,{maximumFractionDigits:1})})</dt><dd>+${time(result.damage*.2)}</dd></div><div><dt>${t('recoveryPenalty')} (${result.recoveries})</dt><dd>+${time(result.recoveries*5)}</dd></div>${previousBest!==null?`<div><dt>${t('improvement')}</dt><dd>${time(previousBest)}</dd></div>`:''}</dl>${targets()}${result.medal==='none'?`<p>${t('noMedalInfo')}</p>`:''}<div class="dialog-actions">${button('retry','restart',true)}${selected<courses.length-1&&isCourseAvailable(selected+1)?button('next','next'):''}${button('select','menu')}</div></section>`;
    } else if(state==='crashed') {
      menus.innerHTML=`<section class="dialog-panel crash-panel" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><span class="eyebrow">${course.definition.name} / ${t('condition')} 0%</span><h1 id="dialog-title">${t('crashed')}</h1><p>${t('crashInfo')}</p><div class="result-time">${time(race.elapsed)}</div><div class="dialog-actions">${button('retry','restart',true)}${button('select','menu')}</div></section>`;
    } else menus.innerHTML='';
    updateLabels();
    if(['paused','finished','crashed'].includes(state)) menus.querySelector<HTMLButtonElement>('button')?.focus({preventScroll:true});
  }

  menus.addEventListener('click',event=> {
    const target=(event.target as HTMLElement).closest<HTMLButtonElement>('button');if(!target)return;
    if(target.dataset.course!==undefined) {
      const index=Number(target.dataset.course);if(!isCourseAvailable(index))return;
      loadCourse(index);race.state='select';renderMenus();return;
    }
    switch(target.dataset.action) {
      case 'select':showSelection();break;
      case 'title':showTitle();break;
      case 'start':begin();break;
      case 'practice':begin(true);break;
      case 'retry':begin(race.practice);break;
      case 'resume':resume();break;
      case 'next':if(isCourseAvailable(selected+1)) {loadCourse(selected+1);race.state='select';renderMenus();}break;
    }
    target.blur();
  });
  function setLanguage(value: string): void {
    if(!['en','nl','sv'].includes(value))return;
    language=value as Language;progress.language=language;persist();renderMenus();
  }
  languageSelect.addEventListener('change',()=>{setLanguage(languageSelect.value);languageSelect.blur();});
  menus.addEventListener('change',event=> {
    const select=event.target as HTMLSelectElement;
    if(select.matches('select[data-language]'))setLanguage(select.value);
  });
  el('home').addEventListener('click',()=> {showTitle();el('home').blur();});
  el('pause-button').addEventListener('click',pause);
  el('recover-button').addEventListener('click',()=>{recover();el('recover-button').blur();});
  window.addEventListener('keydown',event=> {
    if(event.code==='Tab') {
      const dialog=menus.querySelector('[role=dialog]');
      if(dialog) {
        const fields=Array.from(dialog.querySelectorAll<HTMLElement>('button, select'));
        const first=fields[0],last=fields[fields.length-1];
        if(event.shiftKey&&document.activeElement===first) {event.preventDefault();last?.focus();}
        else if(!event.shiftKey&&document.activeElement===last) {event.preventDefault();first?.focus();}
      }
    }
    if(event.code==='Escape'&&!event.repeat) {event.preventDefault();if(race.state==='paused')resume();else pause();}
  });
  window.addEventListener('blur',()=>pause());
  document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();lastTime=performance.now();accumulator=0;});
  renderer.domElement.addEventListener('webglcontextlost',event=> {
    event.preventDefault();renderer.setAnimationLoop(null);el('error').hidden=false;el('error').textContent=t('contextLost');
  });
  loadCourse(0);persist();renderMenus();
  let lastTime=performance.now();
  renderer.setAnimationLoop(now=> {
    const wallDelta=Math.max(0,(now-lastTime)/1000);lastTime=now;
    const before=race.state;
    race.elapse(wallDelta);
    if(input.consumeReset()&&race.state==='racing') recover();
    if(race.state==='racing') {
      // The score uses wall time; only physics catch-up is bounded after slow frames.
      accumulator+=Math.min(wallDelta,.1);
      const controls=input.read();
      while(accumulator>=step&&race.state==='racing') {
        const previous=car.position.clone();
        wildlife.update(step,car.position,car.forwardSpeed);traffic.update(step,car.position);car.update(step,controls,world);snowPoles.update(step);
        race.observe(previous,car.position,car.damage);
        if(race.state==='racing'&&(course.inWater(car.position.x,car.position.z)||Math.abs(car.position.x)>WORLD_SIZE/2-8||Math.abs(car.position.z)>WORLD_SIZE/2-8)) {
          recover(course.inWater(car.position.x,car.position.z)?'water':'boundary');break;
        }
        accumulator-=step;
      }
      follow(car,Math.min(wallDelta,.05));
      if(car.impact>lastImpact+.15) announce('impact');
      lastImpact=car.impact;
      const activeWildlife=wildlife.animals.some(a=>a.state==='crossing'&&a.mesh.position.distanceTo(car.position)<45);
      if(activeWildlife&&performance.now()>toastUntil)announce('wildlife');
      else if(car.forwardSpeed>9&&traffic.aheadOf(car.position)&&performance.now()>toastUntil)announce('traffic');
    } else accumulator=0;
    if(race.state==='finished'&&before!=='finished') {
      const result=race.result!;previousBest=progress.records[course.definition.id]?.total??null;
      personalBest=recordResult(progress,course.definition.id,result);persist();
    }
    if(lastState!==race.state) {renderMenus();lastState=race.state;}
    if(race.state==='countdown')el('countdown').innerHTML=`<span>${t('ready')}</span><strong>${Math.ceil(race.countdown)}</strong>`;
    el('race-time').textContent=time(race.practice?race.elapsed:race.total);
    el('speed').textContent=Math.round(car.velocity.length()*3.6).toString().padStart(3,'0');
    el('gear').textContent=car.forwardSpeed<-.5?'R':Math.abs(car.forwardSpeed)<.5?'N':'D';
    el('surface').textContent=t(car.onRoad?'gravel':'offRoad');
    el('condition-value').textContent=`${Math.ceil(100-car.damage)}%`;
    el('condition-fill').style.width=`${100-car.damage}%`;
    el('condition-fill').classList.toggle('critical',car.damage>65);
    const completed=race.nextCheckpoint-1,total=course.checkpoints.length-1;
    el('checkpoint-count').textContent=race.practice?'—':`${Math.min(completed,total)} / ${total}`;
    el('progress-fill').style.width=`${race.practice?course.nearest(car.position.x,car.position.z).progress*100:completed/total*100}%`;
    const best=progress.records[course.definition.id];
    const split=completed>0&&best?.splits[completed-1]!==undefined?race.splits[completed-1]-best.splits[completed-1]:null;
    el('split').textContent=race.practice?t('practiceNote'):split!==null?`${t('split')} ${split>0?'+':'−'}${time(Math.abs(split))}`:best?`${t('best')} ${time(best.total)}`:t('firstRun');
    el('split').classList.toggle('ahead',split!==null&&split<0);
    el('map-car').setAttribute('cx',car.position.x.toFixed(2));el('map-car').setAttribute('cy',car.position.z.toFixed(2));
    el('impact-flash').style.opacity=String(car.impact*.4);
    if(now>toastUntil)el('toast').hidden=true;
    renderer.render(scene,camera);
  });
}

try {start();} catch(error) {
  console.error(error);const lang=detectLanguage(navigator.language);
  el('error').hidden=false;el('error').textContent=text(lang,'graphicsError');
}
