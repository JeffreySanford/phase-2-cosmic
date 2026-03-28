const frontendPort =
  process.env.PORT ?? process.env.FRONTEND_PORT ?? "4000";

module.exports = {
  "/api": {
    target: `http://127.0.0.1:${frontendPort}`,
    secure: false,
    changeOrigin: true,
    logLevel: "warn",
  },
};
