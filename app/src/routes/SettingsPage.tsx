import { useReducer, useState } from 'react'
import { ChevronRight, Loader2, Plus, X } from 'lucide-react'
import { FLAGS, QUALITIES, SYMPTOMS } from '@/data/activities'
import type { AttributeType } from '@/domain/catalog'
import { ICON_KEYS, iconForKey } from '@/lib/iconRegistry'
import {
  configReducer,
  initConfigState,
  isTempId,
  type ConfigState,
  type PendingCatalogOp,
} from '@/state/configReducer'
import { runConfigSyncOps } from '@/state/configSync'
import { useCatalog } from '@/state/CatalogContext'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { cn } from '@/lib/utils'

/**
 * The Configuration screen (see the full-stack-engineer agent definition's
 * "Catalog Customization" section) — reachable from the Sidebar's "Settings"
 * entry. One page, no wizard: a tile list drills into an activity list, which
 * drills into a sub-option list (+ that activity's own attribute-option
 * panel), which drills into a third-level-option list. Every add/remove/
 * attribute-list edit is staged in `configReducer` (mirroring
 * `boardReducer`'s own staging pattern) — nothing reaches `CatalogContext` or
 * the server until Save.
 */
export function SettingsPage() {
  const catalog = useCatalog()
  const [state, dispatch] = useReducer(
    configReducer,
    undefined,
    (): ConfigState => initConfigState(catalog.categoryRows, catalog.activityRows, catalog.overrideRows),
  )
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)

  async function handleSave() {
    if (saving || !state.dirty) return
    setSaving(true)
    setSavedAt(null)
    const ops: PendingCatalogOp[] = state.pendingOps
    // Instant, local-first (rule 6) — the Home screen reflects this the
    // moment Save is pressed, before any of the ops below have resolved.
    catalog.applyEffectiveCatalog({ categories: state.categories, activities: state.activities, overrides: state.overrides })
    dispatch({ type: 'reset', categories: state.categories, activities: state.activities, overrides: state.overrides })
    setSaving(false)
    setSavedAt(Date.now())
    // Background sync — never awaited by the UI. `refresh()` afterward picks
    // up the server's real ids in place of this session's temp ones.
    void runConfigSyncOps(ops).then(() => catalog.refresh())
  }

  function handleDiscard() {
    dispatch({ type: 'reset', categories: catalog.categoryRows, activities: catalog.activityRows, overrides: catalog.overrideRows })
    setSavedAt(null)
  }

  const activeCategories = state.categories.filter((c) => c.isActive).sort((a, b) => a.sortOrder - b.sortOrder)
  const selectedCategory = state.selectedCategoryId
    ? activeCategories.find((c) => c.id === state.selectedCategoryId) ?? null
    : null
  const categoryActivities = selectedCategory
    ? state.activities
        .filter((a) => a.isActive && a.categoryId === selectedCategory.id)
        .sort((a, b) => a.sortOrder - b.sortOrder)
    : []
  const selectedActivity = state.selectedActivityId
    ? state.activities.find((a) => a.id === state.selectedActivityId) ?? null
    : null
  const activitySubs = selectedActivity
    ? state.activities
        .filter((a) => a.isActive && a.parentId === selectedActivity.id)
        .sort((a, b) => a.sortOrder - b.sortOrder)
    : []
  const selectedSub = state.selectedSubId ? state.activities.find((a) => a.id === state.selectedSubId) ?? null : null
  const subThirds = selectedSub
    ? state.activities.filter((a) => a.isActive && a.parentId === selectedSub.id).sort((a, b) => a.sortOrder - b.sortOrder)
    : []

  return (
    <div className="mx-auto flex w-full max-w-[880px] flex-col gap-2xl px-2xl pb-5xl pt-lg mobile:px-lg">
      <header className="flex flex-wrap items-start justify-between gap-lg">
        <div>
          <h1 className="font-display text-h1-sm font-semibold text-ink">Configuration</h1>
          <p className="mt-xs text-note text-ink-dim">
            Customize your tiles, activities, and which options each activity's log form offers.
          </p>
        </div>
        <div className="flex items-center gap-md">
          {savedAt && !state.dirty && (
            <span role="status" className="text-note font-semibold text-ink-dim">
              Saved
            </span>
          )}
          <Button variant="ghost" onClick={handleDiscard} disabled={!state.dirty || saving}>
            Discard
          </Button>
          <Button onClick={handleSave} disabled={!state.dirty || saving} aria-busy={saving}>
            {saving ? <Loader2 aria-hidden="true" className="size-[14px] animate-spin" /> : null}
            Save
          </Button>
        </div>
      </header>

      <Breadcrumb
        category={selectedCategory}
        activity={selectedActivity}
        sub={selectedSub}
        onHome={() => dispatch({ type: 'selectCategory', id: null })}
        onCategory={() => dispatch({ type: 'selectActivity', id: null })}
        onActivity={() => dispatch({ type: 'selectSub', id: null })}
      />

      {!selectedCategory && (
        <TileListPanel
          categories={activeCategories}
          onSelect={(id) => dispatch({ type: 'selectCategory', id })}
          onRemove={(id) => dispatch({ type: 'removeCategory', id })}
          onAdd={(label, iconKey) => dispatch({ type: 'addCategory', label, iconKey })}
        />
      )}

      {selectedCategory && !selectedActivity && (
        <ActivityListPanel
          title={selectedCategory.label}
          emptyLabel="No activities in this tile yet."
          rows={categoryActivities}
          onSelect={(id) => dispatch({ type: 'selectActivity', id })}
          onRemove={(id) => dispatch({ type: 'removeActivity', id })}
          onAdd={(name, iconKey) => dispatch({ type: 'addActivity', name, iconKey })}
        />
      )}

      {selectedActivity && !selectedSub && (
        <>
          <ActivityListPanel
            title={selectedActivity.name}
            subtitle="Sub-options"
            emptyLabel="No sub-options for this activity yet."
            rows={activitySubs}
            onSelect={(id) => dispatch({ type: 'selectSub', id })}
            onRemove={(id) => dispatch({ type: 'removeActivity', id })}
            onAdd={(name, iconKey) => dispatch({ type: 'addActivity', name, iconKey })}
          />
          <AttributeOptionsPanel
            activity={selectedActivity}
            overrides={state.overrides}
            onChange={(attributeType, optionIds) =>
              dispatch({ type: 'setAttributeOptions', activityId: selectedActivity.id, attributeType, optionIds })
            }
          />
        </>
      )}

      {selectedSub && (
        <ActivityListPanel
          title={selectedSub.name}
          subtitle="Third-level options"
          emptyLabel="No third-level options for this sub-option yet."
          rows={subThirds}
          onSelect={() => {}}
          selectable={false}
          onRemove={(id) => dispatch({ type: 'removeActivity', id })}
          onAdd={(name, iconKey) => dispatch({ type: 'addActivity', name, iconKey })}
        />
      )}
    </div>
  )
}

