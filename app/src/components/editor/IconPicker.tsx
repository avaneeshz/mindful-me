import { useId, useRef, useState } from 'react'
import { Loader2, Trash2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  customIconIdFromKey,
  customIconKey,
  ICON_PREPARE_PROBLEM_TEXT,
  ICON_UPLOAD_REQUIREMENTS,
} from '@/domain/customIcons'
import { ICON_CHOICES, resolveIcon } from '@/lib/iconRegistry'
import { prepareIcon, type PreparedIcon } from '@/lib/iconImage'
import { useOptionalPickerData } from '@/state/PickerDataContext'
import { cn } from '@/lib/utils'

const choiceClass = (selected: boolean) =>
  cn(
    'flex size-[32px] items-center justify-center rounded-sm border transition-colors',
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink',
    selected ? 'border-ink bg-ink/10' : 'border-line bg-bg hover:border-ink',
  )

const sectionTitle = 'text-nano font-bold uppercase tracking-tag text-ink-dim'

/**
 * Picks the icon for a tile or an activity: a built-in icon, one of the
 * user's uploaded icons, or a new upload. Uploads are checked, cleaned
 * (background removed, turned into a silhouette) and previewed before the
 * user approves them; only an approved icon is saved.
 */
export function IconPicker({ value, onChange }: { value: string | null; onChange: (iconKey: string) => void }) {
  const picker = useOptionalPickerData()
  const custom = picker?.customIcons
  const [uploading, setUploading] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const selectedCustomId = customIconIdFromKey(value)
  const builtinId = useId()
  const customId = useId()

  async function remove(id: string) {
    if (!custom) return
    setDeleteError(null)
    setDeletingId(id)
    const result = await custom.deleteIcon(id)
    setDeletingId(null)
    if (!result.ok) setDeleteError(result.message)
  }

  return (
    <div className="flex flex-col gap-md">
      <div className="flex flex-col gap-xs">
        <span className={sectionTitle} id={builtinId}>
          Icons
        </span>
        <div className="flex flex-wrap gap-xs" role="radiogroup" aria-labelledby={builtinId}>
          {ICON_CHOICES.map(({ key, icon: Icon }) => (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={value === key}
              aria-label={key}
              onClick={() => onChange(key)}
              className={choiceClass(value === key)}
            >
              <Icon aria-hidden="true" className="size-[16px] text-ink" />
            </button>
          ))}
        </div>
      </div>

      {custom && (
        <div className="flex flex-col gap-xs">
          <span className={sectionTitle} id={customId}>
            Your icons
          </span>
          {custom.status === 'loading' && (
            <p className="flex items-center gap-xs text-caption text-ink-dim">
              <Loader2 aria-hidden="true" className="size-[12px] animate-spin" />
              Loading your icons…
            </p>
          )}
          {custom.status === 'error' && (
            <p role="alert" className="text-caption text-ink-dim">
              Couldn’t load your uploaded icons. They’ll appear once you’re back online.
            </p>
          )}
          {custom.icons.length > 0 && (
            <div className="flex flex-wrap gap-sm" role="radiogroup" aria-labelledby={customId}>
              {custom.icons.map((icon, index) => {
                const Icon = resolveIcon(customIconKey(icon.id))
                const selected = selectedCustomId === icon.id
                return (
                  <span key={icon.id} className="relative">
                    <button
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      aria-label={`Uploaded icon ${index + 1}`}
                      onClick={() => onChange(customIconKey(icon.id))}
                      className={choiceClass(selected)}
                    >
                      <Icon className="size-[16px] text-ink" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete uploaded icon ${index + 1}`}
                      disabled={deletingId === icon.id}
                      onClick={() => void remove(icon.id)}
                      className="absolute -right-[6px] -top-[6px] flex size-[18px] items-center justify-center rounded-full border border-line bg-surface text-ink-dim shadow-elevation-1 transition-colors hover:text-ink disabled:opacity-50"
                    >
                      {deletingId === icon.id ? (
                        <Loader2 aria-hidden="true" className="size-[10px] animate-spin" />
                      ) : (
                        <Trash2 aria-hidden="true" className="size-[10px]" />
                      )}
                    </button>
                  </span>
                )
              })}
            </div>
          )}
          {deleteError && (
            <p role="alert" className="text-caption text-ink">
              {deleteError}
            </p>
          )}

          {uploading ? (
            <IconUploadPanel
              onCancel={() => setUploading(false)}
              onApprove={async (imageData) => {
                const result = await custom.addIcon(imageData)
                if (result.ok) {
                  onChange(customIconKey(result.icon.id))
                  setUploading(false)
                }
                return result
              }}
            />
          ) : custom.canUpload ? (
            <Button
              type="button"
              variant="outline"
              size="inline"
              className="self-start gap-xs px-md"
              onClick={() => {
                setDeleteError(null)
                setUploading(true)
              }}
            >
              <Upload aria-hidden="true" className="size-[14px]" />
              Upload icon
            </Button>
          ) : (
            <p className="text-caption text-ink-dim">Sign in to upload your own icons. They sync to every device.</p>
          )}
        </div>
      )}
    </div>
  )
}

/** Choose a file → see the cleaned result → approve. Nothing is saved before "Use this icon". */
function IconUploadPanel({
  onCancel,
  onApprove,
}: {
  onCancel: () => void
  onApprove: (imageData: string) => Promise<{ ok: true } | { ok: false; message: string }>
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [processing, setProcessing] = useState(false)
  const [prepared, setPrepared] = useState<Extract<PreparedIcon, { ok: true }> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleFile(file: File | undefined) {
    if (!file) return
    setError(null)
    setPrepared(null)
    setProcessing(true)
    const result = await prepareIcon(file)
    setProcessing(false)
    if (result.ok) setPrepared(result)
    else setError(ICON_PREPARE_PROBLEM_TEXT[result.problem])
  }

  async function approve() {
    if (!prepared) return
    setSaving(true)
    setError(null)
    const result = await onApprove(prepared.resultUrl)
    setSaving(false)
    if (!result.ok) setError(result.message)
  }

  const Preview = ({ size }: { size: number }) => {
    if (!prepared) return null
    const mask = `url("${prepared.resultUrl}") center / contain no-repeat`
    return (
      <span
        aria-hidden="true"
        className="inline-block bg-ink"
        style={{ width: size, height: size, mask, WebkitMask: mask }}
      />
    )
  }

  return (
    <div className="flex flex-col gap-md rounded-md border border-line bg-bg p-md" aria-label="Upload an icon" role="group">
      <div className="flex flex-col gap-xs">
        <p className="text-caption font-semibold text-ink">Upload an icon</p>
        <ul className="flex flex-col gap-[2px] text-caption text-ink-dim">
          {ICON_UPLOAD_REQUIREMENTS.map((rule) => (
            <li key={rule}>· {rule}</li>
          ))}
        </ul>
        <p className="text-caption text-ink-dim">
          We remove the background and turn the shape into a single colour that matches the app. You’ll see the
          result before anything is saved.
        </p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/svg+xml"
        className="sr-only"
        aria-label="Choose an icon file"
        onChange={(e) => {
          void handleFile(e.target.files?.[0])
          e.target.value = ''
        }}
      />

      {processing && (
        <p role="status" className="flex items-center gap-xs text-caption text-ink-dim">
          <Loader2 aria-hidden="true" className="size-[12px] animate-spin" />
          Removing the background…
        </p>
      )}

      {prepared && (
        <div className="flex flex-wrap items-center gap-lg">
          <figure className="flex flex-col items-center gap-xs">
            <img
              src={prepared.originalUrl}
              alt="Your upload"
              className="checkerboard size-[64px] rounded-sm border border-line object-contain"
            />
            <figcaption className="text-nano text-ink-dim">Before</figcaption>
          </figure>
          <figure className="flex flex-col items-center gap-xs">
            <span className="flex size-[64px] items-center justify-center rounded-sm border border-line bg-surface">
              <Preview size={48} />
            </span>
            <figcaption className="text-nano text-ink-dim">After</figcaption>
          </figure>
          <figure className="flex flex-col items-center gap-xs">
            <span className="flex items-center gap-sm rounded-sm border border-line bg-surface px-sm py-xs">
              <span className="flex size-chip items-center justify-center rounded-sm bg-surface-2 text-ink">
                <Preview size={16} />
              </span>
              <Preview size={24} />
            </span>
            <figcaption className="text-nano text-ink-dim">In the app</figcaption>
          </figure>
          <p role="status" className="w-full text-caption text-ink-dim">
            {prepared.background === 'removed'
              ? 'Background removed.'
              : 'This image already had a transparent background.'}{' '}
            Happy with it?
          </p>
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-md border border-ink bg-ink/10 px-md py-sm text-caption font-semibold text-ink">
          {error}
        </p>
      )}

      <div className="flex flex-wrap justify-end gap-sm">
        <Button type="button" variant="ghost" size="inline" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button
          type="button"
          variant={prepared ? 'outline' : 'primary'}
          className="px-md"
          size="inline"
          disabled={processing || saving}
          onClick={() => inputRef.current?.click()}
        >
          {prepared ? 'Choose another' : 'Choose file'}
        </Button>
        {prepared && (
          <Button type="button" size="inline" className="px-md" disabled={saving} onClick={() => void approve()}>
            {saving && <Loader2 aria-hidden="true" className="size-[14px] animate-spin" />}
            Use this icon
          </Button>
        )}
      </div>
    </div>
  )
}
