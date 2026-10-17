/** Pointer hold cadence uses active game time; no queued timers survive pause. */
export class HoldDrop {
  constructor(drop,{delay=.45,interval=.36}={}){this.drop=drop;this.delay=delay;this.interval=interval;this.cancel();}
  begin(id,x){if(this.id!==null)return false;this.id=id;this.x=x;this.age=0;this.next=this.delay;this.repeated=false;return true;}
  move(id,x){if(id===this.id)this.x=x;}
  update(dt){if(this.id===null)return;this.age+=Math.min(.1,Math.max(0,dt));if(this.age>=this.next){this.repeated=true;this.drop(this.x);this.next=this.age+this.interval;}}
  end(id,x){if(id!==this.id)return false;if(!this.repeated)this.drop(x);this.cancel();return true;}
  cancel(){this.id=null;this.age=0;this.repeated=false;}
}