function Breadcrumb({
  category,
  activity,
  sub,
  onHome,
  onCategory,
  onActivity,
}: {
  category: { label: string } | null
  activity: { name: string } | null
  sub: { name: string } | null
  onHome: () => void
  onCategory: () => void
  onActivity: () => void
}) {
  return (
    <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-xs text-note font-semibold text-ink-dim">
      <BreadcrumbCrumb label="Tiles" isCurrent={!category} onClick={onHome} />
      {category && (
        <>
          <ChevronRight aria-hidden="true" className="size-[12px]" />
          <BreadcrumbCrumb label={category.label} isCurrent={!activity} onClick={onCategory} />
        </>
      )}
      {activity && (
        <>
          <ChevronRight aria-hidden="true" className="size-[12px]" />
          <BreadcrumbCrumb label={activity.name} isCurrent={!sub} onClick={onActivity} />
        </>
      )}
      {sub && (
        <>
          <ChevronRight aria-hidden="true" className="size-[12px]" />
          <span aria-current="page" className="text-ink">
            {sub.name}
          </span>
        </>
      )}
    </nav>
  )
}

function BreadcrumbCrumb({ label, isCurrent, onClick }: { label: string; isCurrent: boolean; onClick: () => void }) {
  if (isCurrent) {
    return (
      <span aria-current="page" className="text-ink">
        {label}
      </span>
    )
  }
  return (
    <button type="button" onClick={onClick} className="hover:text-ink hover:underline underline-offset-2">
      {label}
    </button>
  )
}

interface CategoryRowLike {
  id: string
  label: string
  iconKey: string
}

