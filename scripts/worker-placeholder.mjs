const startedAt = new Date().toISOString();

console.log(
  `[worker] WA Sender campaign worker placeholder started at ${startedAt}.`,
);
console.log(
  "[worker] Replace this process with the BullMQ campaign worker before enabling real campaign execution.",
);

const heartbeat = setInterval(() => {
  console.log(`[worker] placeholder heartbeat ${new Date().toISOString()}`);
}, 60_000);

function shutdown(signal) {
  console.log(`[worker] received ${signal}, shutting down placeholder.`);
  clearInterval(heartbeat);
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
