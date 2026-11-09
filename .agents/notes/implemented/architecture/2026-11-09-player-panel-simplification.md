# Agent Note: player-facing settings panel simplification
Status: implemented

## Problem
The settings panel had been through several rounds of "simplification" (v3.459.0 among them), but the first screen a player actually lands on was still an undifferentiated wall of controls. Three concrete problems were visible by reading `showSettingsPanel`:

1. **The first screen did not match the player's job.** Even when a player used the host conversation API (the zero-config path), the first screen still laid out the dedicated-API block, the Embedding block, and a background-processing switch group at the same visual weight as "enable memory". A player who just wanted the plugin to work had to scroll past configuration they must not touch.
2. **The copy was not truthful.** The panel advertised "everything else is on by default", while real defaults in `memory-config.js` include off-by-default keys (`worldProgressEnabled`, `vectorChunkEnabled`). The player home also rendered "✅ 已连接" as soon as an API URL string existed, which reports "a field is filled" as "the connection works".
3. **Two controls were bound to the same key.** `enabled` and `extractionEnabled` each appeared twice in the template. Saving wrote both, so the second control silently won; a player who flipped the first one saw no effect and had no way to tell why.
4. **The maintenance actions read as danger.** "快照还原 / 补提取 / 提取角色" sat at first-screen weight with their internal names, though each is a recovery action a player reaches for rarely and deliberately.

## Decision
The panel is reorganized around the player's actual loop — *turn it on, keep talking, look at what was remembered* — rather than around configuration completeness.

- **First screen (`general`) carries only the daily loop**: a short welcome line, a live `#ls-memory-state` status line, exactly three checkboxes (`enabled` / `extractionEnabled` / `autoSave`), the memory-profile pills, and a "look at what the story remembered" block that opens existing views via `data-settings-view`.
- **Profile pills became real `<button>` elements** with `aria-pressed`, keeping `.ls-mode-pill` and `data-profile` so the existing v3.422 wiring stays valid. Clicking one still writes `extractionProfile` and saves immediately ("切换即保存"), because a player changing how much is remembered should not also have to find a save button.
- **The dedicated-API block lives behind `apiProviderCustom`** (`#ls-custom-api-fields`, `hidden` when off). A draft change updates the status line with "当前是预览，点击保存后生效" so the preview state is never mistaken for committed state.
- **Embedding and background-processing blocks moved into `<details>`** (`#ls-embedding-settings`, `#ls-background-settings`). Low-frequency tuning stays reachable and fully functional, just not in the player's face.
- **Maintenance actions were folded and renamed to intent**: "恢复到旧存档 / 找回漏记剧情 / 整理登场人物", with a note that the last two call the AI API.
- **`narrative` became view-first**: four view entry points (人物近况 / 人物关系 / 故事时间线 / 未完的约定) plus collapsed tuning, so `visibleInputs = 0` on that tab.
- **Duplicate bindings were removed**, not hidden: the three repeated `ck()` calls for `enabled`/`extractionEnabled`/`autoSave` were deleted so each key has exactly one rendered control. The background group kept only `preferModuleFiles` / `vectorEnabled` / `graphDiffusionEnabled` / `debugMode`.
- **Profile pills gained a keyboard path**: `keydown` for Enter / Space calls the same `applyProfile` function the click handler calls. The click path is unchanged; no second implementation of the state transition was introduced.
- **Player-facing copy states what is known**: "专用接口已填写，未验证连接" / "使用当前对话接口，未验证连接", and the profile names in the player home match the panel.

The control contract was treated as fixed: 131 `ck(` checkboxes, 82 `data-cfg` controls, the six key ids, and four independently closed tab panes all survive unchanged. Simplification moved controls and rewrote text; it did not delete capability.

## Alternatives considered
- **Deleting low-frequency controls outright.** Tempting for a "simplified" panel, and it would have made the first screen shortest. Rejected: this plugin's audience includes card authors who need `worldlineJumps`, budget sliders, and vector tuning. Deleting them breaks those users with no migration path, and the existing test contract exists precisely to prevent silent capability loss. `<details>` keeps both audiences.
- **A separate "simple mode / expert mode" toggle with two templates.** Rejected as duplicate maintenance surface: two templates drift, and every future control has to be added twice. One template with progressive disclosure has one source of truth.
- **Keeping the pills as styled `div`s.** They were already `div`s with click handlers, and leaving them alone was the smaller change. Rejected: a `div` is not focusable and not announced as a button, so keyboard and screen-reader players could not use the primary control on the first screen. Native `<button>` plus `aria-pressed` is the correct element, and it is what exposed the WebView keyboard gap below.
- **Relying on the browser to synthesize click from Enter on `<button>`.** This is the standard behavior, and it is what the element change assumed. Measured in the actual plugin host (Android WebView via Playwright): `keydown` dispatches to the focused pill, no script prevents default, and no `click` follows. A control button inserted into the same container on the same focus path also produced no `click`, which locates the gap in the host, not in our handler. Adding an explicit `keydown` path is therefore not redundant defensive code but the only thing that makes the control reachable by keyboard in the shipping environment.
- **Hiding the duplicate `enabled` binding instead of deleting it.** Rejected: a hidden-but-bound control still writes on save and would resurrect the same bug the moment someone unhid it.
- **Reporting "已连接" based on a non-empty `apiUrl`.** Rejected as untruthful. Configuration completeness and connection validity are different facts; the panel now says only the first.

## Consequences
- A new player's first screen is four visible checkboxes (three daily switches plus the dedicated-API toggle) with the rest either collapsed or conditional. Everything remains reachable in the same panel.
- Every player-facing claim on the first screen and the player home is now about configuration state only. Connection success is deferred to real call results, which the panel does not observe.
- Profile switching is keyboard-operable on host WebViews that do not synthesize click from Enter, and mouse behavior is unchanged.
- The `enabled` / `extractionEnabled` double-write defect is gone; each config key has one control, which is what `scan_ui_binding` asserts.
- Template-only changes still cannot prove runtime behavior. Verification used the real `settings-ui.js` and `memory-config.js` against the audit gates' DOM shim plus an interaction fixture driven by Playwright: first-screen visibility, conditional API fields, preview-then-save, manual model name persistence, `data-settings-view` dispatch, 320px tab navigation overflow, Enter/Space profile switching, and the narrative tab's zero visible inputs. Gates `scan_ui_runtime` (10 entry points, 0 exceptions, 2594 DOM elements), `scan_ui_interaction`, `scan_ui_binding` (223 declared keys / 213 rendered controls / 129 ids), `scan_ui_narrow_layout` (25032-byte injected CSS), `scan_slider_coherence`, and `scan_ui_view_reach` (27/27 reachable) pass. Regression coverage is `tests/v3459_settings_ui_simplify.test.mjs` (7 cases), which pins the four decisions most likely to regress: conditional API expansion without premature writes, profile click writing real config with `aria-pressed` sync, manual model name surviving save and reopen, and Enter/Space taking the same save path as click.

**Boundary**: real SillyTavern was not executed. Host CSS specificity, touch targets, and real `localStorage` quota behavior are uncovered, and this note does not claim otherwise.
