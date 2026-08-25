---

name: release-review
description: Perform a final product, UX, UI, functional and quality review before considering a feature production-ready.
--------------------------------------------------------------------------------------------------------------------------

# Production Readiness Review

Review the completed feature from five perspectives.

## 1. Product

Does it solve the intended problem?

Does it belong in the product?

Is the scope appropriate?

## 2. UX

Is the flow intuitive?

Is the primary action obvious?

Is friction minimized?

Are empty/error/loading states handled?

## 3. UI

Is the visual hierarchy strong?

Is the design system followed?

Is the interface consistent with the rest of the application?

Does it look production quality?

## 4. Engineering

Check:

* API integration
* state management
* error handling
* performance
* maintainability
* code duplication

## 5. QA

Check:

* happy path
* edge cases
* regression
* responsive behavior
* accessibility

## Final Decision

Return exactly one:

### READY

or

### NEEDS CHANGES

If NEEDS CHANGES, provide a prioritized list.

Critical issues must be fixed before release.
