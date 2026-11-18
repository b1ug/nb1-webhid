// Command oracle is an offline native reference for comparing the same compiler
// calls against js/wasm. It does not import or open any hardware transport.
package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"

	browsercompiler "github.com/b1ug/nb1/internal/browsercompiler"
)

func main() {
	scanner := bufio.NewScanner(os.Stdin)
	scanner.Buffer(make([]byte, 4096), 3<<20)
	for scanner.Scan() {
		var request struct {
			Method  string `json:"method"`
			Raw     string `json:"raw"`
			Aliases string `json:"aliases"`
		}
		if err := json.Unmarshal(scanner.Bytes(), &request); err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
		fmt.Println(browsercompiler.Call(request.Method, request.Raw, request.Aliases))
	}
	if err := scanner.Err(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
