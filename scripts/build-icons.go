// Builds the app's icon set from the WIT logo pack.
//
// Run it when the logo changes:
//
//	cd scripts && go run . "<logo pack>/WIT LOGOPACK 2024-02.png" ../public
//
// 2024-02 is the white-on-transparent variant. Every surface this app puts the
// logo on is dark; the black variant in the same pack is the one to reach for
// if a light one ever appears.
//
// No image library beyond the standard one: the only operation needed is a
// box-filter downscale of a large PNG onto a flat background, and writing that
// by hand is smaller than the dependency would be.
package main

import (
	"image"
	"image/color"
	"image/draw"
	"image/png"
	_ "image/png"
	"math"
	"os"
)

// The brand red, read off the logo pack rather than guessed: 33,579 pixels of
// it in both the light and dark variants.
var brandRed = color.NRGBA{0xED, 0x1C, 0x24, 0xFF}

// The app's own background, so an icon sits on the same ground the UI does.
var appBg = color.NRGBA{0x0B, 0x0B, 0x0F, 0xFF}

func load(path string) image.Image {
	f, err := os.Open(path)
	must(err)
	defer f.Close()
	img, err := png.Decode(f)
	must(err)
	return img
}

// scale is a box filter: every destination pixel averages the source pixels it
// covers. Right for downscaling, which is all this does, and it keeps the
// premultiplied alpha honest at the logo's edges.
func scale(src image.Image, w, h int) *image.NRGBA {
	sb := src.Bounds()
	dst := image.NewNRGBA(image.Rect(0, 0, w, h))
	xr := float64(sb.Dx()) / float64(w)
	yr := float64(sb.Dy()) / float64(h)

	for y := 0; y < h; y++ {
		y0 := sb.Min.Y + int(float64(y)*yr)
		y1 := sb.Min.Y + int(math.Ceil(float64(y+1)*yr))
		if y1 > sb.Max.Y {
			y1 = sb.Max.Y
		}
		for x := 0; x < w; x++ {
			x0 := sb.Min.X + int(float64(x)*xr)
			x1 := sb.Min.X + int(math.Ceil(float64(x+1)*xr))
			if x1 > sb.Max.X {
				x1 = sb.Max.X
			}
			var sr, sg, sb2, sa, n float64
			for yy := y0; yy < y1; yy++ {
				for xx := x0; xx < x1; xx++ {
					r, g, b, a := src.At(xx, yy).RGBA() // premultiplied
					sr += float64(r)
					sg += float64(g)
					sb2 += float64(b)
					sa += float64(a)
					n++
				}
			}
			if n == 0 {
				continue
			}
			pr, pg, pb, pa := sr/n, sg/n, sb2/n, sa/n
			var nr, ng, nb float64
			if pa > 0 {
				nr, ng, nb = pr/pa*65535, pg/pa*65535, pb/pa*65535
			}
			dst.SetNRGBA(x, y, color.NRGBA{
				uint8(clamp(nr) / 257), uint8(clamp(ng) / 257),
				uint8(clamp(nb) / 257), uint8(clamp(pa) / 257),
			})
		}
	}
	return dst
}

func clamp(v float64) float64 {
	if v < 0 {
		return 0
	}
	if v > 65535 {
		return 65535
	}
	return v
}

// roundedRect fills an image with bg, rounding the corners to radius r. r of 0
// leaves it square, which is what the maskable and apple-touch icons want —
// the platform does its own masking and a rounded source shows as a gap.
func canvas(size, radius int, bg color.NRGBA) *image.NRGBA {
	img := image.NewNRGBA(image.Rect(0, 0, size, size))
	fr := float64(radius)
	for y := 0; y < size; y++ {
		for x := 0; x < size; x++ {
			if radius > 0 && !inside(float64(x)+0.5, float64(y)+0.5, float64(size), fr) {
				continue
			}
			img.SetNRGBA(x, y, bg)
		}
	}
	return img
}

