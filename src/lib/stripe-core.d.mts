export function amounts(price: number): { total: number; helper: number; fee: number };
export function verifySignature(body: string, header: string | null, secret: string, now?: number): Promise<boolean>;
