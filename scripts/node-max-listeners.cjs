const events = require("node:events");

events.defaultMaxListeners = Math.max(events.defaultMaxListeners || 10, 50);
process.setMaxListeners(50);