func inside(x, y, size, r float64) bool {
	cx, cy := x, y
	if cx < r {
		cx = r
	} else if cx > size-r {
		cx = size - r
	}
	if cy < r {
		cy = r
	} else if cy > size-r {
		cy = size - r
	}
	dx, dy := x-cx, y-cy
	return dx*dx+dy*dy <= r*r+0.5
}

// place draws the logo centred, occupying `frac` of the canvas width.
func place(dst *image.NRGBA, logo image.Image, frac float64) {
	size := dst.Bounds().Dx()
	lb := logo.Bounds()
	w := int(float64(size) * frac)
	h := int(float64(w) * float64(lb.Dy()) / float64(lb.Dx()))
	small := scale(logo, w, h)
	off := image.Pt((size-w)/2, (size-h)/2)
	draw.Draw(dst, small.Bounds().Add(off), small, image.Point{}, draw.Over)
}

// dot draws just the logo's red dot, centred, at `frac` of the canvas width.
// The wordmark is 3.2:1 — at 16 or 32 pixels it is a smear, while the dot is
// still unmistakably this brand.
func dot(dst *image.NRGBA, frac float64) {
	size := float64(dst.Bounds().Dx())
	r := size * frac / 2
	cx, cy := size/2, size/2
	for y := 0; y < int(size); y++ {
		for x := 0; x < int(size); x++ {
			dx, dy := float64(x)+0.5-cx, float64(y)+0.5-cy
			d := math.Sqrt(dx*dx + dy*dy)
			if d <= r-0.5 {
				dst.SetNRGBA(x, y, brandRed)
			} else if d < r+0.5 { // one pixel of coverage, so the edge is not jagged
				a := uint8(255 * (r + 0.5 - d))
				blend(dst, x, y, color.NRGBA{brandRed.R, brandRed.G, brandRed.B, a})
			}
		}
	}
}

func blend(dst *image.NRGBA, x, y int, c color.NRGBA) {
	src := image.NewNRGBA(image.Rect(0, 0, 1, 1))
	src.SetNRGBA(0, 0, c)
	draw.Draw(dst, image.Rect(x, y, x+1, y+1), src, image.Point{}, draw.Over)
}

func save(path string, img image.Image) {
	f, err := os.Create(path)
	must(err)
	defer f.Close()
	must(png.Encode(f, img))
}

func must(err error) {
	if err != nil {
		panic(err)
	}
}

func main() {
	logo := load(os.Args[1]) // the white-on-transparent variant
	out := os.Args[2]

	// The wordmark itself, for the header and the sign-in screen. 800px wide
	// is generous for something rendered at ~110px on a 3× display.
	save(out+"/wit-logo.png", scale(logo, 800, int(800*float64(logo.Bounds().Dy())/float64(logo.Bounds().Dx()))))

	// App icons. Large enough for the wordmark to read.
	for _, s := range []struct {
		name         string
		size, radius int
		frac         float64
	}{
		{"icon-192.png", 192, 42, 0.74},
		{"icon-512.png", 512, 112, 0.74},
		// Maskable: square, and the logo inside the 80% safe zone, because the
		// platform crops this one to whatever shape it likes.
		{"icon-maskable-512.png", 512, 0, 0.58},
		// iOS applies its own mask, so a rounded source would show as a gap.
		{"apple-touch-icon.png", 180, 0, 0.74},
	} {
		c := canvas(s.size, s.radius, appBg)
		place(c, logo, s.frac)
		save(out+"/"+s.name, c)
	}

	// Browser tab. The dot, not the wordmark — see dot().
	for _, s := range []struct {
		name string
		size int
	}{{"favicon-32.png", 32}, {"favicon-16.png", 16}} {
		c := canvas(s.size, s.size/5, appBg)
		dot(c, 0.46)
		save(out+"/"+s.name, c)
	}
}
