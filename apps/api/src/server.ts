import { buildServer } from "./app.ts";

const port = Number(process.env.PORT ?? 3001);
const app = buildServer();

let closing = false;

async function shutdown(signal: string): Promise<void> {
  if (closing) return;
  closing = true;
  app.log.info(`收到 ${signal}，正在关闭服务`);
  try {
    await app.close();
  } finally {
    process.exit(0);
  }
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

try {
  await app.listen({ host: "127.0.0.1", port });
} catch (error) {
  app.log.error(error);
  try {
    await app.close();
  } finally {
    process.exit(1);
  }
}
