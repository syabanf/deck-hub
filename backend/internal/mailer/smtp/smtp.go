// Package smtp sends verification email over SMTP.
//
// The log mailer is fine for development — it prints the link to the terminal.
// In production nothing reaches the recipient, so every self-service sign-up
// stops at "check your inbox" forever. This is the transport that finishes the
// flow.
//
// Nothing above domain.Mailer changes: main.go picks this when SMTP_HOST is
// configured and falls back to the log mailer when it is not.
package smtp

import (
	"context"
	"crypto/tls"
	"fmt"
	"mime"
	"net"
	"net/smtp"
	"strings"
	"time"
)

// Config is the SMTP connection and envelope.
type Config struct {
	Host     string
	Port     string
	Username string
	Password string
	From     string // the envelope sender, e.g. "WIT <no-reply@wit.id>"
}

type Mailer struct {
	cfg Config
}

func New(cfg Config) *Mailer { return &Mailer{cfg: cfg} }

// SendVerification delivers the verification link.
func (m *Mailer) SendVerification(ctx context.Context, to, name, verifyURL string) error {
	subject := "Verify your WIT account"
	body := buildBody(name, verifyURL)

	msg := m.compose(to, subject, body)

	addr := net.JoinHostPort(m.cfg.Host, m.cfg.Port)

	// A hung mail server must not hold an HTTP request open. The handler already
	// treats a send failure as non-fatal — the account exists and the user can
	// ask for another link — so failing fast is strictly better than hanging.
	dialer := &net.Dialer{Timeout: 10 * time.Second}
	conn, err := dialer.DialContext(ctx, "tcp", addr)
	if err != nil {
		return fmt.Errorf("dial smtp %s: %w", addr, err)
	}

	client, err := smtp.NewClient(conn, m.cfg.Host)
	if err != nil {
		conn.Close()
		return fmt.Errorf("smtp handshake: %w", err)
	}
	defer client.Close()

	// STARTTLS whenever the server offers it. Credentials and the verification
	// link — which is a bearer token in a URL — must not cross the wire in clear.
	if ok, _ := client.Extension("STARTTLS"); ok {
		if err := client.StartTLS(&tls.Config{ServerName: m.cfg.Host}); err != nil {
			return fmt.Errorf("starttls: %w", err)
		}
	}

	if m.cfg.Username != "" {
		auth := smtp.PlainAuth("", m.cfg.Username, m.cfg.Password, m.cfg.Host)
		if err := client.Auth(auth); err != nil {
			return fmt.Errorf("smtp auth: %w", err)
		}
	}

	if err := client.Mail(envelopeAddress(m.cfg.From)); err != nil {
		return fmt.Errorf("smtp from: %w", err)
	}
	if err := client.Rcpt(to); err != nil {
		return fmt.Errorf("smtp rcpt: %w", err)
	}

	w, err := client.Data()
	if err != nil {
		return fmt.Errorf("smtp data: %w", err)
	}
	if _, err := w.Write([]byte(msg)); err != nil {
		return fmt.Errorf("write message: %w", err)
	}
	if err := w.Close(); err != nil {
		return fmt.Errorf("close message: %w", err)
	}
	return client.Quit()
}

// compose builds the RFC 5322 message.
//
// CRLF line endings and a bare-dot guard are not optional: SMTP terminates the
// body at a line containing only ".", so a message carrying one would be
// truncated there.
func (m *Mailer) compose(to, subject, body string) string {
	var b strings.Builder
	b.WriteString("From: " + m.cfg.From + "\r\n")
	b.WriteString("To: " + to + "\r\n")
	// Encode the subject so non-ASCII survives; it is ASCII today, but a
	// translated subject would arrive as mojibake without this.
	b.WriteString("Subject: " + mime.QEncoding.Encode("utf-8", subject) + "\r\n")
	b.WriteString("MIME-Version: 1.0\r\n")
	b.WriteString("Content-Type: text/plain; charset=utf-8\r\n")
	b.WriteString("\r\n")

	for _, line := range strings.Split(body, "\n") {
		if line == "." {
			line = ".."
		}
		b.WriteString(line + "\r\n")
	}
	return b.String()
}

func buildBody(name, verifyURL string) string {
	greeting := "Hi"
	if name = strings.TrimSpace(name); name != "" {
		greeting = "Hi " + name
	}
	return greeting + ",\n\n" +
		"Confirm your email address to finish setting up your WIT account:\n\n" +
		verifyURL + "\n\n" +
		"The link works once and expires in 24 hours.\n\n" +
		"If you didn't create this account, you can ignore this message — nothing\n" +
		"happens until the link is opened.\n"
}

// envelopeAddress strips a display name: MAIL FROM takes a bare address, so
// "WIT <no-reply@wit.id>" has to become "no-reply@wit.id".
func envelopeAddress(from string) string {
	if i := strings.LastIndex(from, "<"); i >= 0 {
		if j := strings.LastIndex(from, ">"); j > i {
			return from[i+1 : j]
		}
	}
	return strings.TrimSpace(from)
}
