package datasource

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"

	"golang.org/x/oauth2"
)

// googleSheetsConnector verifies that a specific spreadsheet is reachable
// with the connected account's OAuth token. It implements the same Connector
// interface as the SQL connectors.
type googleSheetsConnector struct {
	oauthConfig   *oauth2.Config
	token         *oauth2.Token
	spreadsheetID string
}

// get performs an authorized GET against the Sheets API, decoding the
// response into target when one is supplied.
func (c *googleSheetsConnector) get(ctx context.Context, reqURL string, target any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, reqURL, nil)
	if err != nil {
		return err
	}

	resp, err := c.oauthConfig.Client(ctx, c.token).Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("unexpected status %d from sheets api: %s", resp.StatusCode, string(body))
	}
	if target == nil {
		return nil
	}
	return json.NewDecoder(resp.Body).Decode(target)
}

func (c *googleSheetsConnector) TestConnection(ctx context.Context) error {
	reqURL := fmt.Sprintf("https://sheets.googleapis.com/v4/spreadsheets/%s?fields=spreadsheetId", c.spreadsheetID)
	return c.get(ctx, reqURL, nil)
}

type spreadsheetProperties struct {
	Sheets []struct {
		Properties struct {
			Title string `json:"title"`
		} `json:"properties"`
	} `json:"sheets"`
}

type valueRange struct {
	Values [][]string `json:"values"`
}

// Introspect reads the header row of the spreadsheet's first sheet, which is
// the closest equivalent Sheets has to a column list.
func (c *googleSheetsConnector) Introspect(ctx context.Context) (Schema, error) {
	var properties spreadsheetProperties
	metaURL := fmt.Sprintf("https://sheets.googleapis.com/v4/spreadsheets/%s?fields=sheets.properties.title", c.spreadsheetID)
	if err := c.get(ctx, metaURL, &properties); err != nil {
		return Schema{}, err
	}
	if len(properties.Sheets) == 0 {
		return Schema{}, errors.New("spreadsheet has no sheets")
	}

	// A1 notation quotes the sheet title, and escapes any quote inside it by doubling.
	title := properties.Sheets[0].Properties.Title
	headerRange := fmt.Sprintf("'%s'!1:1", strings.ReplaceAll(title, "'", "''"))

	var header valueRange
	valuesURL := fmt.Sprintf(
		"https://sheets.googleapis.com/v4/spreadsheets/%s/values/%s",
		c.spreadsheetID, url.PathEscape(headerRange),
	)
	if err := c.get(ctx, valuesURL, &header); err != nil {
		return Schema{}, err
	}

	return Schema{Fields: headerFields(header.Values)}, nil
}
