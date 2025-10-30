import { deepseek } from "@ai-sdk/deepseek";
import { streamText, UIMessage, convertToModelMessages } from "ai";
import { publishUtf8Json } from "@/lib/redis";
// 允许最长 30s 的流式响应
export const maxDuration = 30;

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  let chunkBuffer = ""; // 用于句子累积
  const sentenceRegex = /[\s\S]*?[。！？.!?]/g;

  const result = streamText({
    // 可根据可用模型调整：例如 'deepseek-chat' 或 'deepseek-reasoner'
    model: deepseek("deepseek-chat"),
    system: "请使用规范的句子与正确的标点进行回答：\n- 句子应以。！？.!? 结束；\n- 中英文本应使用对应语言的标点；\n- 避免过长句子，分句清晰；\n- 不要输出半截句子。",
    messages: convertToModelMessages(messages),
    onChunk: async ({ chunk }) => {
      // 1. 累加本chunk
      if (chunk.type === "text-delta") {
        chunkBuffer += chunk.text || "";
      }

      // 2. 按句子正则分割
      const sentences = [...chunkBuffer.matchAll(sentenceRegex)].map(m => m[0]);
      // 3. 除去已完整的句子，留下残句
      if (sentences.length > 0) {
        chunkBuffer = chunkBuffer.slice(sentences.join("").length);
        const channel = process.env.REDIS_CHANNEL ?? "message_channel";
        // 4. 逐句异步发布到 Redis
        for (const sent of sentences) {
          await publishUtf8Json(channel, { message: sent });
        }
      }
      console.log(chunk); // 可选：保留原调试日志
    },
    onFinish: async ({ text }) => {
      // 如果最后还有未发布的残句，也发送
      try {
        const channel = process.env.REDIS_CHANNEL ?? "message_channel";
        if (chunkBuffer.trim()) {
          await publishUtf8Json(channel, { message: chunkBuffer });
        }
        await publishUtf8Json(channel, { message: text }); // 可选：全部合并内容也再发一次
      } catch (error) {
        console.error("Failed to publish to Redis:", error);
      }
    },
  });

  return result.toUIMessageStreamResponse();
}


