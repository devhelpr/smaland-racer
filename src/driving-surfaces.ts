import * as THREE from 'three';

interface Triangle {
  ax:number;ay:number;az:number;bx:number;by:number;bz:number;cx:number;cy:number;cz:number;denominator:number;
}

/** Sample the rendered road triangles without raycasting every road on each physics step. */
export class DrivingSurfaces {
  private readonly cells=new Map<string,Triangle[]>();
  private readonly cellSize:number;
  constructor(cellSize:number) {this.cellSize=cellSize;}

  clear():void {this.cells.clear();}

  add(mesh:THREE.Mesh):void {
    mesh.updateWorldMatrix(true,false);
    const positions=mesh.geometry.getAttribute('position'),indices=mesh.geometry.index;
    const count=indices?.count??positions.count;
    const point=(i:number)=>new THREE.Vector3().fromBufferAttribute(positions,indices?indices.getX(i):i).applyMatrix4(mesh.matrixWorld);
    for(let i=0;i<count;i+=3) {
      const a=point(i),b=point(i+1),c=point(i+2);
      const denominator=(b.z-c.z)*(a.x-c.x)+(c.x-b.x)*(a.z-c.z);
      if(Math.abs(denominator)<Number.EPSILON)continue;
      const triangle={ax:a.x,ay:a.y,az:a.z,bx:b.x,by:b.y,bz:b.z,cx:c.x,cy:c.y,cz:c.z,denominator};
      const minX=Math.floor(Math.min(a.x,b.x,c.x)/this.cellSize),maxX=Math.floor(Math.max(a.x,b.x,c.x)/this.cellSize);
      const minZ=Math.floor(Math.min(a.z,b.z,c.z)/this.cellSize),maxZ=Math.floor(Math.max(a.z,b.z,c.z)/this.cellSize);
      for(let x=minX;x<=maxX;x++)for(let z=minZ;z<=maxZ;z++) {
        const key=`${x}:${z}`;
        if(!this.cells.has(key))this.cells.set(key,[]);
        this.cells.get(key)!.push(triangle);
      }
    }
  }

  heightAt(x:number,z:number,terrainHeight:number):number {
    let height=terrainHeight;
    for(const t of this.cells.get(`${Math.floor(x/this.cellSize)}:${Math.floor(z/this.cellSize)}`)??[]) {
      const a=((t.bz-t.cz)*(x-t.cx)+(t.cx-t.bx)*(z-t.cz))/t.denominator;
      const b=((t.cz-t.az)*(x-t.cx)+(t.ax-t.cx)*(z-t.cz))/t.denominator;
      const c=1-a-b;
      if(a>=-1e-7&&b>=-1e-7&&c>=-1e-7)height=Math.max(height,a*t.ay+b*t.by+c*t.cy);
    }
    return height;
  }
}
