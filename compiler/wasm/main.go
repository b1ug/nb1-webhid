//go:build js && wasm

package main

import (
	"syscall/js"

	browsercompiler "github.com/b1ug/nb1/internal/browsercompiler"
)

var callbacks []js.Func

func main() {
	api := js.Global().Get("Object").New()
	for _, name := range []string{"info", "resolveColor", "compileAction", "compileSequence", "compileRequest", "planSequence"} {
		method := name
		callback := js.FuncOf(func(_ js.Value, args []js.Value) interface{} {
			raw, aliases := "", ""
			if method != "info" {
				if len(args) < 1 || args[0].Type() != js.TypeString {
					return `{"ok":false,"error":{"code":"invalid_input","message":"pass a JSON string as the first argument"}}`
				}
				raw = args[0].String()
				if len(args) > 1 {
					if args[1].Type() != js.TypeString {
						return `{"ok":false,"error":{"code":"invalid_input","message":"aliases must be a JSON string"}}`
					}
					aliases = args[1].String()
				}
			}
			return browsercompiler.Call(method, raw, aliases)
		})
		callbacks = append(callbacks, callback)
		api.Set(method, callback)
	}
	js.Global().Set("nb1Go", api)
	if ready := js.Global().Get("nb1GoOnReady"); ready.Type() == js.TypeFunction {
		ready.Invoke()
	}
	select {}
}
