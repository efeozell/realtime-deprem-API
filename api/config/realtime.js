import { Realtime } from "@upstash/realtime";
import { ENV } from "./env";

if (!globalThis.__UPSTASH_REALTIME_CLIENT) {
  globalThis.__UPSTASH_REALTIME_CLIENT = new Realtime({
    url: ENV.UPSTASH_REDIS_REST_URL,
    token: ENV.UPSTASH_REDIS_REST_TOKEN,
  });
}

export const realtime = globalThis.__UPSTASH_REALTIME_CLIENT;
export default realtime;
