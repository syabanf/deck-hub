// Package log provides a Mailer that writes to the server log instead of
// sending anything.
//
// It exists so the whole registration flow is exercisable without SMTP
// credentials: the verification link appears in the terminal running the API,
// and you paste it into the browser. Swapping in a real transport later means
// writing another domain.Mailer — nothing above this layer changes.
package log

import (
	"context"
	"log"
)

type Mailer struct{}

func New() *Mailer { return &Mailer{} }

// SendVerification prints the link. Deliberately loud and bracketed: it has to
// be findable in a log that is also carrying a request line per HTTP call.
func (m *Mailer) SendVerification(_ context.Context, to, name, verifyURL string) error {
	log.Printf("\n"+
		"┌─ EMAIL (dev mailer — nothing was actually sent) ─────────────\n"+
		"│ To:      %s <%s>\n"+
		"│ Subject: Verify your WIT account\n"+
		"│\n"+
		"│ Verify:  %s\n"+
		"└──────────────────────────────────────────────────────────────",
		name, to, verifyURL)
	return nil
}
