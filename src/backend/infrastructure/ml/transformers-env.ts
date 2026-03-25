import path from "node:path";

import { app } from "electron";
import { env } from "@huggingface/transformers";

env.cacheDir = path.join(app.getPath("userData"), "models");
env.allowRemoteModels = true;
env.allowLocalModels = true;
env.useFSCache = true;
env.useBrowserCache = false;

export { env };
