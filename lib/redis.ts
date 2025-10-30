import Redis from "ioredis";

let client: Redis | null = null;

function getEnv(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`Missing env: ${name}`);
  return v;
}

export function getRedisClient(): Redis {
  if (!client) {
    const host = getEnv("REDIS_HOST", "42.193.18.244");
    const port = Number(getEnv("REDIS_PORT", "6379"));
    const db = Number(getEnv("REDIS_DB", "0"));
    const password = getEnv("REDIS_PASSWORD", "QString01");

    client = new Redis({
      host,
      port,
      db,
      password,
      // Retry with small backoff when connection drops
      retryStrategy: (times) => {
        const delay = 100 + times * 100; // 100ms, 200ms, 300ms...
        return Math.min(delay, 2000); // cap at 2s
      },
      maxRetriesPerRequest: 3,
    });

    client.on("error", (err) => console.error("Redis Client Error", err));
    client.on("connect", () => console.log("Redis Client Connected"));
  }
  return client;
}

export async function publishUtf8Json(channel: string, obj: unknown): Promise<void> {
  const redisClient = getRedisClient();
  const json = JSON.stringify(obj);
  // 将字符串转换为 UTF-8 字节并发布
  const bytes = Buffer.from(json, "utf8");
  // ioredis 支持 Buffer，publish 会发送为二进制消息
  // 与参考 Python 逻辑（ensure_ascii=False + utf-8 bytes）保持一致
  await redisClient.publish(channel, bytes);
}


