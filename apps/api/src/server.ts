import { buildServer } from "./app.ts";

const port = Number(process.env.PORT ?? 3001);
const app = buildServer();

try {
  await app.listen({ host: "127.0.0.1", port });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
