let reader:((id:string)=>Promise<boolean>)|null=null;
export function setPresenceReader(value:typeof reader){reader=value;}
export async function isInCurrentRoom(id:string){if(!reader)throw new Error('PRESENCE_UNAVAILABLE');return reader(id);}
