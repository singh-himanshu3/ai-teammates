"use client"

import {
  useEffect,
  useId,
  useState,
  type ComponentProps,
  type ReactElement,
} from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { ShuffleIcon } from "lucide-react"
import { Controller, useForm, useWatch } from "react-hook-form"
import { useRouter } from "next/navigation"

import { createBot, deleteBot, updateBot } from "@/actions/bot"
import { ChatAvatar } from "@/components/chat-avatar"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/toast"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { createBotSchema, type Bot, type CreateBotInput } from "@/lib/db/schema"

export type EditableBot = Pick<
  Bot,
  "id" | "name" | "avatar" | "job" | "instructions"
>

const presets = [
  {
    job: "Research assistant",
    instructions:
      "Answer briefly, cite sources, and ask before running anything destructive.",
  },
  {
    job: "Code reviewer",
    instructions:
      "Review code for correctness, security, and readability. Explain the tradeoffs and suggest focused improvements.",
  },
  {
    job: "Writing editor",
    instructions:
      "Help me write clearly and concisely. Preserve my voice and explain your suggested edits.",
  },
  {
    job: "Tutor",
    instructions:
      "Guide me one step at a time. Ask focused questions, offer hints, and check my understanding.",
  },
]

export function BotDialog({
  children,
  seed,
  open: controlledOpen,
  onOpenChange,
  finalFocus,
  bot,
}: {
  children?: ReactElement
  seed: string
  open?: boolean
  onOpenChange?: (open: boolean) => void
  finalFocus?: ComponentProps<typeof DialogContent>["finalFocus"]
  bot?: EditableBot
}) {
  const router = useRouter()
  const [internalOpen, setInternalOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const open = controlledOpen ?? internalOpen
  const setOpen = onOpenChange ?? setInternalOpen
  const id = useId()
  const deleteForm = useForm({ defaultValues: {} })
  const form = useForm<CreateBotInput>({
    resolver: zodResolver(createBotSchema),
    defaultValues: {
      name: bot?.name ?? "",
      job: bot?.job ?? "",
      instructions: bot?.instructions ?? "",
      avatar: bot?.avatar ?? seed,
    },
  })
  const avatar = useWatch({ control: form.control, name: "avatar" })
  const job = useWatch({ control: form.control, name: "job" })
  const deleting = deleteForm.formState.isSubmitting
  const pending = form.formState.isSubmitting || deleting

  useEffect(() => {
    if (open) {
      form.reset({
        name: bot?.name ?? "",
        job: bot?.job ?? "",
        instructions: bot?.instructions ?? "",
        avatar: bot?.avatar ?? crypto.randomUUID(),
      })
      deleteForm.reset()
    }
  }, [open, form, bot, deleteForm])

  async function onDelete() {
    if (!bot) return
    deleteForm.clearErrors("root")
    try {
      const result = await deleteBot(bot.id)
      if (!result.success) {
        deleteForm.setError("root", { message: result.error })
        return
      }
      setConfirmDelete(false)
      setOpen(false)
      toast.add({ title: `${bot.name} was deleted.`, type: "success" })
      router.replace("/")
    } catch {
      deleteForm.setError("root", {
        message: "Your bot could not be deleted. Please try again.",
      })
    }
  }

  async function onSubmit(values: CreateBotInput) {
    form.clearErrors("root")

    try {
      const result = bot
        ? await updateBot(bot.id, values)
        : await createBot(values)

      if (!result.success) {
        if (result.fieldErrors) {
          for (const field of [
            "name",
            "avatar",
            "job",
            "instructions",
          ] as const) {
            const message = result.fieldErrors[field]?.[0]
            if (message) form.setError(field, { message })
          }
        }
        form.setError("root", { message: result.error })
        return
      }

      setOpen(false)
      toast.add({
        title: bot ? `${values.name} was updated.` : `${values.name} is ready.`,
        type: "success",
      })
    } catch {
      form.setError("root", {
        message: bot
          ? "Your bot could not be updated. Please try again."
          : "Your bot could not be created. Please try again.",
      })
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (pending || confirmDelete) return
        setOpen(nextOpen)
      }}
    >
      {children && <DialogTrigger render={children} />}
      <DialogContent
        finalFocus={finalFocus}
        className="dark max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-[460px]"
      >
        <DialogHeader>
          <DialogTitle>{bot ? "Edit bot" : "New bot"}</DialogTitle>
          <DialogDescription>
            {bot
              ? "Update its face, name, job, and instructions."
              : "Give it a face, a name, and a job to do."}
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="flex flex-col gap-4"
          noValidate
        >
          <ToggleGroup
            aria-label="Bot presets"
            variant="outline"
            size="sm"
            spacing={2}
            className="flex-wrap"
            value={presets.some((preset) => preset.job === job) ? [job] : []}
            disabled={pending}
            onValueChange={(values) => {
              const preset = presets.find((preset) => preset.job === values[0])
              if (!preset) return
              form.setValue("job", preset.job, {
                shouldValidate: true,
                shouldDirty: true,
              })
              form.setValue("instructions", preset.instructions, {
                shouldValidate: true,
                shouldDirty: true,
              })
            }}
          >
            {presets.map((preset) => (
              <ToggleGroupItem
                key={preset.job}
                value={preset.job}
                className="rounded-full"
              >
                {preset.job}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>

          <FieldGroup>
            <Field data-invalid={!!form.formState.errors.avatar}>
              <div className="flex items-center gap-3">
                <ChatAvatar seed={avatar} className="size-12" />
                <div className="flex flex-1 flex-col gap-1">
                  <FieldLabel htmlFor={`${id}-avatar`}>Face</FieldLabel>
                  <FieldDescription>
                    Shuffle until you find one you like.
                  </FieldDescription>
                </div>
                <Button
                  id={`${id}-avatar`}
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  aria-invalid={!!form.formState.errors.avatar}
                  aria-describedby={
                    form.formState.errors.avatar
                      ? `${id}-avatar-error`
                      : undefined
                  }
                  onClick={() =>
                    form.setValue("avatar", crypto.randomUUID(), {
                      shouldValidate: true,
                      shouldDirty: true,
                    })
                  }
                >
                  <ShuffleIcon data-icon="inline-start" />
                  Shuffle
                </Button>
              </div>
              <FieldError
                id={`${id}-avatar-error`}
                errors={[form.formState.errors.avatar]}
              />
            </Field>

            <Controller
              name="name"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={`${id}-name`}>Name</FieldLabel>
                  <Input
                    {...field}
                    id={`${id}-name`}
                    placeholder="Ada"
                    maxLength={100}
                    autoComplete="off"
                    disabled={pending}
                    aria-invalid={fieldState.invalid}
                    aria-describedby={
                      fieldState.invalid ? `${id}-name-error` : undefined
                    }
                  />
                  <FieldError
                    id={`${id}-name-error`}
                    errors={[fieldState.error]}
                  />
                </Field>
              )}
            />
            <Controller
              name="job"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={`${id}-job`}>Job</FieldLabel>
                  <Input
                    {...field}
                    id={`${id}-job`}
                    placeholder="Research assistant"
                    maxLength={200}
                    autoComplete="off"
                    disabled={pending}
                    aria-invalid={fieldState.invalid}
                    aria-describedby={
                      fieldState.invalid ? `${id}-job-error` : undefined
                    }
                  />
                  <FieldError
                    id={`${id}-job-error`}
                    errors={[fieldState.error]}
                  />
                </Field>
              )}
            />
            <Controller
              name="instructions"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={`${id}-instructions`}>
                    How it should work
                  </FieldLabel>
                  <Textarea
                    {...field}
                    id={`${id}-instructions`}
                    placeholder={presets[0].instructions}
                    className="min-h-24 resize-none"
                    maxLength={10000}
                    disabled={pending}
                    aria-invalid={fieldState.invalid}
                    aria-describedby={
                      fieldState.invalid
                        ? `${id}-instructions-error`
                        : undefined
                    }
                  />
                  <FieldError
                    id={`${id}-instructions-error`}
                    errors={[fieldState.error]}
                  />
                </Field>
              )}
            />
          </FieldGroup>
          <FieldError errors={[form.formState.errors.root]} />
          <DialogFooter>
            {bot && (
              <AlertDialog
                open={confirmDelete}
                onOpenChange={(nextOpen) => {
                  if (pending) return
                  deleteForm.clearErrors("root")
                  setConfirmDelete(nextOpen)
                }}
              >
                <AlertDialogTrigger
                  render={
                    <Button
                      type="button"
                      variant="destructive"
                      disabled={pending}
                      className="sm:mr-auto"
                    />
                  }
                >
                  Delete bot
                </AlertDialogTrigger>
                <AlertDialogContent className="dark max-h-[calc(100svh-2rem)] overflow-y-auto">
                  <form
                    onSubmit={(event) => {
                      event.stopPropagation()
                      void deleteForm.handleSubmit(onDelete)(event)
                    }}
                    className="flex flex-col gap-4"
                  >
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete {bot.name}?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This permanently deletes this bot and its direct chats,
                        and removes it from group chats. This cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <FieldError errors={[deleteForm.formState.errors.root]} />
                    <AlertDialogFooter>
                      <AlertDialogCancel type="button" disabled={pending}>
                        Cancel
                      </AlertDialogCancel>
                      <Button
                        type="submit"
                        variant="destructive"
                        disabled={pending}
                      >
                        {deleting && <Spinner data-icon="inline-start" />}
                        {deleting ? "Deleting bot…" : "Delete bot"}
                      </Button>
                    </AlertDialogFooter>
                  </form>
                </AlertDialogContent>
              </AlertDialog>
            )}
            <DialogClose
              render={
                <Button type="button" variant="outline" disabled={pending} />
              }
            >
              Cancel
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending && <Spinner data-icon="inline-start" />}
              {bot
                ? form.formState.isSubmitting
                  ? "Saving changes…"
                  : "Save changes"
                : pending
                  ? "Creating bot…"
                  : "Create bot"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
