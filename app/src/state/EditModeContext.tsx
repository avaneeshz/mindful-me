import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

/** How long the "Finish editing to log" hint stays up after a locked tap. */
const HINT_MS = 2200

interface EditModeValue {
  /** The one Edit-mode flag for the whole Classic shell (header + Today). */
  editMode: boolean
  toggleEditMode: () => void
  /**
   * Per-section Edit: the activity tiles (Slot Details) and the State Tiles each
   * have their own toggle. The `*Edit` values are what those sections render
   * from — on when the global Edit is on OR their own toggle is. The toggles
   * are inert while the global Edit is on (the global "Done" is the way out).
   * Unlike the global Edit they lock nothing else: only the section being
   * edited changes, and both may be on at once.
   */
  activityTilesEdit: boolean
  stateTilesEdit: boolean
  toggleActivityTilesEdit: () => void
  toggleStateTilesEdit: () => void
  /** A logging surface was tapped while editing — flashes the shared hint. */
  notifyLocked: () => void
  /** True while the hint is showing. */
  lockedHintVisible: boolean
}

const EditModeContext = createContext<EditModeValue | null>(null)

/**
 * Owns Classic's Edit mode. While it is on, every logging surface (timeline,
 * Sun/Moon caps, header buttons, reflection cards, Slot Details actions) is
 * locked behind `EditLock`, and a tap on one flashes a single shared hint
 * instead of creating an entry. Edit mode is UI state, not board data, so
 * it lives here rather than in `BoardContext`.
 */
export function EditModeProvider({ children, onEnter }: { children: ReactNode; onEnter?: () => void }) {
  const [editMode, setEditMode] = useState(false)
  const [activityTilesLocal, setActivityTilesLocal] = useState(false)
  const [stateTilesLocal, setStateTilesLocal] = useState(false)
  const [lockedHintVisible, setLockedHintVisible] = useState(false)
  const timeoutRef = useRef<number | undefined>(undefined)
  const onEnterRef = useRef(onEnter)
  onEnterRef.current = onEnter

  const toggleEditMode = useCallback(() => {
    setEditMode((value) => {
      if (!value) onEnterRef.current?.()
      return !value
    })
  }, [])

  const toggleActivityTilesEdit = useCallback(() => setActivityTilesLocal((value) => !value), [])
  const toggleStateTilesEdit = useCallback(() => setStateTilesLocal((value) => !value), [])

  const notifyLocked = useCallback(() => {
    setLockedHintVisible(true)
    window.clearTimeout(timeoutRef.current)
    timeoutRef.current = window.setTimeout(() => setLockedHintVisible(false), HINT_MS)
  }, [])

  useEffect(() => () => window.clearTimeout(timeoutRef.current), [])

  // Leaving Edit mode clears any hint still on screen.
  useEffect(() => {
    if (!editMode) setLockedHintVisible(false)
  }, [editMode])

  // The global Edit takes over every section, so a section's own toggle never
  // outlives it: nothing stays switched on once the global "Done" is pressed.
  useEffect(() => {
    if (!editMode) return
    setActivityTilesLocal(false)
    setStateTilesLocal(false)
  }, [editMode])

  const value = useMemo(
    () => ({
      editMode,
      toggleEditMode,
      activityTilesEdit: editMode || activityTilesLocal,
      stateTilesEdit: editMode || stateTilesLocal,
      toggleActivityTilesEdit,
      toggleStateTilesEdit,
      notifyLocked,
      lockedHintVisible,
    }),
    [editMode, toggleEditMode, activityTilesLocal, stateTilesLocal, toggleActivityTilesEdit, toggleStateTilesEdit, notifyLocked, lockedHintVisible],
  )
  return <EditModeContext.Provider value={value}>{children}</EditModeContext.Provider>
}

const OUTSIDE_PROVIDER: EditModeValue = {
  editMode: false,
  toggleEditMode: () => {},
  activityTilesEdit: false,
  stateTilesEdit: false,
  toggleActivityTilesEdit: () => {},
  toggleStateTilesEdit: () => {},
  notifyLocked: () => {},
  lockedHintVisible: false,
}

/** Edit-mode state; outside a provider (isolated component tests) it reads as "not editing". */
export function useEditMode(): EditModeValue {
  return useContext(EditModeContext) ?? OUTSIDE_PROVIDER
}
