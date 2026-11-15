"use client"

import { useChat } from "@ai-sdk/react"
import type { TriggerChatTransport } from "@trigger.dev/sdk/chat"
import {
  type InferChatUIMessage,
  useLoadTranscript,
  useTriggerChatTransport,
} from "@trigger.dev/sdk/chat/react"
import { getToolName, isToolUIPart } from "ai"
import { SquareIcon } from "lucide-react"
import Image from "next/image"
import { useRef, useState } from "react"

import {
  loadChatTranscript,
  mintChatAccessToken,
  startChatSession,
} from "@/actions/chat"
import type { teammateChat } from "@/trigger/chat"
import type { ChatBotProfile } from "@/lib/db/schema"
import { ChatAvatar } from "@/components/chat-avatar"

import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation"
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message"
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
  type ToolPart,
} from "@/components/ai-elements/tool"
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSelect,
  PromptInputSelectContent,
  PromptInputSelectItem,
  PromptInputSelectTrigger,
  PromptInputSelectValue,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { SelectGroup } from "@/components/ui/select"

const providers = [
  { value: "google", label: "Gemini 3.6 Flash" },
  { value: "groq", label: "GPT OSS 120B" },
] as const

type ChatMessage = InferChatUIMessage<typeof teammateChat>

export function Chat({
  chatId,
  kind,
  members,
}: {
  chatId: string
  kind: "direct" | "group"
  members: ChatBotProfile[]
}) {
  const [provider, setProvider] = useState<"google" | "groq">("google")
  const [selectedBotId, setSelectedBotId] = useState(members[0]?.id)
  const botId =
    members.find((bot) => bot.id === selectedBotId)?.id ?? members[0]?.id
  const transport = useTriggerChatTransport<typeof teammateChat>({
    task: "teammate-chat",
    accessToken: ({ chatId }) => mintChatAccessToken(chatId),
    startSession: ({ chatId, clientData }) =>
      startChatSession({ chatId, clientData }),
    clientData: { provider, botId: kind === "group" ? botId : undefined },
  })
  const transcript = useLoadTranscript<ChatMessage>(
    chatId,
    async (params) => {
      const result = await loadChatTranscript(params)
      if (result.publicAccessToken) {
        transport.setSession(params.chatId, {
          publicAccessToken: result.publicAccessToken,
        })
      }
      return result
    },
    { transport }
  )

  if (transcript.isLoading) return <Spinner className="m-auto" />
  if (transcript.error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          Could not load this conversation. Please reload to try again.
        </AlertDescription>
      </Alert>
    )
  }
  return (
    <ChatConversation
      key={chatId}
      chatId={chatId}
      transport={transport}
      initialMessages={transcript.messages}
      provider={provider}
      setProvider={setProvider}
      members={members}
      isGroup={kind === "group"}
      botId={botId}
      setBotId={setSelectedBotId}
    />
  )
}

