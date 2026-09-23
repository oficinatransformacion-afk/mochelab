import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(__dirname, "../../../.env.local"), quiet: true });
config({ path: resolve(__dirname, "../../../.env"), quiet: true });
