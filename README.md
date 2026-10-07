# Tracel

Tracel runs a Python, C or C++ program in the browser and lets you step through it line by line while it shows the call frames, variables and data structures at each step.

![Tracel in the light theme](docs/screenshots/light.png)
![Tracel in the dark theme](docs/screenshots/dark.png)

## Running it

Requires Node.js 18 or later.

```bash
npm install
npm run dev              # development server on http://localhost:5173
npm test                 # unit and golden tests
npm run build            # type-check and production build
npm run check:contrast   # WCAG contrast check for both themes
```

`node scripts/capture-screenshots.js` serves the last build, so run `npm run build` first. It captures every viewport in both themes into `qa-screenshots/`.

## Languages and limits

**Python** runs CPython 3.12 (Pyodide) in a Web Worker, traced with `sys.settrace`. Imports are limited to an allowlist (`math`, `random` seeded with 0, `collections`, `heapq`, `bisect`, `itertools`, `functools`, `string`, `typing`, `dataclasses`, and the `tracel` helper module). Network and file access are removed.

**C and C++** run on Tracel's own interpreter, also in a Web Worker. It covers a subset: arrays, pointers, structs, classes, `malloc`/`free`, `new`/`delete`, `printf`/`scanf`, `std::cout`/`std::cin`, `std::vector`, `std::stack` and `std::queue`. Out-of-bounds access, null dereference, use-after-free, double free and uninitialized reads stop the run on the offending line. Unsupported features such as user-defined templates are rejected before the program runs.

Every run stops after 5,000 steps by default (up to 20,000 in Settings), and a watchdog ends any run that takes longer than 8 seconds.

## Keyboard shortcuts

| Action | Keys |
|---|---|
| Run | ⌘ Enter / Ctrl Enter |
| Play or pause | Space, or ⌘ . / Ctrl . |
| Step forward / back | → / ← (outside the editor), F10 / Shift F10 |
| First / last step | Home / End |
| Restart | R |
| Playback speed | 1 to 5 |
| Toggle breakpoint | F9 |
| Shortcut list | ? |

## Themes

Light, dark, or follow the system setting, chosen from the top bar or Settings. All colors are tokens in `src/styles/tokens.css`; components never use raw colors.

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md). Examples live in `src/features/examples/registry.ts`; new languages implement `LanguageAdapter` in `src/engine/adapters/types.ts`.
