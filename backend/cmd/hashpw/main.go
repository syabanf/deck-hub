// Command hashpw prints a bcrypt hash for a plaintext password.
//
// Usage:
//
//	go run ./cmd/hashpw <plaintext>
//
// It is used to (re)generate the seed admin password hash embedded in
// migrations/000001_init.up.sql. Run it once and paste the output into the
// migration's INSERT statement, or use it whenever you need a fresh hash.
package main

import (
	"fmt"
	"os"

	"golang.org/x/crypto/bcrypt"
)

func main() {
	if len(os.Args) != 2 {
		fmt.Fprintln(os.Stderr, "usage: go run ./cmd/hashpw <plaintext>")
		os.Exit(2)
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(os.Args[1]), bcrypt.DefaultCost)
	if err != nil {
		fmt.Fprintf(os.Stderr, "error: %v\n", err)
		os.Exit(1)
	}
	fmt.Println(string(hash))
}
