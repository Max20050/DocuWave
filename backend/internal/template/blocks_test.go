package template

import (
	"errors"
	"strings"
	"testing"
)

// A custom design with no blocks shouldn't naturally happen, but has to
// preview and print something rather than fail — the same courtesy every
// starter gives an empty mapping.
func TestCustomTemplateWithNoBlocks(t *testing.T) {
	custom := CustomTemplate{ID: "c-1", Name: "Empty"}

	doc := custom.Document(sampleData(), Config{})
	if len(doc.Blocks) != 1 || doc.Blocks[0].Note != noBlocksNote {
		t.Fatalf("got %+v, want a single block explaining there is nothing to show", doc.Blocks)
	}

	html, err := custom.Render(sampleData(), Config{})
	if err != nil {
		t.Fatalf("Render returned error: %v", err)
	}
	if !strings.Contains(string(html), noBlocksNote) {
		t.Errorf("the page does not say %q", noBlocksNote)
	}
	if len(custom.Meta().Slots) != 2 {
		t.Errorf("got %d slots for a blockless design, want just title and note", len(custom.Meta().Slots))
	}
}

// A block whose slots haven't been mapped yet still renders, saying what's
// missing — a custom design starts in exactly this state.
func TestCustomTemplateUnmappedBlocks(t *testing.T) {
	custom := CustomTemplate{
		ID:   "c-1",
		Name: "Sales overview",
		Blocks: []BlockDef{
			{ID: "b1", Kind: BlockTable, Title: "Rows"},
			{ID: "b2", Kind: BlockGrouped, Title: "By region"},
			{ID: "b3", Kind: BlockKPI, Title: "Headline"},
			{ID: "b4", Kind: BlockText, Title: "Note", Note: "See appendix."},
		},
	}

	doc := custom.Document(sampleData(), Config{})
	if len(doc.Blocks) != 4 {
		t.Fatalf("got %d blocks, want one per defined block", len(doc.Blocks))
	}
	wantNotes := []string{blockTableUnmappedNote, blockGroupedUnmappedNote, blockKPIUnmappedNote, "See appendix."}
	for i, want := range wantNotes {
		if doc.Blocks[i].Note != want {
			t.Errorf("block %d: got note %q, want %q", i, doc.Blocks[i].Note, want)
		}
	}
	// The text block has no data slots to map, so it isn't required to have any.
	if doc.Blocks[3].Title != "Note" {
		t.Errorf("got title %q for the text block, want its own title", doc.Blocks[3].Title)
	}

	html, err := custom.Render(sampleData(), Config{})
	if err != nil {
		t.Fatalf("Render returned error: %v", err)
	}
	for _, want := range wantNotes {
		if !strings.Contains(string(html), want) {
			t.Errorf("the page does not say %q", want)
		}
	}
}

// Two blocks of the same kind with colliding titles print as distinct slots —
// identity comes from the block's ID, not its (possibly duplicated) title.
func TestCustomTemplateDuplicateBlockTitles(t *testing.T) {
	custom := CustomTemplate{
		ID:   "c-1",
		Name: "Two tables",
		Blocks: []BlockDef{
			{ID: "b1", Kind: BlockTable, Title: "Sales"},
			{ID: "b2", Kind: BlockTable, Title: "Sales"},
		},
	}

	meta := custom.Meta()
	keys := make(map[string]bool)
	for _, slot := range meta.Slots {
		if keys[slot.Key] {
			t.Fatalf("duplicate slot key %q despite distinct block IDs", slot.Key)
		}
		keys[slot.Key] = true
	}
	if len(meta.Slots) != 4 { // title, note, + one "columns" slot per table block
		t.Fatalf("got %d slots, want 4", len(meta.Slots))
	}

	cfg := Config{Columns: map[string][]string{
		"b1:columns": {"region"},
		"b2:columns": {"revenue"},
	}}
	doc := custom.Document(sampleData(), cfg)
	if len(doc.Blocks) != 2 {
		t.Fatalf("got %d blocks, want 2", len(doc.Blocks))
	}
	if doc.Blocks[0].Table.Columns[0].Name != "region" {
		t.Errorf("first block mapped to the wrong column: %+v", doc.Blocks[0].Table.Columns)
	}
	if doc.Blocks[1].Table.Columns[0].Name != "revenue" {
		t.Errorf("second block mapped to the wrong column: %+v", doc.Blocks[1].Table.Columns)
	}
	// Both blocks are titled "Sales" in the rendered document — that's allowed.
	if doc.Blocks[0].Title != "Sales" || doc.Blocks[1].Title != "Sales" {
		t.Errorf("got titles %q and %q, want both to print as \"Sales\"", doc.Blocks[0].Title, doc.Blocks[1].Title)
	}
}

// A table block whose mapped query returns zero rows renders an explicit
// empty state rather than breaking.
func TestCustomTemplateBlockWithZeroRows(t *testing.T) {
	custom := CustomTemplate{ID: "c-1", Name: "Empty result", Blocks: []BlockDef{
		{ID: "b1", Kind: BlockTable, Title: "Rows"},
	}}
	data := Data{Columns: []string{"region", "revenue"}} // no rows

	doc := custom.Document(data, Config{Columns: map[string][]string{"b1:columns": {"region"}}})
	block := doc.Blocks[0]
	if block.Table == nil {
		t.Fatal("got no table, want the mapped columns even with no rows")
	}
	if block.Note != noRowsNote {
		t.Errorf("got note %q, want %q", block.Note, noRowsNote)
	}
}

