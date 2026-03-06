# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Code Style

Use comments sparingly. Only comment complex code.

## Commands

```bash
# First-time setup (install deps, generate Prisma client, run migrations)
npm run setup

# Development server (Turbopack)
npm run dev

# Build
npm run build

# Lint
npm run lint

# Run all tests
npm test

# Run a single test file
npx vitest run src/components/chat/__tests__/ChatInterface.test.tsx

# Reset database
npm run db:reset

# Regenerate Prisma client after schema changes
npx prisma generate

# Run new migrations after schema changes
npx prisma migrate dev
```

## Environment

Copy `.env` and set:
- `ANTHROPIC_API_KEY` — optional; if absent, the app uses `MockLanguageModel` (generates pre-canned components for demo/testing)
- `JWT_SECRET` — defaults to `development-secret-key` if unset

The dev script uses `NODE_OPTIONS=--require ./node-compat.cjs` (Windows-specific; already embedded in npm scripts).

## Architecture

### Data Flow

1. User sends a message → `POST /api/chat` (`src/app/api/chat/route.ts`)
2. Server reconstructs a `VirtualFileSystem` from the serialized `files` payload
3. `streamText` from Vercel AI SDK streams the LLM response with two tools: `str_replace_editor` and `file_manager`
4. Tool calls mutate the `VirtualFileSystem` in memory
5. On finish, if authenticated, the full message history and serialized file system are persisted to the `Project` record in SQLite via Prisma
6. Client receives the stream → `FileSystemContext` applies tool-call results to its own `VirtualFileSystem` copy → `PreviewFrame` re-renders the iframe

### Key Abstractions

**`VirtualFileSystem`** (`src/lib/file-system.ts`) — in-memory file system with no disk I/O. Supports create, view, replace, insert, rename, delete, serialize/deserialize. Both the API route and the client hold independent instances that stay in sync via serialized snapshots.

**`FileSystemContext`** (`src/lib/contexts/file-system-context.tsx`) — React context wrapping the client-side `VirtualFileSystem`. Processes incoming tool-call results, selects the active file, and provides a refresh trigger for the preview.

**`ChatContext`** (`src/lib/contexts/chat-context.tsx`) — Wraps Vercel AI SDK's `useChat` hook, connects tool-call results to `FileSystemContext`, and tracks anonymous work state.

**`getLanguageModel()`** (`src/lib/provider.ts`) — Returns an Anthropic `claude-haiku-4-5` model when `ANTHROPIC_API_KEY` is set, or `MockLanguageModel` otherwise. Mock streams pre-built component examples with realistic delays.

**Generation prompt** (`src/lib/prompts/generation.tsx`) — Instructs the AI to: always create `/App.jsx` as root, use Tailwind CSS only (no inline styles), use `@/` alias for local imports, keep the virtual FS flat.

### URL / Page Structure

| Route | Purpose |
|---|---|
| `/` | Home — redirects authenticated users to their latest project, creates one if none exist; anonymous users get a fresh session |
| `/[projectId]` | Project workspace (authenticated only) — loads project from DB |
| `POST /api/chat` | Streaming chat endpoint; handles tool calls and project persistence |

### Database

The database schema is defined in `prisma/schema.prisma` — reference it whenever you need to understand the structure of data stored in the database.

SQLite via Prisma. Two models:
- `User` — email + bcrypt password
- `Project` — belongs to optional `User`; `messages` and `data` fields are JSON strings storing chat history and serialized `VirtualFileSystem` nodes

### Auth

JWT sessions via `jose`, stored in an HTTP-only cookie (`src/lib/auth.ts`). Server actions in `src/actions/index.ts` handle sign-up/sign-in/sign-out. Middleware (`src/middleware.ts`) protects `/api/projects` and `/api/filesystem`.

### Preview

`PreviewFrame` (`src/components/preview/PreviewFrame.tsx`) renders an iframe. `jsx-transformer.ts` builds an import map and injects Babel Standalone to compile JSX at runtime inside the iframe. Entry point auto-detection prefers `App.jsx` → `App.tsx` → `index.jsx`.

### UI

Three-panel resizable layout (`react-resizable-panels`): Chat (left) | Preview or Code Editor (right). Code Editor tab splits into `FileTree` (30 %) and Monaco `CodeEditor` (70 %). shadcn/ui "new-york" style with Tailwind CSS v4 and `@/` import alias.

### Anonymous User Flow

Anonymous users work in a stateless session — nothing is persisted server-side. `anon-work-tracker.ts` saves messages and file system data to `sessionStorage`. When an anonymous user signs in or signs up, `ChatContext` reads this data and migrates it into the newly created project.

### Server Actions

`src/actions/` contains Next.js server actions for auth (`index.ts`: sign-up, sign-in, sign-out, `getUser`) and project CRUD (`create-project.ts`, `get-project.ts`, `get-projects.ts`). These are called directly from Server and Client Components — no separate API routes needed for project management.

### Testing

Vitest + Testing Library in jsdom environment. Tests live alongside source in `__tests__/` subdirectories.
