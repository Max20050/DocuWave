# Report templates — architecture

How a report's rows become a document, and where a future drag-and-drop builder
plugs in.

## The pieces

| Piece | Where |
|---|---|
| Interface, slots, mapping, validation | `backend/internal/template/template.go` |
| Template source (lookup + list) | `backend/internal/template/registry.go` |
| Shared document shell, CSS, value formatting | `backend/internal/template/document.go` |
| Starter templates | `tabular.go`, `grouped.go`, `kpi.go` |
| HTTP endpoints | `backend/internal/report/handlers.go` |
| Persisted selection + mapping | `reports.template_id`, `reports.template_config` |
| Template picker and field mapping UI | `frontend/app/ui/template-picker.tsx` |

## The interface

```go
type Template interface {
    Meta() Meta                          // id, name, description, slots
    Render(Data, Config) ([]byte, error) // a complete HTML document
}
```

- **`Meta`** describes the template *and* the slots it exposes. The UI builds its
  field-mapping controls entirely from `Meta`, so a template that declares its
  slots correctly needs no frontend work.
- **`Slot`** is one hole in the layout: `text` (typed text, e.g. a title),
  `column` (one query output column), or `columns` (an ordered list). `numeric`
  marks slots meant for measures; it's a hint the UI uses to offer likely
  columns first, not a constraint — whether a column holds numbers is only
  knowable once the query has run, and a spreadsheet's `"1,234.50"` counts.
- **`Config`** is the user's mapping of slot keys to columns and text. It is
  persisted as JSONB, so its JSON shape is a storage format.
- **`Data`** is the query output: columns, rows, and an optional generation time.

`Validate(template, config, queryColumns)` is the one gate. Pass the query's
columns to also check that every mapped column exists; pass `nil` when they
aren't known yet, which is the case when saving a report (saving must not run
the user's query).

## Why HTML

`Render` returns a self-contained HTML document — styles inlined, no scripts, no
external requests. One artifact then serves three consumers:

1. the layout preview in the app (an iframe with an empty `sandbox`),
2. the PDF renderer (issue #10 feeds these bytes to a print engine),
3. anything that archives or emails a report body.

Excel and CSV output (also #10) doesn't come from the HTML — those formats take
the rows and the mapping directly, because a spreadsheet wants cells, not a page.

## The render pipeline

```
stored query ─▶ connector.RunQuery ─▶ template.Data
                                          │
              stored template_id ─▶ Registry.Get ─┐
              stored template_config ─────────────┴─▶ Validate ─▶ Render ─▶ []byte
```

Nothing in that path knows which template it's running. `Registry.Render` is the
whole of it:

```go
func (r *Registry) Render(id string, data Data, cfg Config) ([]byte, error)
```

## Adding a template

1. Add a type in `backend/internal/template/` implementing `Template`.
2. Declare its slots in `Meta`.
3. Build its body with `mustDocument(...)` and render with `renderDocument(...)`,
   so it prints inside the shared document shell.
4. Add it to `Starters()`.

That's the whole checklist — no handler, storage, or frontend change. The UI
picks up the new template from `GET /api/report-templates` and generates its
mapping controls from the slots.

## Plugging in the v2 drag-and-drop builder

The builder becomes a **template source**, not a second rendering path. Today
`Registry` is the only source: process-wide, built at startup from `Starters()`,
and reached through `Get`/`List`/`Render`.

A builder produces per-user templates, so v2 introduces a source interface the
handlers depend on instead of the concrete registry:

```go
type Source interface {
    List(ctx context.Context, userID string) ([]Meta, error)
    Get(ctx context.Context, userID, id string) (Template, error)
}
```

- The built-in `Registry` satisfies it by ignoring `userID` — the starters are
  available to everyone.
- A `BuilderSource` loads a user's saved layout from the database and returns a
  `Template` that renders it. A builder layout is data; the type that renders
  that data is what implements the interface.
- A composite source checks the user's own templates first, then the starters.

What does **not** change: `Template`, `Meta`, `Slot`, `Config`, `Data`,
`Validate`, the stored `template_id` + `template_config`, the HTTP endpoints, and
the UI — because the UI already renders whatever slots a template declares
rather than anything specific to the starters.

## API

| Endpoint | Purpose |
|---|---|
| `GET /api/report-templates` | Templates with their slots — the picker and mapping UI are built from this |
| `POST /api/reports/preview-template` | Runs the query, renders the chosen template with the real rows, returns `{ "html": ... }` |
| `POST /api/reports` | Saves `templateId` + `templateConfig` with the rest of the report |

`POST /api/reports` validates the mapping against the template's slots but not
against the query's columns; the render path re-validates against the rows it
actually receives, and reports a stale mapping by name.

## Notes on rendering behaviour

- **Escaping.** Report content is a user's own data, so it is data, not markup:
  `html/template` escapes every value and title.
- **Totals** ignore values that aren't numbers, so one stray label in a column
  doesn't void a total. Text a source formatted itself (`"$1,234.50"`) is parsed.
- **Alignment** follows the data: a column whose every value reads as a number is
  right-aligned with tabular figures; one label in it makes the column text.
- **A partial mapping still renders.** The preview has to show something while
  the user is still filling slots in, so a template with unmapped slots prints
  what it has and says what's missing.
- **Empty results are a normal outcome** — the document says so rather than
  failing.
