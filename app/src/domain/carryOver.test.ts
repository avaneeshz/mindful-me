import { describe, expect, it } from 'vitest'
import { carryInFromPreviousDay, placementNeighbourhood, QUICK_LOG_BOUNDS } from './carryOver'
import { commitSchedule, validateSchedule, type CandidateSchedule } from './scheduling'
import { activityRowSegments } from './slots'

function act(name: string, startMinutes: number, durationMinutes: number) {
  return commitSchedule({ id: null, activity: { name, path: [] }, startMinutes, durationMinutes })
}

describe('carryInFromPreviousDay', () => {
  it('turns yesterday 10 PM -> 6 AM into today 12 AM -> 6 AM', () => {
    const sleep = act('Sleep', 22 * 60, 8 * 60)
    const [carried] = carryInFromPreviousDay([sleep])
    expect(carried.id).toBe(sleep.id)
    expect(carried.startMinutes).toBe(-2 * 60)
    expect(carried.startMinutes + carried.durationMinutes).toBe(6 * 60)
  })

  it('ignores activities that end by midnight, and flag markers', () => {
    expect(carryInFromPreviousDay([act('Walk', 22 * 60, 2 * 60), act('Marker', 600, 0)])).toEqual([])
  })

  it('renders only the post-midnight tail in the Night row', () => {
    const [carried] = carryInFromPreviousDay([act('Sleep', 22 * 60, 8 * 60)])
    const segments = activityRowSegments(carried.startMinutes, carried.durationMinutes, 'night')
    expect(segments.reduce((sum, s) => sum + s.minutes, 0)).toBe(6 * 60)
    expect(activityRowSegments(carried.startMinutes, carried.durationMinutes, 'day')).toEqual([])
  })
})

describe('placement across midnight', () => {
  const candidate = (startMinutes: number, durationMinutes: number): CandidateSchedule => ({
    id: null,
    activity: { name: 'Sleep', path: [] },
    startMinutes,
    durationMinutes,
  })

  it('allows an overnight stretch into an empty next day', () => {
    const hood = placementNeighbourhood([], [], [])
    expect(validateSchedule(candidate(22 * 60, 8 * 60), hood, QUICK_LOG_BOUNDS).ok).toBe(true)
  })

  it('rejects an overnight stretch that runs into the next day\'s first activity', () => {
    const hood = placementNeighbourhood([], [], [act('Gym', 5 * 60, 60)])
    const result = validateSchedule(candidate(22 * 60, 8 * 60), hood, QUICK_LOG_BOUNDS)
    expect(result).toEqual({ ok: false, reason: 'too-long', maxDuration: 7 * 60 })
  })

  it('rejects a new entry that starts inside yesterday\'s spill-in', () => {
    const carryIn = carryInFromPreviousDay([act('Sleep', 22 * 60, 8 * 60)])
    const hood = placementNeighbourhood(carryIn, [], [])
    expect(validateSchedule(candidate(60, 30), hood, QUICK_LOG_BOUNDS)).toMatchObject({ ok: false, reason: 'occupied' })
    expect(validateSchedule(candidate(6 * 60, 30), hood, QUICK_LOG_BOUNDS).ok).toBe(true)
  })
})
