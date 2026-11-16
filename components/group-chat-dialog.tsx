"use client"

import {
  useEffect,
  useId,
  useState,
  type ComponentProps,
  type ReactElement,
} from "react"
import { useRouter } from "next/navigation"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"

import {
  createGroupChat,
  updateGroupChat,
  deleteGroupChat,
} from "@/actions/group-chat"
import { ChatAvatar } from "@/components/chat-avatar"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog"
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
import { usePaidAccess } from "@/components/paid-access"
import { isPaidPlanError } from "@/lib/billing/shared"
import {
  createGroupChatSchema,
  type CreateGroupChatInput,
  type ChatBotProfile,
} from "@/lib/db/schema"

export type EditableGroupChat = {
  id: string
  name: string
  members: ChatBotProfile[]
}

export function GroupChatDialog({
  bots,
  open: controlledOpen,
  onOpenChange,
  finalFocus,
  children,
  group,
}: {
  bots: ChatBotProfile[]
  open?: boolean
  onOpenChange?: (open: boolean) => void
  children?: ReactElement
  group?: EditableGroupChat
  finalFocus?: ComponentProps<typeof DialogContent>["finalFocus"]
}) {
  const id = useId()
  const router = useRouter()
  const { guard, showUpgrade } = usePaidAccess()
  const [internalOpen, setInternalOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const open = controlledOpen ?? internalOpen
  const setOpen = onOpenChange ?? setInternalOpen
  const deleteForm = useForm({ defaultValues: {} })
  const form = useForm<CreateGroupChatInput>({
    resolver: zodResolver(createGroupChatSchema),
    defaultValues: {
      name: group?.name ?? "",
      botIds: group?.members.map((bot) => bot.id) ?? [],
    },
  })
  const deleting = deleteForm.formState.isSubmitting
  const pending = form.formState.isSubmitting || deleting
  useEffect(() => {
    if (open) {
      form.reset({
        name: group?.name ?? "",
        botIds: group?.members.map((bot) => bot.id) ?? [],
      })
      deleteForm.reset()
    }
  }, [open, form, group, deleteForm])

  async function onDelete() {
    if (!guard()) return
    if (!group) return
    deleteForm.clearErrors("root")
    try {
      const result = await deleteGroupChat(group.id)
      if (!result.success) {
        if (isPaidPlanError(result.error)) showUpgrade()
        deleteForm.setError("root", { message: result.error })
        return
      }
      setConfirmDelete(false)
      setOpen(false)
      toast.add({ title: `${group.name} was deleted.`, type: "success" })
      router.replace("/")
    } catch {
      deleteForm.setError("root", {
        message: "Your group could not be deleted. Please try again.",
      })
    }
  }

  async function submit(values: CreateGroupChatInput) {
    if (!guard()) return
    form.clearErrors("root")
    try {
      const result = group
        ? await updateGroupChat(group.id, values)
        : await createGroupChat(values)
      if (!result.success) {
        if (isPaidPlanError(result.error)) showUpgrade()
        for (const name of ["name", "botIds"] as const) {
          const message = result.fieldErrors?.[name]?.[0]
          if (message) form.setError(name, { message })
        }
        form.setError("root", { message: result.error })
        return
      }
      setOpen(false)
      toast.add({
        title: group
          ? `${values.name} was updated.`
          : `${values.name} was created.`,
        type: "success",
      })
      if (!group) router.push(`/chats/${encodeURIComponent(result.chatId)}`)
    } catch {
      form.setError("root", {
        message: group
          ? "Your group could not be updated. Please try again."
          : "Your group could not be created. Please try again.",
      })
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next && !guard()) return
        if (!pending && !confirmDelete) setOpen(next)
      }}
    >
      {children && <DialogTrigger render={children} />}
      <DialogContent
        finalFocus={finalFocus}
        showCloseButton={!pending}
        className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-[460px]"
      >
        <DialogHeader>
          <DialogTitle>
            {group ? "Edit group chat" : "New group chat"}
          </DialogTitle>
          <DialogDescription>
            {group
              ? "Change the name and add or remove bots."
              : "Name the group and pick which bots are in it."}
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
            {group && (
              <AlertDialog
                open={confirmDelete}
                onOpenChange={(next) => {
                  if (!pending) {
                    deleteForm.clearErrors("root")
                    setConfirmDelete(next)
                  }
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
                  Delete group
                </AlertDialogTrigger>
                <AlertDialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto">
                  <form
                    onSubmit={(event) => {
                      event.stopPropagation()
                      void deleteForm.handleSubmit(onDelete)(event)
                    }}
                    className="flex flex-col gap-4"
                  >
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete {group.name}?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This permanently deletes this group chat. The bots and
                        their individual chats will remain. This cannot be
                        undone.
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
                        {deleting ? "Deleting group…" : "Delete group"}
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
            <Button type="submit" disabled={pending || bots.length < 2}>
              {form.formState.isSubmitting && (
                <Spinner data-icon="inline-start" />
              )}
              {group
                ? form.formState.isSubmitting
                  ? "Saving changes…"
                  : "Save changes"
                : pending
                  ? "Creating…"
                  : "Create group"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
