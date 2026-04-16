---
name: Loading bar standard
description: All loading states must use the LoadingBar component from @/components/LoadingBar — never raw spinners
type: preference
---
Use `<LoadingBar />` for full-screen loading and `<LoadingBar fullScreen={false} />` for inline/section loading.
Import from `@/components/LoadingBar`. Props: progress (0-100), label (text), fullScreen (bool).
Never use raw `animate-spin` divs for loading states.
