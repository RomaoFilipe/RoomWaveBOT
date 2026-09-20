export interface ActiveRoom { roomId: string; imvuRoomId: string; roomUrl: string; }
export const runtimeDirectory: URL;
export function normalizeImvuRoom(input: unknown): { imvuRoomId: string; roomUrl: string };
export function readActiveRoom(): ActiveRoom | null;
export function applyActiveRoom(): void;
export function reportBotRoom(state: string): void;
