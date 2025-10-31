import { deepseek } from "@ai-sdk/deepseek";
import { streamText, UIMessage, convertToModelMessages } from "ai";
import { publishUtf8Json } from "@/lib/redis";
// 允许最长 30s 的流式响应
export const maxDuration = 30;

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  let chunkBuffer = ""; // 用于句子累积

  const result = streamText({
    // 可根据可用模型调整：例如 'deepseek-chat' 或 'deepseek-reasoner'
    model: deepseek("deepseek-chat"),
    system: "请使用规范的句子与正确的标点进行回答：\n- 句子应以。！？.!? 结束；\n- 中英文本应使用对应语言的标点；\n- 避免过长句子，分句清晰；\n- 不要输出半截句子。",
    messages: convertToModelMessages(messages),
    
    onChunk: async ({ chunk }) => {
      // 1. 累加本chunk
      if (chunk.type === "text-delta" ) {
        chunkBuffer += chunk.text || "";
      }

      // 2. 查找累计至少50个字符且以句号结尾的块
      const match = chunkBuffer.match(/[\s\S]{20,}?[。！？.!?]/);
      if (match) {
        const messageToSend = match[0];
        chunkBuffer = chunkBuffer.slice(messageToSend.length);
        const channel = process.env.REDIS_CHANNEL ?? "message_channel";
        console.log("sent", messageToSend);
        await publishUtf8Json(channel, { message: messageToSend });
      }
    },
    onFinish: async ({ text }) => {
      // 发送最后剩余的不足50字符的内容
      const channel = process.env.REDIS_CHANNEL ?? "message_channel";
      if (chunkBuffer.trim()) {
        await publishUtf8Json(channel, { message: chunkBuffer });
      }
    },
  });

  return result.toUIMessageStreamResponse();
}


