# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A Raycast extension that formats selected text through multiple transformations. Designed for Chinese text formatting, punctuation standardization, Markdown structure normalization, and Heptabase-compatible list output.

**Main entry point**: `src/format-text.tsx` - A single Raycast command that processes clipboard text and pastes it back.

## Commands

- `npm install` - Install dependencies
- `npm run build` - Compile extension (outputs to `dist/`)
- `npm run dev` - Start development mode with hot reload
- `npm run lint` - Run ESLint
- `npm run fix-lint` - Auto-fix ESLint issues

### Testing

No automated test framework. To test:
1. Select text in any macOS application
2. Trigger extension from Raycast (search "Format Text")
3. Check `~/raycast-debug.txt` for input/output debug info

## Architecture

### Main Flow (Command function)

1. **Capture**: AppleScript simulates Cmd+C to copy selected text (bypasses `getSelectedText()` newline issues)
2. **Read**: Gets both `text` and `html` from clipboard
3. **Transform**: `transformText(text)` applies all transformations
4. **Output Logic** (smart clipboard handling):
   - If HTML contains `<a>` links → `processHtmlContent(html)` preserves rich text links
   - If transformed text contains lists → `generateHtmlFromMarkdown()` outputs HTML `<ol>/<ul>` format (for Heptabase compatibility)
   - Otherwise → plain text only
5. **Paste**: Pastes via Cmd+V, shows success HUD

### Transformation Pipeline (transformText)

Applied in order:

1. **Whitespace Normalization** - Converts all line break variants to `\n`
2. **Garbage Cleanup** - Removes U+FFFC and adjacent markdown markers
3. **Escape Removal** - Converts `2\.` → `2.` (removes backslash escapes in lists)
4. **URL Protection** - Protects Markdown links `[text](url)` and standalone URLs with placeholders
5. **Bullet Normalization** - Converts `•`, `・` to `- ` format, handles missing newlines
6. **Inline List Detection** - Inserts newlines before inline ordered lists (e.g., `text 1. A 2. B` → separate lines)
7. **Blockquote/Header Normalization** - Ensures proper newlines before `>` and `#`
8. **Per-Line Processing**:
   - Code block detection (` ``` ` toggles flag, content untouched)
   - **Ordered list format conversion**:
     - `1)` / `1、` / `1.` → `1. ` (standard Markdown)
     - `一、` / `十一、` → `1. ` / `11. ` (Chinese numerals via `chineseToArabic()`)
     - `（一）` / `(1)` → `1. ` (parenthetical formats)
   - OpenCC conversion (Simplified → Traditional Chinese, cn → tw)
   - Protection placeholders (inline code, links, URLs, HTML tags, ellipsis, version numbers)
   - Punctuation replacement (half-width → full-width: `,` → `，`, `.` → `。`, etc.)
   - Pangu spacing (adds spaces between CJK and ASCII)
   - Restore protected content
9. **Continuation Paragraph Indentation** - Adds 3-space indent to paragraphs following list items
10. **Paragraph Spacing** - Intelligent double-newline insertion (maintains single newline for lists/blockquotes)
11. **Trailing URL Formatting** - Converts ending URL to Heptabase-compatible `source: <URL>` format with `---` separator

### HTML List Output (Heptabase Compatibility)

When the transformed text contains lists, the extension outputs HTML format alongside plain text:

```html
<meta charset="utf-8"><ol><li>Item 1</li><li>Item 2</li></ol>
```

This ensures Heptabase (which uses ProseMirror) recognizes pasted content as "real" list blocks with Tab indentation support, rather than plain text that looks like lists.

**Key functions**:
- `hasListItems(text)` - Detects if text contains ordered/unordered lists
- `generateHtmlFromMarkdown(text)` - Converts Markdown lists to HTML `<ol>/<ul>` format
- `escapeHtml(text)` - Escapes HTML special characters

See `docs/HEPTABASE-EDITOR.md` for detailed documentation on Heptabase's editor behavior and clipboard format requirements.

### Key Dependencies

- **opencc-js** - Simplified ↔ Traditional Chinese conversion (cn → tw profile)
- **pangu** - Automatic spacing between CJK and ASCII text
- **@raycast/api** - Core Raycast framework

### Type Definitions

- `src/types.d.ts` - Module declarations for `opencc-js` and `pangu`
- `raycast-env.d.ts` - Auto-generated from `package.json` (do not edit)

## Helper Functions

| Function | Purpose |
|----------|---------|
| `chineseToArabic(str)` | Converts Chinese numerals (一~九十九) to Arabic numbers |
| `transformText(text)` | Main transformation pipeline |
| `processHtmlContent(html)` | Transforms text inside `<a>` tags while preserving links |
| `escapeHtml(text)` | Escapes `&`, `<`, `>`, `"`, `'` for HTML output |
| `generateHtmlFromMarkdown(text)` | Converts Markdown to HTML lists |
| `hasListItems(text)` | Checks if text contains list patterns |

## Common Issues

**Text not transforming properly**: The AppleScript Cmd+C approach is intentional—more reliable than Raycast's native `getSelectedText()` which had newline handling issues.

**Code blocks not protected**: Detection looks for ` ``` ` (three backticks). Different fence syntax won't be detected.

**URLs being modified**: URLs matching `https?://` are protected. URLs ending the text convert to `source:` format.

**Lists not recognized in Heptabase**: Ensure the extension outputs HTML format. Check if `hasListItems()` is detecting your list format correctly.

**Chinese numerals not converting**: `chineseToArabic()` supports 一~九十九 (1-99). Numbers outside this range return 0.

**Debug output**: Check `~/raycast-debug.txt` for detailed input/output comparison when troubleshooting.

## Documentation

- `docs/HEPTABASE-EDITOR.md` - Technical documentation on Heptabase's ProseMirror-based editor, clipboard format requirements, and internal data model
