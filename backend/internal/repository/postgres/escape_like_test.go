package postgres

import "testing"

// TestEscapeLike pins the escaping of ILIKE metacharacters.
//
// Before this, searching for "%" matched every row in the catalog: the string
// went straight into '%' || $1 || '%' and the user's own % became a wildcard.
func TestEscapeLike(t *testing.T) {
	cases := []struct{ in, want string }{
		{"plain", "plain"},
		{"50%", `50\%`},
		{"a_b", `a\_b`},
		{"%", `\%`},
		{"%_%", `\%\_\%`},
		// The backslash must be escaped first, or the escapes added for % and _
		// would themselves get mangled by it.
		{`back\slash`, `back\\slash`},
		{`\%`, `\\\%`},
		{"", ""},
	}
	for _, c := range cases {
		if got := escapeLike(c.in); got != c.want {
			t.Errorf("escapeLike(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}
