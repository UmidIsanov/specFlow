import type { NextFunction, Request, Response, RequestHandler } from "express";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Оборачивает async-обработчик, чтобы ошибки уходили в error middleware. */
export const ah =
  (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  (req, res, next: NextFunction) => {
    fn(req, res).catch(next);
  };
