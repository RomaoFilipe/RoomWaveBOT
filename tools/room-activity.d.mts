export function activitySettings(id:string):Promise<{enabled:boolean;ownerImvuId?:string}>;
export function saveActivitySettings(id:string,enabled:boolean,ownerImvuId?:string):Promise<{enabled:boolean;ownerImvuId?:string}>;
export function recordActivity(id:string,event:{type:string;userId?:string;name?:string;text?:string}):Promise<{stored:boolean}>;
export function clearActivity(id:string):Promise<{ok:boolean}>;
export function readActivity(id:string,query?:string,kind?:string,names?:Record<string,string>,targetUserId?:string):Promise<Array<Record<string,unknown>>>;
export function purgeActivity():Promise<void>;
