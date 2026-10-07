# Motion reference for Tracel's data-structure animations

This folder replaces a video Claude Code can't open. The source is an 8-second looping infographic, "13 Must-Know Data Structures" by algomaster.io (720×1280, 30fps). It shows 13 small panels, each looping one operation on one data structure.

**How to use it:** treat it as a reference for *motion and visual grammar* (how a pointer moves, how a pop or a swap reads, how a traversal is highlighted). **Do not copy** its layout, title, branding, watermark, or exact artwork. Tracel draws structures from real program execution, in its own design tokens (light and dark themes).

## Files

- `frames/frame_XX.Xs.png`: one full-size frame every 0.5s (16 frames). Open them in order to see each loop progress.
- `contact-sheet-*.png`: the same 8 seconds at 4 frames per second, tiled 6×2, for comparing consecutive states at a glance.

---

## 1. Shared visual grammar (the most important part)

The whole sheet uses one **state-color language**, and it is what makes every panel readable instantly. Tracel should adopt the same *semantics*, mapped to its own tokens:

| State | Reference color (approx.) | Meaning | Tracel token to map to |
|---|---|---|---|
| Idle | mint green `#35EC9C` | Element exists, not involved right now | neutral cell (`--bg-hover` fill, `--line-2` border) |
| **Active / current** | orange `#F9A331` | The element being looked at *this step* | `--exec` / `--sem-update` |
| **Path / visited** | cyan `#5BCDF0` | Already traversed / on the search path | `--sem-ref` (or a dedicated `--visit` token) |
| **Removed / leaving** | red `#EF4444` | About to be popped / dequeued / extracted | `--sem-remove` |
| Found / target | green ring around the node | Search ended successfully | `--sem-create` outline |
| Entering | dim / translucent version of the cell | New element appearing (push, enqueue) | fade-in from 0 → 1 opacity |

Other shared conventions:
- **Exactly one "current" element per structure at a time.** Orange moves; it never multiplies.
- **The path stays lit.** Visited nodes *and the edges between them* stay cyan, so the history of the traversal is visible at once, not just the current position.
- **Pointers are small labeled markers, not text.** A cyan ▼ triangle above an array cell; a cyan ▲ with a label (`curr`) under a list node; `head`, `top`, `front`, `rear` as small gray labels with a short arrow to the element.
- **Index labels** sit under array cells (0, 1, 2…) in small gray monospace; the active index label brightens.
- **Captions in monospace** under each panel describe the current operation ("search 5", "insert 1", "extract-min", "find(4)", "path compression", "BFS: A B C D"). The caption changes when the operation changes.
- **Removal is a two-beat motion:** the element first turns red in place (~150–250ms), *then* slides/fades out in the direction it leaves.
- **Insertion is a two-beat motion:** the element appears dim/translucent at its entry point, then solidifies.
- **`null` is explicit:** a red `null` label after the last list node.
- Cells are rounded rectangles with a slightly darker bottom edge (a subtle 3D "key" look); tree nodes are circles. Edges are thin gray lines; traversed edges thicken slightly and turn cyan.
- Pacing: roughly **0.5s per step**. Each operation runs 3–6 steps, holds its result briefly, then resets and loops.

---

## 2. Panel-by-panel breakdown

Times refer to the frame filenames.

### 1. Array: linear scan with an index pointer
- A cyan ▼ above the current cell; that cell is orange; index labels 0–4 below.
- The pointer advances one cell per step, left → right (frames 0.0s–2.0s), then restarts.
- **Tracel use:** index cursors (`i`, `j`, `lo`, `mid`, `hi`) as ▼ markers above cells, gliding between cells; the indexed cell turns "active".

### 2. Linked list: traversal with `curr`
- `head` label above the first node; `curr` label with ▲ under the current node; the current node is orange.
- The arrow *leading into* the current node turns cyan (the edge just traversed). The last node points to a red `null`.
- **Tracel use:** node pointers (`curr`, `prev`, `head`) as labeled markers under nodes; highlight the edge just followed.

### 3. Stack: push and pop
- `← top` label next to the top element.
- **Push:** a new element appears translucent above the stack, then solidifies and `top` moves up to it.
- **Pop:** the top element turns red, then lifts up and fades out; `top` moves down (see around 2.5s–3.5s and 5.5s–6.0s).
- **Tracel use:** keep the existing stack motion, but add the red pre-removal beat and the moving `top` label.

### 4. HashMap: hashing a key into a bucket
- A key dot (cyan) next to an orange `h(k)` box; a dashed line runs from the hash box to a bucket in a vertical column of slots (0–3).
- The dot travels along the dashed line and lands in its bucket, where the value (41, 18, 26, 7) appears. Collisions stack in the same slot (both 18 and 41 occupy one).
- **Tracel use:** dict/map insertions: show the key being placed into its slot, and highlight the slot on lookup. Only show hash/bucket internals if the program actually exposes them; otherwise animate the entry appearing in the dict view.

