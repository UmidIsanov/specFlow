import express from "express";
import cors from "cors";
import { ZodError } from "zod";
import { HttpError } from "./lib/http.js";
import { projectsRouter, suppliersRouter } from "./routes/projects.js";
import { specRouter } from "./routes/spec.js";
import { offersRouter } from "./routes/offers.js";
import { supplyRouter } from "./routes/supply.js";
import { auditRouter } from "./routes/audit.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

app.get("/api/health", (_req, res) => res.json({ ok: true, service: "specflow-server" }));
app.use("/api/projects", projectsRouter);
app.use("/api/suppliers", suppliersRouter);
app.use("/api", specRouter);
app.use("/api", offersRouter);
app.use("/api", supplyRouter);
app.use("/api", auditRouter);

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: "Ошибка валидации", details: err.issues });
  }
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message });
  }
  console.error(err);
  const message = err instanceof Error ? err.message : "Внутренняя ошибка";
  res.status(500).json({ error: message });
});

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => console.log(`SpecFlow API → http://localhost:${port}`));
