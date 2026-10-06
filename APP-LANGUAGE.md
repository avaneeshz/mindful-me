# mindful-me — App Language

The words product, engineering and users all use for the parts of mindful-me (Classic interface). Use these names in the UI, in tickets, in code reviews and in support conversations. When a name changes, change it here **and** in `app/src/domain/appLanguage.ts`, which is what the app shows in Edit mode.

## The Today screen, top to bottom

| Name (say this) | What it is | In code |
|---|---|---|
| **Header** | The top bar: app title, date, download, sync status, Edit, weather and account. | `components/HeaderBar.tsx` |
| **Non-Negotiable Buttons** | The row of daily buttons under the header: notes, quick logs, day values and checklists. In Edit mode you can drag one within its group. | Header button row in `HeaderBar.tsx`; data `header_buttons`; `state/useHeaderButtons.ts` |
| **Timeline** | Your day and night in 30-minute slots, in two rows: Day (6am–6pm) and Night (6pm–6am). | `components/Timeline.tsx` |
| **Slot Details** | The panel under the Timeline for the selected slot: its time, how full it is and what's logged in it. Shows an activity's summary when you select one. | `components/editor/SlotEditor.tsx` |
| **Tile/Activities** | Inside Slot Details: your tiles. Tap a tile to pick an activity to log. In Edit mode, tap a tile to rename it, change its icon or colour, and manage its activities. | `components/editor/TileRow.tsx`, `EditableTileRow.tsx`; data `tiles`, `activities` |
| **State Tiles** | The cards for how you felt (formerly "Reflection"). Select an activity on the Timeline, then tap a card to map it. | `components/ReflectionSection.tsx`; data `scheduled_activities.reflections` |

## Inside each section

### Header

| Name | What it is | In code |
|---|---|---|
| **Date pill** | Shows the day you're viewing. Tap to open the Calendar. | `DatePill` in `HeaderBar.tsx` |
| **Calendar** | Month view for jumping to any day. Each date shows Indian festivals and holidays, and your Important days, by name. The panel under the grid lists the focused date's names in full. | `components/DatePicker.tsx`, `CalendarDayDetails.tsx`, `state/useCalendarMarkers.ts` |
| **Festival / holiday** | An Indian national holiday or a festival of any major faith. Observance days (e.g. Teachers' Day) are not shown. | Edge function `india-holidays` (Google "Holidays in India" calendar) |
| **Important day** | A date you add yourself (birthday, anniversary). Repeats every year and syncs to your account. | Table `important_days` |
| **Download day** | Exports the viewed day as a PDF. | `DownloadDayButton.tsx` |
| **Sync status** | Shows whether everything has reached the server, with Retry. | `SyncStatusPill.tsx` |
| **Edit / Done** | Turns Edit mode on and off. | `EditModeToggle` in `HeaderButtonEditor.tsx` |
| **Weather** | Current temperature for your location. Hidden on phones. | `WeatherPill.tsx` |
| **Account menu** | Settings, switch to Lumen, sign out. | `AccountMenu` in `HeaderBar.tsx` |

### Non-Negotiable Buttons

They come in three groups, always in this order. A button can only be moved within its own group.

| Name | What it is | In code (`header_buttons.category`) |
|---|---|---|
| **Note button** | Opens a note for the day (e.g. Learnings, People). | `notes` → `NoteButtonPill.tsx` |
| **Quick-log button** | Logs an activity's time without using the Timeline, and shows the day's total. | `activity` → `DisplayValueButton.tsx` |
| **Day value button** | Stores one number for the day (e.g. Steps, Protein). | `day_value` → `DisplayValueButton.tsx` |
| **Checklist button** | A short checklist for the day (e.g. supplements). | `checklist` → `ChecklistButton.tsx` |
| **Hidden buttons** | Buttons you removed from the row. Shown in Edit mode so you can bring them back. | `HiddenButtonsPanel` |

### Timeline

| Name | What it is | In code |
|---|---|---|
| **Day row / Night row** | The two rows of the Timeline. | `TimelineRow` in `Timeline.tsx` |
| **Slot** | One 30-minute cell. Tap to select it. | `domain/slots.ts` |
| **Sun / Moon** | The circle at the start of each row. Tap to log time spent in daylight or moonlight. The number above it is the day's total in minutes (e.g. `80m`). | `SunMoonLogPopover.tsx`; activities "Sun Exposure" / "Moon Exposure" |
| **Now marker** | The line showing the current time, on today only. | `nowMarker` in `Timeline.tsx` |
| **Logged activity** | A block on the Timeline for something you logged. Tap to select it. | `ScheduledActivity` in `domain/types.ts` |

### Slot Details

| Name | What it is | In code |
|---|---|---|
| **Selected slot** | The slot whose details are showing. | `state.selectedSlot` |
| **Capacity meter** | Bar showing how much of the 30 minutes is used. | `CapacityMeter.tsx` |
| **In this slot** | The list of activities that touch the selected slot, with edit, remove and done. | `SlotActivityList.tsx` |
| **Activity summary** | Details of a selected activity, with its mapped State Tiles. | `ActivitySummary.tsx` |
| **Log activity window** | Where you set duration, quality, symptoms, flag and notes before saving a log. | `LogActivityModal.tsx` |

### Tile/Activities

| Name | What it is | In code |
|---|---|---|
| **Tile** | A top-level group (e.g. Sleep, Food). Has a name, icon and optional colour. | Table `tiles` |
| **Activity** | Something you log, inside a tile. | Table `activities` (top level) |
| **Subtype** | A more specific activity inside an activity, any depth. | Table `activities` (`parent_id`) |
| **Icon** | A built-in icon or one you uploaded. | `icon_key`; `lib/iconRegistry.ts` |
| **Uploaded icon** | Your own PNG or SVG, square, at least 128 × 128 px, up to 200 KB. The background is removed and it becomes a single colour that matches the theme. You approve the preview before it's saved. | Table `custom_icons`; `IconPicker.tsx`; `icon_key` = `custom:<id>` |
| **Hide / Restore** | Takes a tile or activity out of the row without deleting it. | `hidden` column |
| **Delete** | Removes a tile or activity for good. Anything with logged history is hidden instead. | `delete_tile` / `delete_activity` RPCs |

### State Tiles

| Name | What it is | In code |
|---|---|---|
| **State Tile** | One card (e.g. a feeling or state). | `data/reflectionCards.ts` |
| **Map / mapped** | Linking a State Tile to a logged activity, with an optional note. | `mapReflectionCard` action |

## Modes and states

| Name | What it means |
|---|---|
| **Edit mode** | Turned on with **Edit** in the Header. Each section shows its name and a one-line description. You can edit Non-Negotiable Buttons and Tile/Activities. Nothing can be logged: the Timeline, Sun/Moon, State Tiles, Slot Details actions and Non-Negotiable Buttons are locked, and a tap shows "Finish editing to log". |
| **Viewed day** | The date the screen is showing. Usually today; change it with the Calendar. |
| **Local-only mode** | No account or server configured. Everything stays on this device. Uploaded icons and Important days need an account. |
| **Classic / Lumen** | The two interfaces. Everything in this file describes Classic. |
