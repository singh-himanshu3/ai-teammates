"use client"

import { useChat } from "@ai-sdk/react"
import type { TriggerChatTransport } from "@trigger.dev/sdk/chat"
import {
  useLoadTranscript,
  useTriggerChatTransport,
} from "@trigger.dev/sdk/chat/react"
import type { UIMessage } from "ai"
import { SquareIcon } from "lucide-react"
import { useRef, useState } from "react"

import {
  loadChatTranscript,
  mintChatAccessToken,
  startChatSession,
} from "@/actions/chat"
import type { teammateChat } from "@/trigger/chat"

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

export function Chat({ chatId }: { chatId: string }) {
  const [provider, setProvider] = useState<"google" | "groq">("google")
  const transport = useTriggerChatTransport<typeof teammateChat>({
    task: "teammate-chat",
    accessToken: ({ chatId }) => mintChatAccessToken(chatId),
    startSession: ({ chatId, clientData }) =>
      startChatSession({ chatId, clientData }),
    clientData: { provider },
  })
  const transcript = useLoadTranscript(
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
    />
  )
}

function ChatConversation({
  chatId,
  transport,
  initialMessages,
  provider,
  setProvider,
}: {
  chatId: string
  transport: TriggerChatTransport
  initialMessages: UIMessage[]
  provider: "google" | "groq"
  setProvider: (provider: "google" | "groq") => void
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
  } = useChat({
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
        <ConversationContent className="mx-auto w-full max-w-3xl">
          {messages.length === 0 && (
            <ConversationEmptyState
              title="Start a conversation"
              description="Send a message to your AI teammate."
            />
          )}
          {messages.map((message) => (
            <Message key={message.id} from={message.role}>
              <MessageContent>
                {message.parts.map((part, index) =>
                  part.type === "text" ? (
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
                )}
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
            if (busy || !text.trim()) return
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
            <PromptInputSubmit
              status={status}
              onStop={() => void stopAndEdit()}
              aria-label={
                busy ? "Stop generation and edit message" : "Send message"
              }
              disabled={!busy && !input.trim()}
            >
              {busy ? <SquareIcon className="fill-current" /> : undefined}
            </PromptInputSubmit>
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  )
}
