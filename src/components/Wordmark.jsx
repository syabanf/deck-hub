// The WIT logo, in one place.
//
// It used to be the letters "WIT" typed out in seven components and styled
// with `font-black tracking-tighter` — a lookalike, not the logo. Which meant
// the brand lived in whatever font the visitor's machine happened to have, and
// changing it meant finding all seven.
//
// The file is the white-on-transparent variant from the 2024-04 logo pack.
// Every surface it appears on in this app is dark; if a light one ever turns
// up, that pack's black variant is the one to add beside it.
export default function Wordmark({ className = 'h-7', ...rest }) {
  return (
    <img
      src="/wit-logo.png"
      alt="WIT"
      // width/height keep the row from reflowing while the image loads, which
      // on the sign-in screen is the difference between a settled page and one
      // that jumps under the cursor.
      width={2639}
      height={827}
      // max-w-none matters: Tailwind's preflight puts `max-width: 100%` on
      // every image, and inside a flex row that sizes itself to its content
      // that is circular — the image waits for the parent, the parent waits
      // for the image, and both settle on zero. The wordmark vanished and the
      // header collapsed to its own padding.
      className={`w-auto max-w-none select-none ${className}`}
      draggable={false}
      {...rest}
    />
  )
}
