import asset from '../assets/icons.json' with { type: 'json' };

type IconName=keyof typeof asset.paths;
/** Decorative SVGs inherit the label's color; their controls retain text names. */
export function icon(name:IconName):string {
  return `<svg class="icon" viewBox="${asset.viewBox}" fill="none" stroke="currentColor" stroke-width="${asset.strokeWidth}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${asset.paths[name].map(d=>`<path d="${d}"/>`).join('')}</svg>`;
}

export function iconText(value:string):string {
  return value.replace(/\{(up|down|steer)\}/g,(_,name:'up'|'down'|'steer')=>icon(({up:'arrowUp',down:'arrowDown',steer:'arrowHorizontal'} as const)[name]));
}