function ChatConversation({
  chatId,
  transport,
  initialMessages,
  provider,
  setProvider,
  members,
  isGroup,
  botId,
  setBotId,
}: {
  chatId: string
  transport: TriggerChatTransport
  initialMessages: ChatMessage[]
  provider: "google" | "groq"
  setProvider: (provider: "google" | "groq") => void
  members: ChatBotProfile[]
  isGroup: boolean
  botId: string | undefined
  setBotId: (id: string) => void
}) {
  const [input, setInput] = useState("")
  const [editingMessageId, setEditingMessageId] = useState<string>()
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const {
    messages,
    sendMessage,
    status,
    stop: stopLocal,
    error,
    regenerate,
  } = useChat<ChatMessage>({
    id: chatId,
    transport,
    messages: initialMessages,
    resume: initialMessages.length > 0,
  })
  const busy = status === "submitted" || status === "streaming"

  async function stopAndEdit() {
    const lastPrompt = messages.findLast((message) => message.role === "user")
    const stopped = stopLocal()
    await transport.stopGeneration(chatId)
    await stopped
    if (lastPrompt) {
      setInput(
        lastPrompt.parts
          .filter((part) => part.type === "text")
          .map((part) => part.text)
          .join("")
      )
      setEditingMessageId(lastPrompt.id)
    }
    requestAnimationFrame(() => {
      const textarea = inputRef.current
      textarea?.focus()
      textarea?.setSelectionRange(textarea.value.length, textarea.value.length)
    })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Conversation className="min-h-0" aria-label="Chat messages">
        <ConversationContent
          className="mx-auto w-full max-w-3xl"
          scrollClassName="[scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {messages.length === 0 && (
            <ConversationEmptyState
              title="Start a conversation"
              description="Send a message to your AI teammate."
            />
          )}
          {messages.map((message) => (
            <Message key={message.id} from={message.role}>
              <MessageContent>
                {message.parts.map((part, index) => {
                  if (isToolUIPart(part)) {
                    return <ChatTool key={part.toolCallId} part={part} />
                  }
                  if (part.type === "data-speaker") {
                    return (
                      <div
                        key={index}
                        className="mb-1 flex items-center gap-2 text-xs font-medium text-muted-foreground"
                      >
                        <ChatAvatar
                          seed={part.data.avatar}
                          className="size-5"
                        />
                        {part.data.name}
                      </div>
                    )
                  }
                  return part.type === "text" ? (
                    <MessageResponse
                      key={index}
                      isAnimating={
                        status === "streaming" &&
                        message.id === messages.at(-1)?.id
                      }
                    >
                      {part.text}
                    </MessageResponse>
                  ) : null
                })}
              </MessageContent>
            </Message>
          ))}
          {status === "submitted" && (
            <div
              className="flex items-center gap-2 text-sm text-muted-foreground"
              role="status"
            >
              <Spinner /> Thinking…
            </div>
          )}
        </ConversationContent>
        <ConversationScrollButton aria-label="Scroll to latest message" />
      </Conversation>

      <div className="mx-auto flex w-full max-w-3xl shrink-0 flex-col gap-3 p-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>
              {error.message}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void regenerate()}
              >
                Try again
              </Button>
            </AlertDescription>
          </Alert>
        )}
        <PromptInput
          onSubmit={({ text }) => {
            if (busy || !text.trim() || (isGroup && !botId)) return
            void sendMessage({ text: text.trim(), messageId: editingMessageId })
            setEditingMessageId(undefined)
            setInput("")
          }}
        >
          <PromptInputBody>
            <PromptInputTextarea
              ref={inputRef}
              aria-label="Message"
              placeholder="Message your teammate…"
              value={input}
              onChange={(event) => setInput(event.currentTarget.value)}
              disabled={busy}
            />
          </PromptInputBody>
          <PromptInputFooter>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              {isGroup && (
                <PromptInputSelect
                  items={members.map((bot) => ({
                    value: bot.id,
                    label: bot.name,
                  }))}
                  value={botId ?? null}
                  disabled={busy}
                  onValueChange={(value) => {
                    if (typeof value === "string") setBotId(value)
                  }}
                >
                  <PromptInputSelectTrigger
                    aria-label="Bot to talk to"
                    size="sm"
                  >
                    <PromptInputSelectValue placeholder="Choose a bot" />
                  </PromptInputSelectTrigger>
                  <PromptInputSelectContent
                    side="top"
                    align="start"
                    alignItemWithTrigger={false}
                  >
                    <SelectGroup>
                      {members.map((bot) => (
                        <PromptInputSelectItem key={bot.id} value={bot.id}>
                          <ChatAvatar seed={bot.avatar} className="size-5" />
                          {bot.name}
                        </PromptInputSelectItem>
                      ))}
                    </SelectGroup>
                  </PromptInputSelectContent>
                </PromptInputSelect>
              )}
              <PromptInputSelect
                items={providers}
                value={provider}
                disabled={busy}
                onValueChange={(value) => {
                  if (value === "google" || value === "groq") setProvider(value)
                }}
              >
                <PromptInputSelectTrigger aria-label="AI model" size="sm">
                  <PromptInputSelectValue />
                </PromptInputSelectTrigger>
                <PromptInputSelectContent
                  side="top"
                  align="start"
                  alignItemWithTrigger={false}
                >
                  <SelectGroup>
                    {providers.map((item) => (
                      <PromptInputSelectItem
                        key={item.value}
                        value={item.value}
                        className="data-selected:bg-accent data-selected:text-accent-foreground"
                      >
                        {item.label}
                      </PromptInputSelectItem>
                    ))}
                  </SelectGroup>
                </PromptInputSelectContent>
              </PromptInputSelect>
            </div>
            <PromptInputSubmit
              status={status}
              onStop={() => void stopAndEdit()}
              aria-label={
                busy ? "Stop generation and edit message" : "Send message"
              }
              disabled={!busy && (!input.trim() || (isGroup && !botId))}
            >
              {busy ? <SquareIcon className="fill-current" /> : undefined}
            </PromptInputSubmit>
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  )
}

function ChatTool({ part }: { part: ToolPart }) {
  const name = getToolName(part)
  // Private observations stay hidden in every state, including transcript replay.
  if (name === "viewScreen") return null

  const titles: Record<string, string> = {
    bash: "Run command",
    readFile: "Read file",
    writeFiles: "Write files",
    listFiles: "List files",
    mouseClick: "Click mouse",
    mouseMove: "Move mouse",
    mouseScroll: "Scroll",
    keyboardType: "Type text",
    keyboardPress: "Press key",
    showScreen: "Show screen",
  }
  const output = part.state === "output-available" ? part.output : undefined
  const screen =
    name === "showScreen" &&
    typeof output === "object" &&
    output !== null &&
    "base64" in output &&
    typeof output.base64 === "string" &&
    "mediaType" in output &&
    output.mediaType === "image/jpeg"
      ? { base64: output.base64, mediaType: output.mediaType }
      : undefined

  return (
    <Tool defaultOpen={name === "showScreen"}>
      <ToolHeader
        {...(part.type === "dynamic-tool"
          ? { type: part.type, toolName: part.toolName, state: part.state }
          : { type: part.type, state: part.state })}
        title={titles[name] ?? name}
      />
      <ToolContent>
        {part.input !== undefined && <ToolInput input={part.input} />}
        {screen ? (
          <figure className="flex flex-col gap-2">
            <Image
              src={`data:${screen.mediaType};base64,${screen.base64}`}
              alt="Screenshot of your AI teammate's sandbox desktop"
              width={1280}
              height={720}
              unoptimized
              className="h-auto w-full rounded-md"
            />
            <figcaption className="text-xs text-muted-foreground">
              Sandbox screen at the time of capture
            </figcaption>
          </figure>
        ) : (
          <ToolOutput
            output={name === "showScreen" ? undefined : output}
            errorText={
              part.state === "output-error" ? part.errorText : undefined
            }
          />
        )}
      </ToolContent>
    </Tool>
  )
}
