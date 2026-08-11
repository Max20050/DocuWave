package datasource

import (
	"context"
	"fmt"
	"io"
	"net/http"

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

func (c *googleSheetsConnector) TestConnection(ctx context.Context) error {
	client := c.oauthConfig.Client(ctx, c.token)

	reqURL := fmt.Sprintf("https://sheets.googleapis.com/v4/spreadsheets/%s?fields=spreadsheetId", c.spreadsheetID)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, reqURL, nil)
	if err != nil {
		return err
	}

	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("unexpected status %d from sheets api: %s", resp.StatusCode, string(body))
	}
	return nil
}