function TileListPanel({
  categories,
  onSelect,
  onRemove,
  onAdd,
}: {
  categories: CategoryRowLike[]
  onSelect: (id: string) => void
  onRemove: (id: string) => void
  onAdd: (label: string, iconKey: string) => void
}) {
  return (
    <section className="flex flex-col gap-lg rounded-lg border border-line bg-surface p-lg shadow-elevation-1">
      <h2 className="text-entry-name font-semibold text-ink">Tiles</h2>
      {categories.length === 0 ? (
        <p className="rounded-md border border-dashed border-line bg-bg px-md py-lg text-center text-note text-ink-dim">
          No tiles yet — add your first one below.
        </p>
      ) : (
        <ul className="flex flex-col gap-sm">
          {categories.map((category) => (
            <RemovableRow
              key={category.id}
              id={category.id}
              name={category.label}
              iconKey={category.iconKey}
              onSelect={() => onSelect(category.id)}
              onRemove={() => onRemove(category.id)}
            />
          ))}
        </ul>
      )}
      <AddRowForm namePlaceholder="New tile name" addLabel="Add tile" onAdd={onAdd} />
    </section>
  )
}

interface ActivityRowLike {
  id: string
  name: string
  iconKey: string
}

function ActivityListPanel({
  title,
  subtitle,
  emptyLabel,
  rows,
  selectable = true,
  onSelect,
  onRemove,
  onAdd,
}: {
  title: string
  subtitle?: string
  emptyLabel: string
  rows: ActivityRowLike[]
  selectable?: boolean
  onSelect: (id: string) => void
  onRemove: (id: string) => void
  onAdd: (name: string, iconKey: string) => void
}) {
  return (
    <section className="flex flex-col gap-lg rounded-lg border border-line bg-surface p-lg shadow-elevation-1">
      <div>
        <h2 className="text-entry-name font-semibold text-ink">{title}</h2>
        {subtitle && <p className="text-caption text-ink-dim">{subtitle}</p>}
      </div>
      {rows.length === 0 ? (
        <p className="rounded-md border border-dashed border-line bg-bg px-md py-lg text-center text-note text-ink-dim">
          {emptyLabel}
        </p>
      ) : (
        <ul className="flex flex-col gap-sm">
          {rows.map((row) => (
            <RemovableRow
              key={row.id}
              id={row.id}
              name={row.name}
              iconKey={row.iconKey}
              drillable={selectable}
              onSelect={() => onSelect(row.id)}
              onRemove={() => onRemove(row.id)}
            />
          ))}
        </ul>
      )}
      <AddRowForm namePlaceholder="New item name" addLabel="Add" onAdd={onAdd} />
    </section>
  )
}

function RemovableRow({
  id,
  name,
  iconKey,
  drillable = true,
  onSelect,
  onRemove,
}: {
  id: string
  name: string
  iconKey: string
  drillable?: boolean
  onSelect: () => void
  onRemove: () => void
}) {
  const Icon = iconForKey(iconKey)
  return (
    <li className="flex items-center gap-md rounded-md bg-bg px-md py-sm">
      <span className="flex size-chip shrink-0 items-center justify-center rounded-sm bg-surface-2 text-ink">
        <Icon aria-hidden="true" className="size-[16px]" />
      </span>
      {drillable ? (
        <button
          type="button"
          onClick={onSelect}
          className="flex min-w-0 flex-1 items-center justify-between gap-sm text-left text-body font-semibold text-ink hover:underline"
        >
          <span className="truncate">
            {name}
            {isTempId(id) && <span className="ml-sm text-caption font-normal text-ink-dim">(unsaved)</span>}
          </span>
          <ChevronRight aria-hidden="true" className="size-[14px] shrink-0 text-ink-dim" />
        </button>
      ) : (
        <span className="min-w-0 flex-1 truncate text-body font-semibold text-ink">
          {name}
          {isTempId(id) && <span className="ml-sm text-caption font-normal text-ink-dim">(unsaved)</span>}
        </span>
      )}
      <Button variant="destructive" size="inline" onClick={onRemove} aria-label={`Remove ${name}`}>
        <X aria-hidden="true" className="size-[13px]" />
        Remove
      </Button>
    </li>
  )
}

