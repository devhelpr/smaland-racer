import volvo from '../assets/vehicle.json' with { type: 'json' };
import tiguan from '../assets/vehicles/tiguan-2022.json' with { type: 'json' };
import volvoMaterials from '../assets/materials/vehicle.json' with { type: 'json' };
import tiguanMaterials from '../assets/materials/tiguan-2022.json' with { type: 'json' };
import catalog from '../assets/vehicles/catalog.json' with { type: 'json' };
import type { VehicleAsset } from './vehicle-model.ts';

const definitions = {
  'volvo-240': {asset:volvo as VehicleAsset,materials:volvoMaterials},
  'tiguan-2022': {asset:tiguan as VehicleAsset,materials:tiguanMaterials},
};
export type VehicleId = keyof typeof definitions;
export const isVehicleId = (value:unknown):value is VehicleId => typeof value==='string'&&Object.hasOwn(definitions,value);
export const vehicles = catalog.filter((entry):entry is typeof entry & {id:VehicleId}=>isVehicleId(entry.id));
export const vehicleDefinition = (id:VehicleId) => definitions[id];
