package datasource

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
)

// RestHeader is one caller-supplied header sent with every request a REST API
// connector makes.
type RestHeader struct {
	Key   string `json:"key"`
	Value string `json:"value"`
}

// restAuthConfig is how a REST API source authenticates. It's stored
// encrypted as a whole, because basic/bearer/api-key credentials are secrets
// even though the shape around them (Type, HeaderName) isn't.
type restAuthConfig struct {
	Type        string `json:"type"` // "none", "basic", "bearer", or "api_key"
	Username    string `json:"username,omitempty"`
	Password    string `json:"password,omitempty"`
	Token       string `json:"token,omitempty"`
	HeaderName  string `json:"headerName,omitempty"`
	HeaderValue string `json:"headerValue,omitempty"`
}

// restAuthTypes lists the auth config shapes a REST API source can use.
var restAuthTypes = map[string]bool{
	"none":    true,
	"basic":   true,
	"bearer":  true,
	"api_key": true,
}

// validate reports whether the config carries what its declared Type needs.
func (a restAuthConfig) validate() error {
	if !restAuthTypes[a.Type] {
		return fmt.Errorf("unsupported auth type: %s", a.Type)
	}
	switch a.Type {
	case "basic":
		if a.Username == "" || a.Password == "" {
			return errors.New("basic auth requires a username and password")
		}
	case "bearer":
		if a.Token == "" {
			return errors.New("bearer auth requires a token")
		}
	case "api_key":
		if a.HeaderName == "" || a.HeaderValue == "" {
			return errors.New("api key auth requires a header name and value")
		}
	}
	return nil
}

// apply sets whatever headers the auth config implies on an outgoing request.
func (a restAuthConfig) apply(req *http.Request) {
	switch a.Type {
	case "basic":
		req.SetBasicAuth(a.Username, a.Password)
	case "bearer":
		req.Header.Set("Authorization", "Bearer "+a.Token)
	case "api_key":
		req.Header.Set(a.HeaderName, a.HeaderValue)
	}
}

// restConnector reaches a user-configured REST API. Unlike the SQL
// connectors, it isn't built through NewConnector/connectorRegistry: its
// configuration (URL, headers, auth) doesn't fit ConnectionConfig, the same
// reason Google Sheets is built directly by its own handlers and resolver.
type restConnector struct {
	url     string
	method  string
	headers []RestHeader
	auth    restAuthConfig
	body    string
}

// buildRequest assembles the configured HTTP request, applying headers and
// auth in a fixed order so a caller-supplied header can't silently shadow the
// Authorization header auth sets.
func (c *restConnector) buildRequest(ctx context.Context) (*http.Request, error) {
	method := c.method
	if method == "" {
		method = http.MethodGet
	}

	var bodyReader io.Reader
	if c.body != "" {
		bodyReader = strings.NewReader(c.body)
	}

	req, err := http.NewRequestWithContext(ctx, method, c.url, bodyReader)
	if err != nil {
		return nil, err
	}
	for _, h := range c.headers {
		req.Header.Set(h.Key, h.Value)
	}
	c.auth.apply(req)
	return req, nil
}

// TestConnection issues the configured request and reports failure for
// anything that isn't a 2xx response.
func (c *restConnector) TestConnection(ctx context.Context) error {
	req, err := c.buildRequest(ctx)
	if err != nil {
		return err
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))
		return fmt.Errorf("unexpected status %d from %s: %s", resp.StatusCode, c.url, string(body))
	}
	return nil
}

// QueryLanguage names what compiled queries against this source are shown as.
func (c *restConnector) QueryLanguage() string {
	return "REST API"
}

// fetchJSON issues the configured request and decodes its body as JSON.
func (c *restConnector) fetchJSON(ctx context.Context) (any, error) {
	req, err := c.buildRequest(ctx)
	if err != nil {
		return nil, err
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))
		return nil, fmt.Errorf("unexpected status %d from %s: %s", resp.StatusCode, c.url, string(body))
	}

	var decoded any
	if err := json.NewDecoder(resp.Body).Decode(&decoded); err != nil {
		return nil, fmt.Errorf("decode response as JSON: %w", err)
	}
	return decoded, nil
}

// resultRows finds the array of result objects in a decoded JSON response: the
// response itself if it's an array, or the first array found one level down
// (the common "{ data: [...] }" / "{ results: [...] }" shape). It's the same
// question Introspect and RunQuery both need answered.
func resultRows(decoded any) ([]any, error) {
	switch v := decoded.(type) {
	case []any:
		return v, nil
	case map[string]any:
		for _, value := range v {
			if arr, ok := value.([]any); ok {
				return arr, nil
			}
		}
		// No array field: treat the object itself as the one result row.
		return []any{v}, nil
	default:
		return nil, errors.New("response is neither a JSON array nor object")
	}
}

// Introspect fetches the configured response and reports the fields found on
// its first result object, flattening nested objects to dot-notation. It's a
// first pass: richer type inference and array-of-scalars handling land with
// schema discovery in a follow-up.
func (c *restConnector) Introspect(ctx context.Context) (Schema, error) {
	decoded, err := c.fetchJSON(ctx)
	if err != nil {
		return Schema{}, err
	}

	rows, err := resultRows(decoded)
	if err != nil {
		return Schema{}, err
	}
	if len(rows) == 0 {
		return Schema{Fields: []string{}}, nil
	}

	first, ok := rows[0].(map[string]any)
	if !ok {
		return Schema{}, errors.New("result rows are not JSON objects")
	}

	return Schema{Fields: flattenFields("", first)}, nil
}

// flattenFields lists an object's keys as dot-notated field names, descending
// into nested objects so "user": {"city": ...} becomes "user.city".
func flattenFields(prefix string, obj map[string]any) []string {
	fields := make([]string, 0, len(obj))
	for key, value := range obj {
		name := key
		if prefix != "" {
			name = prefix + "." + key
		}
		if nested, ok := value.(map[string]any); ok {
			fields = append(fields, flattenFields(name, nested)...)
			continue
		}
		fields = append(fields, name)
	}
	return fields
}

// RunQuery is a placeholder until report execution against REST sources is
// implemented (see issue #42): there's no compiled query language for this
// source type yet.
func (c *restConnector) RunQuery(ctx context.Context, query string, args []any, limit int) (QueryResult, error) {
	return QueryResult{}, errors.New("running queries against REST API sources isn't supported yet")
}
