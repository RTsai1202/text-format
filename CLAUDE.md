# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Raycast extension that formats selected text through multiple transformations. It's designed to handle Chinese text formatting, punctuation standardization, and Markdown structure normalization.

**Main entry point**: `src/format-text.tsx` - A single Raycast command that processes clipboard text and pastes it back.

## Commands

### Development
- `npm install` - Install dependencies
- `npm run build` - Compile extension (outputs to `dist/`)
- `npm run dev` - Start development mode with hot reload (use Raycast's development extension feature)
- `npm run lint` - Run ESLint to check code quality
- `npm run fix-lint` - Automatically fix ESLint issues

### Testing
No automated test framework is configured. To test functionality:
1. Place `debug-input.txt` in clipboard or select text in any macOS application
2. Trigger the extension from Raycast (search "Format Text")
3. Verify the output in the pasted text

## Architecture

### Single Command, Multi-Stage Pipeline
The extension uses a functional approach with a single command that flows through these stages:

1. **Clipboard Capture** (format-text.tsx:8-13)
   - Uses AppleScript to simulate Cmd+C to capture selected text
   - This bypasses `getSelectedText()` which had compatibility issues with newlines

2. **Text Transformation** (format-text.tsx:39-286)
   - `transformText()` applies sequential transformations to preserve formatting

3. **Output** (format-text.tsx:27-31)
   - Pastes transformed text back to clipboard
   - Shows success HUD and closes the Raycast window

### Transformation Pipeline (transformText function)

The transformations are applied in this order:

1. **Whitespace Normalization** (lines 44-50)
   - Converts all line break variants (`\r\n`, `\r`, Unicode line/paragraph separators) to `\n`
   - Critical for subsequent regex patterns that depend on `\n`

2. **Garbage Cleanup** (line 55)
   - Removes Object Replacement Character (U+FFFC) and adjacent markdown markers

3. **URL Preservation** (lines 58-62)
   - Extracts URLs into placeholders to protect from transformations
   - Pattern: `https?://` anywhere, including `<URL>` syntax

4. **Bullet & Markdown Normalization** (lines 64-86)
   - Converts `•` and `・` bullets to `- ` format
   - Handles missing newlines before bullets (adds them)
   - Handles blockquotes (`>`) and headers (`#`)
   - Restores URLs after normalization

5. **Per-Line Processing** (lines 88-192)
   - Iterates through lines to preserve Markdown structure
   - **Code block detection** (line 106): Lines with ` ``` ` toggle a flag; content inside code blocks is untouched
   - **Marker extraction** (lines 119-156): Separates indentation, list markers, and content
   - **Content transformation**:
     - **OpenCC conversion**: Simplified Chinese → Traditional Chinese (cn → tw)
     - **Protection placeholders**: Wraps inline code, URLs, links, images, and alphanumeric sequences to prevent punctuation changes
     - **Punctuation replacement**: Half-width → full-width (`,` → `，`, `.` → `。`, etc.)
     - **Pangu spacing**: Adds spaces between CJK and ASCII characters
     - **Restoration**: Restores protected content

6. **Paragraph Spacing** (lines 194-244)
   - Intelligent double-newline insertion between paragraphs
   - Rules:
     - List items: maintain single newline
     - Blockquotes: maintain single newline
     - Headers: add double newline after
     - Regular paragraphs: add double newline between
     - Code blocks: no modification

7. **Trailing URL Formatting** (lines 248-283)
   - Detects if text ends with a URL
   - Converts to Heptabase-compatible format: `source: <URL>`
   - Adds `---` separator if other content exists

### Key Dependencies

- **opencc-js** - Simplified ↔ Traditional Chinese conversion (using `cn` → `tw` profile)
- **pangu** - Automatic spacing between CJK and ASCII text
- **@raycast/api** - Core Raycast framework for clipboard, HUD, and window management

### Type Definitions

- `src/types.d.ts` - Module declarations for `opencc-js` and `pangu` (not published with full TypeScript support)
- `raycast-env.d.ts` - Auto-generated from `package.json` manifest (do not edit manually)

## Configuration

- `package.json` - Manifest and extension metadata
  - Single command: `format-text` with mode `no-view`
  - No user preferences configured
  - Built to `dist/` directory
- `tsconfig.json` - TypeScript ES2023 target with strict mode enabled

## Common Issues & Solutions

**Text not transforming properly in certain apps**: The AppleScript Cmd+C approach is intentional—it's more reliable than Raycast's native `getSelectedText()` which had newline handling issues in some applications.

**Code blocks not being protected**: The code block detection looks for exactly ` ``` ` (three backticks). If content uses different fence syntax, it won't be detected.

**URLs being modified**: All URLs matching `https?://` pattern are automatically protected. If a URL ends the text, it will be converted to `source:` format.

