import express from "express";
import cors from "cors";
import { ZodError } from "zod";
import { HttpError } from "./lib/http.js";
import { projectsRouter, suppliersRouter } from "./routes/projects.js";
import { specRouter } from "./routes/spec.js";
import { offersRouter } from "./routes/offers.js";
import { supplyRouter } from "./routes/supply.js";
import { auditRouter } from "./routes/audit.js";
import { exportRouter } from "./routes/export.js";
import { authRouter } from "./routes/auth.js";
import { membersRouter } from "./routes/members.js";
import { ownerOf, requireAuth, requireProject, requireProjectOf } from "./lib/auth.js";

const app = express();

// В работе интерфейс и API живут на одном адресе, CORS не нужен вовсе;
// список нужен для разработки, где интерфейс на 3001, а API на 4000.
const origins = (process.env.WEB_ORIGIN ?? "http://localhost:3000,http://localhost:3001")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);
app.use(cors({ origin: origins, credentials: true }));
app.use(express.json({ limit: "10mb" }));
app.set("trust proxy", 1); // за шлюзом, иначе в сессиях окажется адрес шлюза

app.get("/api/health", (_req, res) => res.json({ ok: true, service: "pozitsiya-server" }));
app.use("/api/auth", authRouter);

// Ниже — только для вошедших. Порядок важен: вход и health стоят выше.
app.use("/api", requireAuth);

// Доступ к объекту проверяем один раз на входе в путь, а не в каждом обработчике.
app.use("/api/projects/:projectId", requireProject("projectId"));
app.use("/api/offers/:id", requireProjectOf(ownerOf.offer));
app.use("/api/offer-items/:id", requireProjectOf(ownerOf.offerItem));
app.use("/api/spec-items/:id", requireProjectOf(ownerOf.specItem));
app.use("/api/acts/:id", requireProjectOf(ownerOf.act));
app.use("/api/deliveries/:id", requireProjectOf(ownerOf.delivery));

app.use("/api/projects", projectsRouter);
app.use("/api/suppliers", suppliersRouter);
app.use("/api", membersRouter);
app.use("/api", specRouter);
app.use("/api", offersRouter);
app.use("/api", supplyRouter);
app.use("/api", auditRouter);
app.use("/api", exportRouter);

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
app.listen(port, () => console.log(`Позиция API → http://localhost:${port}`));
