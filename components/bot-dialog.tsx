"use client"

import { useId, useState, type ReactElement } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { ShuffleIcon } from "lucide-react"
import { Controller, useForm, useWatch } from "react-hook-form"

import { createBot } from "@/actions/bot"
import { ChatAvatar } from "@/components/chat-avatar"
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
import { createBotSchema, type CreateBotInput } from "@/lib/db/schema"

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
}: {
  children: ReactElement
  seed: string
}) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const form = useForm<CreateBotInput>({
    resolver: zodResolver(createBotSchema),
    defaultValues: { name: "", job: "", instructions: "", avatar: seed },
  })
  const avatar = useWatch({ control: form.control, name: "avatar" })
  const job = useWatch({ control: form.control, name: "job" })
  const pending = form.formState.isSubmitting

  async function onSubmit(values: CreateBotInput) {
    form.clearErrors("root")

    try {
      const result = await createBot(values)

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
      toast.add({ title: `${values.name} is ready.`, type: "success" })
    } catch {
      form.setError("root", {
        message: "Your bot could not be created. Please try again.",
      })
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (pending) return
        if (nextOpen) {
          form.reset({
            name: "",
            job: "",
            instructions: "",
            avatar: crypto.randomUUID(),
          })
        }
        setOpen(nextOpen)
      }}
    >
      <DialogTrigger render={children} />
      <DialogContent className="dark max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>New bot</DialogTitle>
          <DialogDescription>
            Give it a face, a name, and a job to do.
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
                  <span className="font-medium">Face</span>
                  <FieldDescription>
                    Shuffle until you find one you like.
                  </FieldDescription>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pending}
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
              <FieldError errors={[form.formState.errors.avatar]} />
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
            <DialogClose
              render={
                <Button type="button" variant="outline" disabled={pending} />
              }
            >
              Cancel
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending && <Spinner data-icon="inline-start" />}
              {pending ? "Creating bot…" : "Create bot"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
