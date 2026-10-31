import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Course,courses } from '../src/track.ts';
import { Traffic } from '../src/traffic.ts';
import { CollisionWorld } from '../src/collision.ts';
import { disposeGroup } from '../src/dispose.ts';

function setup(x:number,heading:number) {
  const course=new Course({...courses[0],setting:'holmahult',closed:false,width:8.2,points:[[0,0],[0,300],[0,600]],hills:0,lakes:[]});
  const root=new THREE.Group(),world=new CollisionWorld(),traffic=new Traffic(course,world,root),farmer=traffic.vehicles.find(v=>v.aggressive)!;
  for(const other of traffic.vehicles)if(other!==farmer){other.active=false;other.collider.active=false;}
  farmer.distance=150;farmer.driveDistance=150;farmer.drive.position.set(x,0,150);farmer.drive.heading=heading;farmer.drive.steering=0;
  farmer.velocity.set(0,0,0);farmer.previousVelocity.set(0,0,0);farmer.speed=0;farmer.angularVelocity=0;farmer.acceleration=0;farmer.laneOffset=x;
  farmer.mesh.position.copy(farmer.drive.position);farmer.collider.x=x;farmer.collider.z=150;farmer.collider.angle=heading;
  return {course,root,world,traffic,farmer,player:new THREE.Vector3(0,0,175)};
}

for(const rate of [30,120])for(const side of [-1,1])test(`farmer rejoins from the ${side<0?'left':'right'} shoulder without chasing across the verge at ${rate}Hz`,()=>{
  const s=setup(side*12,side*Math.PI/2),{farmer,traffic,player}=s;
  let reached=false,maxJump=0,gearChanges=0,gear=farmer.gear;
  for(let i=0;i<rate*30;i++) {
    const before=farmer.drive.position.clone(),speed=farmer.velocity.length();
    traffic.update(1/rate,player,new THREE.Vector3());
    maxJump=Math.max(maxJump,farmer.drive.position.distanceTo(before)-(speed+1)/rate);
    if(gear!==farmer.gear){gearChanges++;gear=farmer.gear;}
    if(Math.abs(farmer.laneOffset-1.804)<.5&&Math.abs(farmer.drive.heading)<.3){reached=true;break;}
  }
  assert.ok(reached,`driver returns to the correct lane facing along the road: ${farmer.drive.position.toArray()}, heading ${farmer.drive.heading}`);
  assert.ok(maxJump<.05,'rejoining only integrates the existing physical velocity');
  assert.ok(gearChanges<8,'driver commits to manoeuvres instead of endlessly changing gear');
  disposeGroup(s.root);
});

for(const rate of [30,120])test(`farmer chooses a clear manoeuvre around an obstacle between it and the road at ${rate}Hz`,()=>{
  const s=setup(12,-Math.PI/2),{farmer,traffic,player,world}=s;
  world.add({id:'return-wall',kind:'building',x:7,z:153,radius:4,halfX:.6,halfZ:3,angle:0});
  let reached=false;
  for(let i=0;i<rate*35;i++) {
    traffic.update(1/rate,player,new THREE.Vector3());
    assert.ok(!(farmer.drive.position.x>6.4&&farmer.drive.position.x<7.6&&farmer.drive.position.z>150&&farmer.drive.position.z<156),'body does not drive through the return obstacle');
    if(Math.abs(farmer.laneOffset-1.804)<.6&&Math.abs(farmer.drive.heading)<.35){reached=true;break;}
  }
  assert.ok(reached,`driver gets around the wall and rejoins: ${farmer.drive.position.toArray()}, heading ${farmer.drive.heading}`);
  disposeGroup(s.root);
});

test('farmer backs away from a blocked nose while checking the space behind it',()=>{
  const s=setup(10,0),{farmer,traffic,player,world}=s;
  world.add({id:'front-wall',kind:'building',x:10,z:154,radius:4,halfX:3,halfZ:.6,angle:0});
  let reversed=false,escaped=false;
  for(let i=0;i<120*35;i++) {
    traffic.update(1/120,player,new THREE.Vector3());
    if(farmer.speed<-.5)reversed=true;
    if(farmer.drive.position.x<4&&Math.abs(farmer.drive.heading)<.4){escaped=true;break;}
  }
  assert.ok(reversed,'driver uses a checked reverse manoeuvre to create turning room');
  assert.ok(escaped,`driver then steers back toward the road: ${farmer.drive.position.toArray()}, heading ${farmer.drive.heading}`);
  disposeGroup(s.root);
});

