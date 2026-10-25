import { createDrivingProfiles, restoreDrivingProfiles, tuningGroups, tuningTarget, type DrivingStyle } from './driving.ts';
import { icon } from './icons.ts';

const storageKey='smaland-racer-driving-tuning-v1';

/** Desktop workshop. Profiles are shared with the active car, so edits apply immediately. */
export class DrivingTuner {
  readonly profiles=loadSettings();
  private open=false;
  private readonly toggle=document.getElementById('tuning-toggle')!;
  private readonly panel=document.getElementById('tuning-panel')!;
  private readonly card=document.querySelector('.route-card')!;
  private readonly status=document.getElementById('tuning-status')!;

  constructor(private style:()=>DrivingStyle,private clearInput:()=>void) {
    this.toggle.innerHTML=`${icon('tune')}<span>Tune</span>`;
    this.toggle.addEventListener('click',()=> {
      this.open=!this.open;this.clearInput();this.render();this.toggle.blur();
    });
    document.getElementById('tuning-copy')!.innerHTML=icon('copy');
    document.getElementById('tuning-copy')!.addEventListener('click',()=>void this.copy());
    document.getElementById('tuning-reset')!.addEventListener('click',()=> {
      const defaults=createDrivingProfiles();
      this.profiles[this.style()]=defaults[this.style()];this.profiles.ice=defaults.ice;
      this.save();this.render();this.clearInput();
    });
    this.panel.addEventListener('focusin',()=>this.clearInput());
    this.panel.addEventListener('input',event=> {
      const input=event.target as HTMLInputElement;
      const control=tuningGroups.flatMap(group=>group.controls).find(control=>control.path===input.dataset.tuning);
      if(!control)return;
      const value=Number(input.value);
      if(!Number.isFinite(value)||value<control.min||value>control.max)return;
      const target=tuningTarget(this.profiles,this.style(),control.path);
      target.object[target.key]=value;
      input.parentElement!.querySelector('output')!.value=String(value);
      this.save();
    });
    // A clicked slider keeps native arrow-key adjustments; clicking the road returns driving keys.
    document.getElementById('viewport')!.addEventListener('pointerdown',()=> {
      if(this.card.contains(document.activeElement))(document.activeElement as HTMLElement).blur();
    });
  }

  refresh():void {this.render();}

  private render():void {
    this.toggle.setAttribute('aria-checked',String(this.open));
    this.card.classList.toggle('tuning-open',this.open);
    this.panel.hidden=!this.open;
    document.getElementById('route-map')!.style.display=this.open?'none':'';
    document.getElementById('route-footer')!.hidden=this.open;
    document.getElementById('tuning-style')!.textContent=this.style()==='rally'?'Rally':'Cruising';
    document.getElementById('tuning-controls')!.innerHTML=tuningGroups.map((group,index)=>`<details ${index<2?'open':''}><summary>${group.label}</summary>${group.controls.map(control=> {
      const target=tuningTarget(this.profiles,this.style(),control.path),value=target.object[target.key];
      return `<label class="tuning-control" for="tune-${control.path}"><span>${control.label}</span><output for="tune-${control.path}">${value}</output><input id="tune-${control.path}" type="range" data-tuning="${control.path}" min="${control.min}" max="${control.max}" step="${control.step}" value="${value}"></label>`;
    }).join('')}</details>`).join('');
  }

  private save():void {
    try {localStorage.setItem(storageKey,JSON.stringify(this.profiles));this.status.textContent='Saved on this device. Changes apply live.';}
    catch {this.status.textContent='Changes apply live. Copy to keep these settings.';}
    document.getElementById('tuning-export')!.hidden=true;
  }

  private async copy():Promise<void> {
    const value=JSON.stringify(this.profiles,null,2);
    try {
      await navigator.clipboard.writeText(value);
      this.status.textContent='Settings copied. Paste them into the chat.';
    } catch {
      const field=document.getElementById('tuning-export') as HTMLTextAreaElement;
      field.value=value;field.hidden=false;field.focus();field.select();
      this.status.textContent='Clipboard unavailable. Press Ctrl+C / ⌘C to copy the selected JSON.';
    }
    (document.getElementById('tuning-copy') as HTMLElement).blur();
  }
}

function loadSettings() {
  try {return restoreDrivingProfiles(JSON.parse(localStorage.getItem(storageKey)??'null'));}
  catch {return createDrivingProfiles();}
}
