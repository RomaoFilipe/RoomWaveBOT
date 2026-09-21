export type Visitor={id:string;name:string};
export class WelcomeTracker {
 private previous:Set<string>|null=null;
 private greeted=new Map<string,number>();
 private pending:Array<Visitor & {at:number}>=[];
 reset(){this.previous=null;this.pending=[];}
 observe(visitors:Visitor[],self:string,enabled:boolean,now=Date.now()):Visitor|null {
  const current=new Set(visitors.map(v=>v.id));
  for(const [id,at] of this.greeted)if(now-at>=600000)this.greeted.delete(id);
  if(enabled&&this.previous)for(const visitor of visitors){
   if(visitor.id!==self&&!this.previous.has(visitor.id)&&!this.greeted.has(visitor.id)&&!this.pending.some(v=>v.id===visitor.id))this.pending.push({...visitor,at:now});
  }
  this.previous=current;
  if(!enabled){this.pending=[];return null;}
  this.pending=this.pending.filter(v=>current.has(v.id)&&now-v.at<120000).slice(0,100);
  const visitor=this.pending.shift();if(visitor)this.greeted.set(visitor.id,now);
  return visitor??null;
 }
}
export function renderWelcome(template:string,visitor:string,room:string,radio:string){
 const clean=(s:string)=>s.replace(/[\r\n\u0000-\u001f]/g,' ').slice(0,100);
 return template.replace(/\{(nome|sala|radio)\}/g,(_,key:string)=>({nome:clean(visitor),sala:clean(room),radio}[key]??'')).slice(0,500);
}
