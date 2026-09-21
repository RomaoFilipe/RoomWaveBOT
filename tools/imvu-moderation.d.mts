export interface Authority {ownerId:string;moderators:string[]}
export function moderationAuthority(roomId:string,get?:(url:string)=>Promise<any>):Promise<Authority>;
export function checkModeration(authority:Authority,actorId:string,targetId:string,botId:string,action:string):void;
