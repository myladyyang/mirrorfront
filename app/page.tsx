"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";

import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation';
import {
  Message,
  MessageContent,
} from '@/components/ai-elements/message';
import { Response } from '@/components/ai-elements/response';
import { Actions, Action } from '@/components/ai-elements/actions';
import {
  PromptInput,
  PromptInputHeader,
  PromptInputAttachments,
  PromptInputAttachment,
  PromptInputBody,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputTools,
  PromptInputButton,
  PromptInputSubmit,
  type PromptInputMessage,
} from '@/components/ai-elements/prompt-input';
import { Sources, SourcesTrigger, SourcesContent, Source } from '@/components/ai-elements/sources';
import { Reasoning, ReasoningTrigger, ReasoningContent } from '@/components/ai-elements/reasoning';
import { Loader } from '@/components/ai-elements/loader';
import { CopyIcon, RefreshCcw, MessageCircle, X, Play } from 'lucide-react';


export default function Home() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const defaultWhepUrl = "http://42.193.18.244:1985/rtc/v1/whep/?app=demo&stream=demo";
  const [isPlaying, setIsPlaying] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [showWelcome, setShowWelcome] = useState(true);

  const [input, setInput] = useState("");
  const [showConversation, setShowConversation] = useState(false);
  const { messages, sendMessage, status, regenerate } = useChat();

  const [playError, setPlayError] = useState<string | null>(null);
  const [playStep, setPlayStep] = useState<string>("idle");

  type SourceUrlPart = { type: 'source-url'; url: string };
  type TextPart = { type: 'text'; text: string };
  type ReasoningPart = { type: 'reasoning'; text: string };
  type Part = SourceUrlPart | TextPart | ReasoningPart;

  const isSourceUrlPart = (p: Part): p is SourceUrlPart => p.type === 'source-url';
  // helpers for future use (text/reasoning)

  const stopPlayback = useCallback(() => {
    setIsPlaying(false);
    const pc = pcRef.current;
    pcRef.current = null;
    if (pc) {
      try {
        pc.getTransceivers().forEach((t) => t.stop?.());
        pc.close();
        console.info("[WHEP] RTCPeerConnection closed");
      } catch (err) {
        console.error("[WHEP] stopPlayback error", err);
      }
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  useEffect(() => () => stopPlayback(), [stopPlayback]);

  // Welcome timer - hide welcome screen after 3 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowWelcome(false);
    }, 3000);

    return () => clearTimeout(timer);
  }, []);

  const startPlayback = useCallback(async () => {
    if (isStarting) return;
    setIsStarting(true);
    setPlayError(null);
    setPlayStep("init");
    try {
      stopPlayback();
      const pc = new RTCPeerConnection();
      pcRef.current = pc;
      console.info("[WHEP] RTCPeerConnection created");

      // 状态日志
      pc.onsignalingstatechange = () => console.debug("[WHEP] signalingState:", pc.signalingState);
      pc.onicegatheringstatechange = () => console.debug("[WHEP] iceGatheringState:", pc.iceGatheringState);
      pc.oniceconnectionstatechange = () => console.debug("[WHEP] iceConnectionState:", pc.iceConnectionState);
      pc.onconnectionstatechange = () => console.debug("[WHEP] connectionState:", pc.connectionState);
      pc.onicecandidate = (ev) => {
        console.debug("[WHEP] onicecandidate:", ev.candidate ? "candidate" : "null (end)");
      };

      const stream = new MediaStream();
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      {
        const cs = String(pc.connectionState);
        const ics = String(pc.iceConnectionState);
        if (cs === "failed" || cs === "disconnected" || ics === "closed" || ics === "failed" || ics === "disconnected") return; // 防御：失败/断开/关闭时中止
      }
      console.debug("[WHEP] addTransceiver(audio, recvonly)");
      pc.addTransceiver("audio", { direction: "recvonly" });
      console.debug("[WHEP] addTransceiver(video, recvonly)");
      pc.addTransceiver("video", { direction: "recvonly" });
      pc.ontrack = (event) => {
        const incoming = event.streams[0];
        if (incoming) {
          incoming.getTracks().forEach((track) => {
            stream.addTrack(track);
            console.debug("[WHEP] added track:", track.kind, track.label || "unnamed", track.enabled ? "enabled" : "disabled");
          });
        }
        console.debug("[WHEP] ontrack: added", incoming?.getTracks().length ?? 0, "track(s)");
        if (videoRef.current) {
          void videoRef.current.play().catch((err) => {
            console.warn("[WHEP] video.play error", err);
          });
        }
      };

      const offer = await pc.createOffer();
      console.debug("[WHEP] created offer, sdp length:", offer.sdp?.length ?? 0);
      {
        const cs = String(pc.connectionState);
        const ics = String(pc.iceConnectionState);
        if (cs === "failed" || cs === "disconnected" || ics === "closed" || ics === "failed" || ics === "disconnected") return;
      }
      await pc.setLocalDescription(offer);
      console.debug("[WHEP] setLocalDescription ok");
      setPlayStep("offer-sent");

      // WHEP: POST SDP offer, expect SDP answer in body
      console.debug("[WHEP] POST to", defaultWhepUrl);
      const ac = new AbortController();
      const timeout = setTimeout(() => ac.abort(), 10000);
      let resp: Response;
      try {
        resp = await fetch(defaultWhepUrl, {
          method: "POST",
          headers: { "content-type": "application/sdp" },
          body: offer.sdp ?? "",
          signal: ac.signal,
        });
      } finally {
        clearTimeout(timeout);
      }
      console.debug("[WHEP] POST WHEP status:", resp.status);
      if (!resp.ok) throw new Error(`WHEP failed: ${resp.status}`);
      const answerSdp = await resp.text();
      console.debug("[WHEP] received answer, sdp length:", answerSdp.length);
      {
        const cs = String(pc.connectionState);
        const ics = String(pc.iceConnectionState);
        if (pcRef.current !== pc || cs === "failed" || cs === "disconnected" || ics === "closed" || ics === "failed" || ics === "disconnected") return; // 已被停止或替换
      }
      await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });
      console.debug("[WHEP] setRemoteDescription ok");
      setPlayStep("answer-applied");

      setIsPlaying(true);
      console.info("[WHEP] playback started");
    } catch (err) {
      console.error("[WHEP] startPlayback error", err);
      setPlayError(err instanceof Error ? err.message : String(err));
      // 发生错误时确保清理连接，避免 closed 状态残留导致后续报错
      stopPlayback();
    } finally {
      setIsStarting(false);
    }
  }, [stopPlayback, isStarting]);




  const handleSubmit = (message: PromptInputMessage) => {
    const hasText = Boolean(message.text);
    const hasAttachments = Boolean(message.files?.length);
    if (!(hasText || hasAttachments)) return;
    sendMessage(
      {
        text: message.text || 'Sent with attachments',
        files: message.files,
      },
    );
    setInput("");
  };

  return (
    <div className="h-screen flex flex-col bg-white dark:bg-zinc-900 relative overflow-hidden">

      {/* Welcome Screen */}
      {showWelcome && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black transition-opacity duration-1000">
          <div className="text-center text-white space-y-8 animate-pulse">
            <div className="space-y-4">
              <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight">Mirror AI</h1>
              <p className="text-lg sm:text-xl md:text-2xl text-gray-300 font-light">视频对话助手</p>
            </div>
            <div className="flex justify-center space-x-2 pt-4">
              <div className="w-3 h-3 bg-white rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
              <div className="w-3 h-3 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
              <div className="w-3 h-3 bg-gray-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className={`h-full flex flex-col transition-opacity duration-1000 ${showWelcome ? 'opacity-0' : 'opacity-100'}`}>
      {/* WHEP 播放器 */}
      <div className="shrink-0 flex-1 relative w-full group max-w-md mx-auto sm:max-w-lg md:max-w-xl lg:max-w-2xl">
        <video
          ref={videoRef}
          className="w-full h-full bg-black object-cover"
          playsInline
          controls
        />

        {/* Red Play Button Overlay */}
        {!isPlaying && !isStarting && (
          <button
            onClick={() => startPlayback()}
            className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-black/20"
            type="button"
          >
            <div className="bg-red-600 hover:bg-red-700 text-white rounded-full p-4 sm:p-5 md:p-6 transition-colors duration-200 shadow-lg">
              <Play size={32} fill="white" className="ml-1" />
            </div>
          </button>
        )}

        {/* Loading Overlay */}
        {isStarting && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <div className="text-white text-base sm:text-lg">连接中...</div>
          </div>
        )}

        {/* Step/Error HUD */}
        <div className="absolute bottom-2 left-2 right-2 flex flex-col gap-1 pointer-events-none">
          <div className="text-[11px] text-white/80">step: {playStep}</div>
          {playError && <div className="text-[11px] text-red-400">error: {playError}</div>}
        </div>
      </div>

  
      {/* Conversation Modal */}
      {showConversation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-zinc-200 dark:border-zinc-800">
              <h2 className="text-lg font-semibold">对话记录</h2>
              <button
                onClick={() => setShowConversation(false)}
                className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                type="button"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-4">
              <Conversation className="h-full">
                <ConversationContent>
                  {messages.map((message, mIdx) => (
                    <div key={message.id}>
                      {message.role === 'assistant' && (message.parts as unknown as Part[]).filter(isSourceUrlPart).length > 0 && (
                        <Sources>
                          <SourcesTrigger
                            count={(message.parts as unknown as Part[]).filter(isSourceUrlPart).length}
                          />
                          {(message.parts as unknown as Part[]).filter(isSourceUrlPart).map((part, i: number) => (
                            <SourcesContent key={`${message.id}-${i}`}>
                              <Source href={(part as SourceUrlPart).url} title={(part as SourceUrlPart).url} />
                            </SourcesContent>
                          ))}
                        </Sources>
                      )}

                      {(message.parts as unknown as Part[]).map((part, i: number) => {
                        switch (part.type) {
                          case 'text':
                            return (
                              <div key={`${message.id}-${i}`}>
                                <Message from={message.role}>
                                  <MessageContent>
                                    <Response>{(part as TextPart).text}</Response>
                                  </MessageContent>
                                </Message>
                                {message.role === 'assistant' && mIdx === messages.length - 1 && (
                                  <Actions className="mt-2">
                                    <Action onClick={() => regenerate()} label="Retry">
                                      <RefreshCcw className="size-3" />
                                    </Action>
                                    <Action onClick={() => navigator.clipboard.writeText((part as TextPart).text)} label="Copy">
                                      <CopyIcon className="size-3" />
                                    </Action>
                                  </Actions>
                                )}
                              </div>
                            );
                          case 'reasoning':
                            return (
                              <Reasoning
                                key={`${message.id}-${i}`}
                                className="w-full"
                                isStreaming={status === 'streaming' && i === message.parts.length - 1 && message.id === messages.at(-1)?.id}
                              >
                                <ReasoningTrigger />
                                <ReasoningContent>{(part as ReasoningPart).text}</ReasoningContent>
                              </Reasoning>
                            );
                          default:
                            return null;
                        }
                      })}
                    </div>
                  ))}

                  {status === 'submitted' && <Loader />}
                </ConversationContent>
                <ConversationScrollButton />
              </Conversation>
            </div>
          </div>
        </div>
      )}

      {/* Prompt Input */}
      <div className="shrink-0 p-3 sm:p-4">
        <div className="max-w-md mx-auto sm:max-w-lg md:max-w-xl lg:max-w-2xl">
          <PromptInput onSubmit={handleSubmit} className="w-full" globalDrop multiple>
            <PromptInputHeader>
              <PromptInputAttachments>
                {(attachment) => <PromptInputAttachment data={attachment} />}
              </PromptInputAttachments>
            </PromptInputHeader>
            <PromptInputBody>
              <PromptInputTextarea onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setInput(e.target.value)} value={input} placeholder="你好，让我们开始对话吧!" />
            </PromptInputBody>
            <PromptInputFooter>
              <PromptInputTools>
                <PromptInputButton
                  onClick={() => setShowConversation(!showConversation)}
                  className="flex items-center gap-2"
                >
                  <MessageCircle size={16} />
                  <span className="text-sm">对话记录 ({messages.length})</span>
                  {messages.filter(m => m.role === 'assistant').length > 0 && (
                    <span className="px-2 py-1 bg-blue-500 text-white text-xs rounded-full">
                      {messages.filter(m => m.role === 'assistant').length}
                    </span>
                  )}
                </PromptInputButton>
               
              </PromptInputTools>
              <PromptInputSubmit disabled={!input && !status} status={status} />
            </PromptInputFooter>
          </PromptInput>
        </div>
      </div>
      </div>
    </div>
  );
}
