import data from '../assets/driving.json' with { type: 'json' };
import tuning from '../assets/tuning.json' with { type: 'json' };
export const drivingStyles=['cruising','rally'] as const;
export type DrivingStyle=typeof drivingStyles[number];
export const isDrivingStyle=(value:unknown):value is DrivingStyle=>drivingStyles.includes(value as DrivingStyle);
export type DrivingProfiles=typeof data;
export const drivingProfiles:DrivingProfiles=data;
export const tuningGroups=tuning;
export const createDrivingProfiles=():DrivingProfiles=>structuredClone(data);

export function tuningTarget(profiles:DrivingProfiles,style:DrivingStyle,path:string):{object:Record<string,number>;key:string} {
  const parts=path.split('.');
  const root=parts[0]==='ice'?profiles:profiles[style];
  const key=parts.pop()!;
  let object:unknown=root;
  for(const part of parts)object=(object as Record<string,unknown>)[part];
  return {object:object as Record<string,number>,key};
}

/** Only accept known finite settings within the same bounds used by the sliders. */
export function restoreDrivingProfiles(value:unknown):DrivingProfiles {
  const profiles=createDrivingProfiles();
  if(!value||typeof value!=='object')return profiles;
  for(const style of drivingStyles)for(const group of tuning)for(const control of group.controls) {
    try {
      const source=tuningTarget(value as DrivingProfiles,style,control.path);
      const number=source.object[source.key];
      if(typeof number!=='number'||!Number.isFinite(number)||number<control.min||number>control.max)continue;
      const target=tuningTarget(profiles,style,control.path);target.object[target.key]=number;
    } catch { /* Older or partial settings retain defaults for missing fields. */ }
  }
  return profiles;
}
