import type { Request } from 'express';

export function getActorFromRequest(req: Request, fallback = 'Clinical User'): string {
  const header = req.headers['x-actor'];
  if (Array.isArray(header)) {
    return header[0] || fallback;
  }
  return header || fallback;
}

export function getParam(req: Request, key: string): string {
  const val = req.params[key];
  if (Array.isArray(val)) {
    return val[0] || '';
  }
  return (val as string) || '';
}
