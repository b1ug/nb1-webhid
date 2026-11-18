// Package bridge adapts the existing native compiler to a browser-safe JSON boundary.
// It performs no USB, HTTP, storage, timers or device execution.
package browsercompiler

import (
	"encoding/json"
	"fmt"

	"github.com/b1ug/nb1/internal/actionv1"
	"github.com/b1ug/nb1/internal/colorinput"
	"github.com/b1ug/nb1/internal/jsoninput"
	"github.com/b1ug/nb1/internal/sequence"
)

const SourceCommit = "b5cfe68cbb412d81a80d948b845aee5b0aba586b"

type response struct {
	OK     bool        `json:"ok"`
	Result interface{} `json:"result,omitempty"`
	Error  *issue      `json:"error,omitempty"`
}

type issue struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

type compiled struct {
	Sequence          sequence.Sequence `json:"sequence"`
	TotalSteps        int               `json:"total_steps"`
	NominalDurationMS int64             `json:"nominal_duration_ms"`
}

// Call accepts a method, its bare JSON value and an optional JSON map of local
// color aliases. The caller owns storage and must pass aliases explicitly.
func Call(method, raw, aliasesJSON string) string {
	result, err := call(method, raw, aliasesJSON)
	return encode(result, err)
}

func encode(result interface{}, err error) string {
	answer := response{OK: err == nil, Result: result}
	if err != nil {
		answer.Result = nil
		answer.Error = &issue{Code: "invalid_input", Message: err.Error()}
	}
	data, marshalErr := json.Marshal(answer)
	if marshalErr != nil {
		return `{"ok":false,"error":{"code":"internal_error","message":"could not encode compiler output"}}`
	}
	return string(data)
}

func call(method, raw, aliasesJSON string) (interface{}, error) {
	if method == "info" {
		return map[string]interface{}{
			"contract": "nb1-browser-compiler/experimental-v1", "source_commit": SourceCommit,
			"shared_packages": []string{"actionv1", "sequence", "colorinput", "jsoninput"},
			"methods":         []string{"info", "resolveColor", "compileAction", "compileSequence", "compileRequest", "planSequence"},
			"actions":         []string{"set", "off", "fade", "blink", "breathe", "pulse", "alternate", "orbit", "rainbow"},
			"hardware_io":     false, "execution": false, "storage": false,
		}, nil
	}
	if len(raw) > sequence.MaxInputBytes || len(aliasesJSON) > sequence.MaxInputBytes {
		return nil, fmt.Errorf("input must be at most %d bytes", sequence.MaxInputBytes)
	}
	aliases := map[string]string{}
	if aliasesJSON != "" {
		if err := jsoninput.DecodeObject([]byte(aliasesJSON), &aliases); err != nil {
			return nil, fmt.Errorf("aliases: %w", err)
		}
	}
	resolveAlias := func(name string) (string, error) {
		value, ok := aliases[name]
		if !ok {
			return "", fmt.Errorf("unknown color alias %q", "@"+name)
		}
		return value, nil
	}
	if method == "compileRequest" {
		if !jsoninput.ValidUnicode([]byte(raw)) {
			return nil, fmt.Errorf("request must contain valid Unicode")
		}
		var request struct {
			Action   json.RawMessage `json:"action,omitempty"`
			Sequence json.RawMessage `json:"sequence,omitempty"`
		}
		if err := jsoninput.DecodeObject([]byte(raw), &request); err != nil {
			return nil, err
		}
		if (request.Action != nil) == (request.Sequence != nil) {
			return nil, fmt.Errorf("request requires exactly one of action or sequence")
		}
		if request.Action != nil {
			method, raw = "compileAction", string(request.Action)
		} else {
			method, raw = "compileSequence", string(request.Sequence)
		}
	}
	var plan sequence.Sequence
	var err error
	switch method {
	case "resolveColor":
		canonical, err := actionv1.ResolveColor([]byte(raw), resolveAlias)
		if err != nil {
			return nil, err
		}
		quoted, _ := json.Marshal(canonical)
		color, err := colorinput.ResolveJSON(quoted)
		if err != nil {
			return nil, err
		}
		return map[string]interface{}{"canonical_color": canonical, "rgb8": color.RGB8}, nil
	case "compileAction":
		plan, err = actionv1.Compile([]byte(raw), resolveAlias)
	case "compileSequence", "planSequence":
		plan, err = sequence.DecodeAuthoring([]byte(raw), func(color json.RawMessage) (string, error) {
			return actionv1.ResolveColor(color, resolveAlias)
		})
	default:
		return nil, fmt.Errorf("unknown compiler method %q", method)
	}
	if err != nil {
		return nil, err
	}
	if method == "planSequence" {
		return sequence.Plan(plan)
	}
	return compiled{Sequence: plan, TotalSteps: len(plan.Steps) * plan.Repeat, NominalDurationMS: plan.NominalDurationMS()}, nil
}