### 5. Matrix: row-major traversal
- Row indices on the left, column indices on top. The active cell is orange, and the matching row and column index labels brighten orange.
- Moves cell by cell along rows.
- **Tracel use:** `GridView` with `r`/`c` cursors highlighted on both axes; add a "visited" tint for BFS/DP fills.

### 6. Queue: enqueue at rear, dequeue at front
- `front` and `rear` labels above; a red ← arrow on the left (exit), a green ← arrow on the right (entry).
- **Dequeue:** the front element turns red, slides left and fades out; the next element becomes front (orange).
- **Enqueue:** the new element appears dim at the rear and solidifies.
- **Tracel use:** same motion for queues and BFS frontiers; show the exit and entry arrows faintly.

### 7. Deque: operations at both ends
- Double arrows at both ends. Elements are added or removed at either end; removed ones turn red first (e.g. `11` turning red at the right end around 3.0s and 4.5s–6.0s).
- **Tracel use:** `collections.deque` / `std::deque`: use the push_front, pop_front and pop_back ops already present in the trace events.

### 8. Binary tree: level-order traversal
- The highlighting sweeps level by level: root orange → second level orange → leaves orange, then resets (frames 0.0s–2.0s).
- **Tracel use:** `TreeView` level-order (BFS) visits, where the whole frontier level is highlighted together; for DFS orders, light one node at a time and add visit-order badges.

### 9. BST: search
- The search path from the root is cyan (nodes and edges); the node being compared is orange; the found node gets a green ring. Captions go from "search 5" to "found 5".
- **Tracel use:** BST search, insert and delete: cyan path, orange comparison node, success ring; failure would end at a null stub.

### 10. Heap: insert with sift-up, extract-min with sift-down
- **Insert 1:** the new node appears at the next leaf position, then swaps with its parent (the two nodes visibly move past each other) until heap order holds. Caption: "insert 1".
- **Extract-min:** the root turns red and disappears; the last leaf moves up to the root and sifts down by swapping with the smaller child. Caption: "extract-min".
- **Tracel use:** `HeapView` (array + tree). Swaps in the tree must mirror swaps in the array; the moving nodes travel along the edge between parent and child.

### 11. Trie: prefix search
- The path from the root through the character nodes is cyan; the current character is orange; on success the last node gets a green ring. Captions go from "search "car"" to "found "car"", then "search "cup"" to "found "cup"".
- **Tracel use:** n-ary trees and tries (dict-of-dicts or `children` arrays), with the same path-lighting grammar as the BST.

### 12. Graph: BFS
- Visited nodes are cyan, the current node is orange, and the edges used to reach nodes are cyan and slightly thicker.
- A **visit-order strip** below reads "BFS: A B C D", with already-visited letters bright and upcoming ones dim.
- **Tracel use:** `GraphView` BFS/DFS with the visit strip; show the queue/stack frontier alongside if the program has one.

### 13. Union-Find: find with path compression
- Two trees: a chain 1←2←3←4 and a separate pair 5←6. The root (1) has a ring.
- **find(4):** walks up from 4 to the root, lighting each node orange.
- **Path compression:** the nodes on the path re-parent directly to the root; the chain visibly collapses into a fan under node 1. Captions go "find(4)", "path compression", "find(4) = 1".
- **Tracel use:** a parent-array (`parent[i]`) recognized as a disjoint-set forest: draw it as trees, animate `find` walks and the re-parenting as edges swinging to the root.

---

## 3. What to take from this, and what not to

**Take:**
- The four-state color language (idle / active / path / removing) applied consistently across every structure.
- Labeled pointer markers (▼ above, ▲ below) that glide instead of jumping.
- Two-beat insert and remove motions.
- Keeping the traversal path lit, plus a visit-order strip.
- Monospace operation captions that update as the operation changes; in Tracel these come from semantic events and narration.
- About 0.5s per step at 1× speed, matching the timeline speed control.

**Don't take:**
- The algomaster.io title, layout grid, watermark, or exact artwork.
- Pure black backgrounds and the neon mint palette. Tracel uses its own tokens and must work in both light and dark themes.
- Looping demos with made-up data. Tracel's animations are driven only by the real trace; nothing animates unless the program actually did it.

---

## 4. Acceptance check against this reference

After implementing the visual-plan feature, write Tracel example programs equivalent to each of the 13 panels:
- array scan
- linked list traversal
- stack push/pop
- dict insert
- matrix traversal
- queue
- deque
- level-order tree
- BST search
- heap insert/extract
- trie search
- graph BFS
- union-find with path compression

Capture screenshots at matching moments and compare them against these frames. Each Tracel capture should communicate the same thing at a glance: what is current, what was visited, and what is being removed.
