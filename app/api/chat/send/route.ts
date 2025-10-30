import { deepseek } from "@ai-sdk/deepseek";
import { generateText } from "ai";
import { NextResponse } from "next/server";
import { publishUtf8Json } from "@/lib/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const text = (body?.text ?? "").toString();
    if (!text.trim()) {
      return NextResponse.json({ ok: false, error: "text is required" }, { status: 400 });
    }

    // 生成回答文字（最简一次性生成）
    const { text: answerText } = await generateText({
      model: deepseek("deepseek-chat"),
    system: "请使用规范的句子与正确的标点进行回答：\n- 句子应以。！？.!? 结束；\n- 中英文本应使用对应语言的标点；\n- 避免过长句子，分句清晰；\n- 不要输出半截句子。",
      prompt: text,
    });

    // 发布到 Redis，UTF-8 字节、JSON 负载
    const channel = process.env.REDIS_CHANNEL ?? "message_channel";
    await publishUtf8Json(channel, { message: answerText });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("/api/chat/send error", error);
    const message = error instanceof Error ? error.message : "unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}


