export function activitySettings(id:string):Promise<{enabled:boolean}>;
export function saveActivitySettings(id:string,enabled:boolean):Promise<{enabled:boolean}>;
export function recordActivity(id:string,event:{type:string;userId?:string;name?:string;text?:string}):Promise<{stored:boolean}>;
export function clearActivity(id:string):Promise<{ok:boolean}>;
export function readActivity(id:string,query?:string,kind?:string):Promise<Array<Record<string,unknown>>>;
export function purgeActivity():Promise<void>;
