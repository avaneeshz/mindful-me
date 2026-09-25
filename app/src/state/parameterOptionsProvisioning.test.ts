import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `provisionDefaultParameterOptionsOnce` is the one piece of the
 * `SlotEditor`/`ActivityLibraryPanel` cross-instance coordination that's
 * plain, hook-free logic (unlike `setOverride`/`resetToInherited`, which are
 * `useParameterOptions` internals this repo's SSR-string test suite has no
 * way to exercise — no jsdom, no effect execution, no multi-render
 * simulation; see `.claude/agent-memory/full-stack-engineer/
 * feedback_hook_testing_no_jsdom.md`), so it's tested directly here rather
 * than left undocumented. `vi.resetModules()` + a dynamic import gives each
 * test a fresh module instance, since the de-dupe state this module owns is
 * deliberately module-level (shared across every `useParameterOptions`
 * instance in the real app).
 */
describe('provisionDefaultParameterOptionsOnce — de-dupes concurrent callers', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('returns the exact same promise to two callers started before the first settles', async () => {
    const { provisionDefaultParameterOptionsOnce } = await import('./parameterOptionsProvisioning')
    const first = provisionDefaultParameterOptionsOnce()
    const second = provisionDefaultParameterOptionsOnce()
    // Reference equality — the second caller was handed the FIRST caller's
    // own in-flight promise, never a second, independent RPC call. This is
    // the exact mechanism that fixes the real bug: two `useParameterOptions`
    // instances (`SlotEditor`'s and `ActivityLibraryPanel`'s) both seeing
    // "not yet provisioned" at once must never both call the underlying
    // check-then-insert RPC, since the second call would trip the unique
    // index and fail.
    expect(second).toBe(first)

    const [a, b] = await Promise.all([first, second])
    expect(a).toBe(b)
  })

  it('starts a genuinely fresh call once the in-flight one has settled', async () => {
    const { provisionDefaultParameterOptionsOnce } = await import('./parameterOptionsProvisioning')
    const first = provisionDefaultParameterOptionsOnce()
    await first
    const second = provisionDefaultParameterOptionsOnce()
    // Not the same promise — a later, genuinely separate call (e.g. a
    // future need to re-provision) is never permanently stuck replaying a
    // long-resolved result.
    expect(second).not.toBe(first)
  })
})