test('farmer waits when a player blocks its reverse escape, then rejoins after that space clears',()=>{
  const s=setup(10,0),{farmer,traffic,player,world}=s;
  world.add({id:'front-wall',kind:'building',x:10,z:154,radius:4,halfX:3,halfZ:.6,angle:0});
  player.set(10,0,145);
  for(let i=0;i<120*4;i++) {
    traffic.update(1/120,player,new THREE.Vector3());
    assert.ok(farmer.drive.position.z>=149,'driver does not back into the player blocking its escape');
  }
  player.set(0,0,190);
  let escaped=false;
  for(let i=0;i<120*30;i++) {
    traffic.update(1/120,player,new THREE.Vector3());
    if(Math.abs(farmer.laneOffset-1.804)<.6&&Math.abs(farmer.drive.heading)<.35){escaped=true;break;}
  }
  assert.ok(escaped,'clearing the rear escape makes a safe road return possible');
  disposeGroup(s.root);
});

test('farmer plans its road return around water rather than repeatedly driving into the bank',()=>{
  const s=setup(12,-Math.PI/2),{farmer,traffic,player,course}=s;
  course.inWater=(x,z)=>x>5&&x<8&&z>147&&z<156;
  let reached=false;
  for(let i=0;i<120*35;i++) {
    traffic.update(1/120,player,new THREE.Vector3());
    assert.equal(course.inWater(farmer.drive.position.x,farmer.drive.position.z),false);
    if(Math.abs(farmer.laneOffset-1.804)<.6&&Math.abs(farmer.drive.heading)<.35){reached=true;break;}
  }
  assert.ok(reached,'driver uses dry ground around the bank to rejoin the road');
  disposeGroup(s.root);
});

for(const rate of [30,120])test(`farmer turns around on the road before approaching the player forwards at ${rate}Hz`,()=>{
  const s=setup(1.804,Math.PI),{farmer,traffic,player}=s;
  player.z=190;
  let recovered=false,approached=false;
  for(let i=0;i<rate*40;i++) {
    traffic.update(1/rate,player,new THREE.Vector3(0,0,4));
    if(farmer.speed<-.5)assert.equal(farmer.navigation!.mode,'rejoin','reverse only creates manoeuvring room');
    if(farmer.navigation!.mode==='chase'&&Math.abs(farmer.drive.heading)<.3&&farmer.gear===1)recovered=true;
    if(farmer.drive.position.distanceTo(player)<5&&farmer.speed>0){approached=true;break;}
  }
  assert.ok(recovered,`wrong-way heading triggers road alignment before pursuit resumes: ${farmer.drive.position.toArray()}, heading ${farmer.drive.heading}, mode ${farmer.navigation!.mode}, speed ${farmer.speed}, gear ${farmer.gear}`);
  assert.ok(approached,`driver approaches forwards after the turn: ${farmer.drive.position.toArray()}, heading ${farmer.drive.heading}`);
  disposeGroup(s.root);
});

for(const rate of [30,120])test(`farmer also uses a checked recovery manoeuvre when blocked on the road at ${rate}Hz`,()=>{
  const s=setup(1.804,0),{farmer,traffic,player,world}=s;
  player.z=230;
  world.add({id:'road-wall',kind:'building',x:1.804,z:154,radius:4,halfX:3,halfZ:.6,angle:0});
  let escaped=false;
  for(let i=0;i<rate*40;i++) {
    traffic.update(1/rate,player,new THREE.Vector3(0,0,4));
    if(farmer.speed<-.5)assert.equal(farmer.navigation!.mode,'rejoin');
    if(farmer.drive.position.z>160&&farmer.gear===1&&Math.abs(farmer.laneOffset-1.804)<.6&&Math.abs(farmer.drive.heading)<.35){escaped=true;break;}
  }
  assert.ok(escaped,`driver creates room and passes the obstacle forwards: ${farmer.drive.position.toArray()}, heading ${farmer.drive.heading}`);
  disposeGroup(s.root);
});
