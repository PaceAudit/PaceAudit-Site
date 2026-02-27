export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initDb } = await import("./lib/db");
    initDb();
    const { startScheduler } = await import("./lib/scheduler");
    startScheduler();
  }
}
