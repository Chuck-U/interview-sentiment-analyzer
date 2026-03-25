import path from "node:path";

import { app } from "electron";
import { env } from "@huggingface/transformers";

import { logger } from "../../../lib/logger";

const log = logger.forSource("transformers-env");

env.cacheDir = path.join(app.getPath("userData"), "models");
env.allowRemoteModels = true;
env.allowLocalModels = true;
env.useFSCache = true;
env.useBrowserCache = false;

log.ger({
  type: "info",
  message: "Transformers.js env: filesystem cache and Hub access configured",
  data: {
    cacheDir: env.cacheDir,
    useFSCache: env.useFSCache,
    useBrowserCache: env.useBrowserCache,
    allowRemoteModels: env.allowRemoteModels,
    allowLocalModels: env.allowLocalModels,
  },
});

export { env };
