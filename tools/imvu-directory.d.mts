export interface ImvuUser {kind:string;id:string;username:string;displayName:string;created:string|null;tagline:string|null;isCreator:boolean;isVip:boolean;profileUrl:string;source:string;fetchedAt:string}
export interface ImvuRoom {kind:string;id:string;name:string;description:string|null;ownerId:string;ownerName:string|null;capacity:number|null;occupancy:number|null;privacy:string|null;language:string|null;isAp:boolean;isVip:boolean;roomUrl:string;source:string;fetchedAt:string}
export function lookupUser(input:string):Promise<ImvuUser>;
export function lookupRoom(input:string):Promise<ImvuRoom>;
export function lookupProfile(query:string):Promise<ImvuUser & {followers:number|null;following:number|null}>;
export function lookupCatalog(query:string):Promise<Record<string,unknown>>;
export function lookupOutfits(query:string):Promise<Record<string,unknown>>;
export function lookupRooms(query:string):Promise<Record<string,unknown>>;