// A KPI or grouped-table metric mapped to a column that isn't actually
// numeric still renders — the total is whatever toNumber can make of it,
// which is zero for values that aren't numbers at all, consistent with how
// the starter KPI and grouped templates already behave.
func TestCustomTemplateNonNumericMetric(t *testing.T) {
	data := Data{
		Columns: []string{"region", "note"},
		Rows: [][]any{
			{"North", "n/a"},
			{"South", "also text"},
		},
	}
	custom := CustomTemplate{ID: "c-1", Name: "KPI", Blocks: []BlockDef{
		{ID: "b1", Kind: BlockKPI, Title: "Headline"},
	}}

	doc := custom.Document(data, Config{Columns: map[string][]string{"b1:metrics": {"note"}}})
	tiles := doc.Blocks[0].Tiles
	if len(tiles) != 1 {
		t.Fatalf("got %d tiles, want 1", len(tiles))
	}
	if tiles[0].Value.Number != 0 {
		t.Errorf("got total %v for an all-text column, want 0", tiles[0].Value.Number)
	}
}

// A slot that no longer exists in the current query's columns — a stale
// mapping — is caught by Validate the same way it is for every starter, since
// CustomTemplate.Meta declares its slots the same way.
func TestCustomTemplateStaleMapping(t *testing.T) {
	custom := CustomTemplate{ID: "c-1", Name: "Sales", Blocks: []BlockDef{
		{ID: "b1", Kind: BlockTable, Title: "Rows"},
	}}
	cfg := Config{Columns: map[string][]string{"b1:columns": {"profit"}}}

	err := Validate(custom, cfg, []string{"region", "revenue"})
	if !errors.Is(err, ErrInvalidConfig) {
		t.Fatalf("got %v, want ErrInvalidConfig for a column the query no longer returns", err)
	}
	if !strings.Contains(err.Error(), "profit") {
		t.Errorf("error %q does not name the stale column", err)
	}

	// An unmapped required slot is caught the same way.
	err = Validate(custom, Config{}, []string{"region", "revenue"})
	if !errors.Is(err, ErrInvalidConfig) {
		t.Fatalf("got %v, want ErrInvalidConfig for an unmapped required slot", err)
	}
}

// Render is built from Document, so the page and the structural projection
// can never disagree about what a composed design shows.
func TestCustomTemplateRenderMatchesDocument(t *testing.T) {
	custom := CustomTemplate{ID: "c-1", Name: "Overview", Blocks: []BlockDef{
		{ID: "b1", Kind: BlockGrouped, Title: "By region"},
		{ID: "b2", Kind: BlockKPI, Title: "Totals"},
	}}
	cfg := Config{
		Text: map[string]string{"title": "Q3 overview"},
		Columns: map[string][]string{
			"b1:group":   {"region"},
			"b1:metrics": {"revenue"},
			"b2:metrics": {"revenue", "units"},
		},
	}

	doc := custom.Document(sampleData(), cfg)
	html, err := custom.Render(sampleData(), cfg)
	if err != nil {
		t.Fatalf("Render returned error: %v", err)
	}
	page := string(html)

	if !strings.Contains(page, "Q3 overview") {
		t.Error("document is missing the mapped title")
	}
	if !strings.Contains(page, "By region") || !strings.Contains(page, "Totals") {
		t.Error("document is missing a block title")
	}
	if !strings.Contains(page, "2,200.50") { // North's grouped total
		t.Error("document is missing the grouped block's total")
	}
	if !strings.Contains(page, `<p class="tile-value">3,000.50</p>`) {
		t.Error("document is missing the KPI block's tile")
	}
	if len(doc.Blocks) != 2 {
		t.Fatalf("got %d blocks, want the 2 defined", len(doc.Blocks))
	}
}

func TestPrepareBlocksAssignsAndPreservesIDs(t *testing.T) {
	prepared, err := PrepareBlocks([]BlockDef{
		{Kind: BlockTable, Title: "New"},
		{ID: "kept", Kind: BlockText, Title: "Kept", Note: "hi"},
	})
	if err != nil {
		t.Fatalf("PrepareBlocks returned error: %v", err)
	}
	if prepared[0].ID == "" {
		t.Error("a block with no ID should be assigned one")
	}
	if prepared[1].ID != "kept" {
		t.Errorf("got ID %q, want the existing ID preserved", prepared[1].ID)
	}
}

func TestPrepareBlocksRejectsUnknownKind(t *testing.T) {
	_, err := PrepareBlocks([]BlockDef{{Kind: "chart", Title: "Nope"}})
	if !errors.Is(err, ErrInvalidConfig) {
		t.Fatalf("got %v, want ErrInvalidConfig for an unknown block kind", err)
	}
}

// Two blocks that arrive with the same ID (a client bug, or two blocks copied
// from one another) still end up addressable: PrepareBlocks reassigns
// whichever collides rather than silently merging their slots.
func TestPrepareBlocksDeduplicatesColldingIDs(t *testing.T) {
	prepared, err := PrepareBlocks([]BlockDef{
		{ID: "dup", Kind: BlockTable, Title: "First"},
		{ID: "dup", Kind: BlockTable, Title: "Second"},
	})
	if err != nil {
		t.Fatalf("PrepareBlocks returned error: %v", err)
	}
	if prepared[0].ID == prepared[1].ID {
		t.Fatalf("got two blocks sharing ID %q, want them disambiguated", prepared[0].ID)
	}
}
