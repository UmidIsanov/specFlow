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

/**
 * Имя загруженного файла. Браузер шлёт его в UTF-8, а multer отдаёт байты как latin-1 —
 * без этого русские названия превращаются в «ÐÐ°ÑÐ²ÐºÐ°».
 */
export function originalName(file?: { originalname?: string }): string {
  const raw = file?.originalname ?? "";
  if (!/[\u00c0-\u00ff]/.test(raw)) return raw;
  try {
    const fixed = Buffer.from(raw, "latin1").toString("utf8");
    return /\ufffd/.test(fixed) ? raw : fixed;
  } catch {
    return raw;
  }
}