function AddRowForm({
  namePlaceholder,
  addLabel,
  onAdd,
}: {
  namePlaceholder: string
  addLabel: string
  onAdd: (name: string, iconKey: string) => void
}) {
  const [name, setName] = useState('')
  const [iconKey, setIconKey] = useState(ICON_KEYS[0])
  const trimmed = name.trim()

  function submit() {
    if (!trimmed) return
    onAdd(trimmed, iconKey)
    setName('')
  }

  return (
    <form
      className="flex flex-col gap-sm border-t border-line-soft pt-lg"
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <div className="flex flex-wrap items-center gap-sm">
        <input
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={namePlaceholder}
          aria-label={namePlaceholder}
          className="min-w-[160px] flex-1 rounded-md border border-line bg-bg px-md py-sm text-body text-ink placeholder:text-ink-dim focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        />
        <Button type="submit" size="control" disabled={!trimmed}>
          <Plus aria-hidden="true" className="size-[14px]" />
          {addLabel}
        </Button>
      </div>
      <IconPicker value={iconKey} onChange={setIconKey} />
    </form>
  )
}

function IconPicker({ value, onChange }: { value: string; onChange: (key: string) => void }) {
  return (
    <div
      role="radiogroup"
      aria-label="Icon"
      className="flex max-h-[104px] flex-wrap gap-xs overflow-y-auto rounded-md border border-line-soft bg-bg p-xs"
    >
      {ICON_KEYS.map((key) => {
        const Icon = iconForKey(key)
        const isSelected = value === key
        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={isSelected}
            aria-label={key}
            title={key}
            onClick={() => onChange(key)}
            className={cn(
              'flex size-[28px] shrink-0 items-center justify-center rounded-sm transition-colors',
              isSelected ? 'bg-inv-bg text-inv-ink' : 'text-ink-dim hover:bg-surface-2 hover:text-ink',
            )}
          >
            <Icon aria-hidden="true" className="size-[14px]" />
          </button>
        )
      })}
    </div>
  )
}

const ATTRIBUTE_SECTIONS: { type: AttributeType; label: string; master: readonly { id: string }[] }[] = [
  { type: 'quality', label: 'Activity quality', master: QUALITIES },
  { type: 'symptom', label: 'Chronic Symptom', master: SYMPTOMS },
  { type: 'flag', label: 'Protective Response', master: FLAGS },
]

function AttributeOptionsPanel({
  activity,
  overrides,
  onChange,
}: {
  activity: ActivityRowLike
  overrides: { activityId: string; attributeType: AttributeType; optionId: string }[]
  onChange: (attributeType: AttributeType, optionIds: string[]) => void
}) {
  const unsaved = isTempId(activity.id)

  return (
    <section className="flex flex-col gap-lg rounded-lg border border-line bg-surface p-lg shadow-elevation-1">
      <div>
        <h2 className="text-entry-name font-semibold text-ink">Options for {activity.name}</h2>
        <p className="text-caption text-ink-dim">
          Checked options are offered when logging this activity. Unchecking one hides it from this
          activity's log form only — the master list is unchanged everywhere else.
        </p>
      </div>

      {unsaved ? (
        <p className="rounded-md border border-dashed border-line bg-bg px-md py-lg text-center text-note text-ink-dim">
          Save this activity first to configure its options.
        </p>
      ) : (
        ATTRIBUTE_SECTIONS.map((section) => {
          const explicitAllowList = overrides
            .filter((o) => o.activityId === activity.id && o.attributeType === section.type)
            .map((o) => o.optionId)
          const hasOverride = overrides.some((o) => o.activityId === activity.id && o.attributeType === section.type)
          const checkedIds = new Set(hasOverride ? explicitAllowList : section.master.map((m) => m.id))

          function toggle(optionId: string) {
            const next = new Set(checkedIds)
            if (next.has(optionId)) next.delete(optionId)
            else next.add(optionId)
            // Back to "every master option checked" -> clear the override
            // entirely (an empty list) rather than writing out the full set —
            // zero rows is the documented "show everything" default.
            const allChecked = section.master.every((m) => next.has(m.id))
            onChange(section.type, allChecked ? [] : [...next])
          }

          return (
            <fieldset key={section.type} className="flex flex-col gap-sm">
              <legend className="text-note font-semibold text-ink">{section.label}</legend>
              <div role="group" aria-label={section.label} className="flex flex-wrap gap-sm">
                {section.master.map((option) => {
                  const isChecked = checkedIds.has(option.id)
                  return (
                    <Chip
                      key={option.id}
                      as="button"
                      size="xs"
                      tone={isChecked ? 'active' : 'surface'}
                      interactive
                      role="checkbox"
                      aria-checked={isChecked}
                      onClick={() => toggle(option.id)}
                    >
                      {option.id}
                    </Chip>
                  )
                })}
              </div>
            </fieldset>
          )
        })
      )}
    </section>
  )
}
