"use client"

import { useEffect, useId, type ComponentProps } from "react"
import { useRouter } from "next/navigation"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"

import { createGroupChat } from "@/actions/group-chat"
import { ChatAvatar } from "@/components/chat-avatar"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog"
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldError,
  FieldSet,
  FieldLegend,
  FieldDescription,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import {
  createGroupChatSchema,
  type CreateGroupChatInput,
  type ChatBotProfile,
} from "@/lib/db/schema"

export function GroupChatDialog({
  bots,
  open,
  onOpenChange,
  finalFocus,
}: {
  bots: ChatBotProfile[]
  open: boolean
  onOpenChange: (open: boolean) => void
  finalFocus?: ComponentProps<typeof DialogContent>["finalFocus"]
}) {
  const id = useId()
  const router = useRouter()
  const form = useForm<CreateGroupChatInput>({
    resolver: zodResolver(createGroupChatSchema),
    defaultValues: { name: "", botIds: [] },
  })
  const pending = form.formState.isSubmitting
  useEffect(() => {
    if (open) form.reset({ name: "", botIds: [] })
  }, [open, form])

  async function submit(values: CreateGroupChatInput) {
    form.clearErrors("root")
    try {
      const result = await createGroupChat(values)
      if (!result.success) {
        for (const name of ["name", "botIds"] as const) {
          const message = result.fieldErrors?.[name]?.[0]
          if (message) form.setError(name, { message })
        }
        form.setError("root", { message: result.error })
        return
      }
      onOpenChange(false)
      toast.add({ title: `${values.name} was created.`, type: "success" })
      router.push(`/chats/${encodeURIComponent(result.chatId)}`)
    } catch {
      form.setError("root", {
        message: "Your group could not be created. Please try again.",
      })
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next)
      }}
    >
      <DialogContent
        finalFocus={finalFocus}
        showCloseButton={!pending}
        className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-[460px]"
      >
        <DialogHeader>
          <DialogTitle>New group chat</DialogTitle>
          <DialogDescription>
            Name the group and pick which bots are in it.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={form.handleSubmit(submit)}
          noValidate
        >
          <FieldGroup>
            <Controller
              name="name"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={`${id}-name`}>Name</FieldLabel>
                  <Input
                    {...field}
                    id={`${id}-name`}
                    placeholder="Weekend plans"
                    disabled={pending}
                    aria-invalid={fieldState.invalid}
                    aria-describedby={
                      fieldState.invalid ? `${id}-name-error` : undefined
                    }
                  />
                  {fieldState.error && (
                    <FieldError
                      id={`${id}-name-error`}
                      errors={[fieldState.error]}
                    />
                  )}
                </Field>
              )}
            />
            <Controller
              name="botIds"
              control={form.control}
              render={({ field, fieldState }) => (
                <FieldSet data-invalid={fieldState.invalid}>
                  <FieldLegend>Bots</FieldLegend>
                  {bots.length < 2 && (
                    <FieldDescription>
                      Create at least two bots to start a group.
                    </FieldDescription>
                  )}
                  <FieldGroup className="gap-3">
                    {bots.map((bot) => (
                      <Field
                        key={bot.id}
                        orientation="horizontal"
                        data-invalid={fieldState.invalid}
                      >
                        <Checkbox
                          id={`${id}-${bot.id}`}
                          checked={field.value.includes(bot.id)}
                          onBlur={field.onBlur}
                          disabled={pending}
                          aria-invalid={fieldState.invalid}
                          aria-describedby={
                            fieldState.invalid ? `${id}-bots-error` : undefined
                          }
                          onCheckedChange={(checked) =>
                            field.onChange(
                              checked
                                ? [...field.value, bot.id]
                                : field.value.filter(
                                    (value) => value !== bot.id
                                  )
                            )
                          }
                        />
                        <FieldLabel
                          htmlFor={`${id}-${bot.id}`}
                          className="flex min-w-0 items-center gap-3"
                        >
                          <ChatAvatar seed={bot.avatar} className="size-6" />
                          <span className="truncate">{bot.name}</span>
                        </FieldLabel>
                      </Field>
                    ))}
                  </FieldGroup>
                  {fieldState.error && (
                    <FieldError
                      id={`${id}-bots-error`}
                      errors={[fieldState.error]}
                    />
                  )}
                </FieldSet>
              )}
            />
            {form.formState.errors.root && (
              <FieldError errors={[form.formState.errors.root]} />
            )}
          </FieldGroup>
          <DialogFooter>
            <DialogClose
              render={
                <Button type="button" variant="outline" disabled={pending} />
              }
            >
              Cancel
            </DialogClose>
            <Button type="submit" disabled={pending || bots.length < 2}>
              {pending && <Spinner data-icon="inline-start" />}
              {pending ? "Creating…" : "Create group"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
