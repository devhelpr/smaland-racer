import data from '../assets/driving.json' with { type: 'json' };
export const drivingStyles=['cruising','rally'] as const;
export type DrivingStyle=typeof drivingStyles[number];
export const isDrivingStyle=(value:unknown):value is DrivingStyle=>drivingStyles.includes(value as DrivingStyle);
export const drivingProfiles=data;
