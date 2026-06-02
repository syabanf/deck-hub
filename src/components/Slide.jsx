import SlideBackground from './SlideBackground.jsx'

// Renders a single mock-deck slide at any size. Typography scales with container via clamp().
// Used for: card covers (sm), hero, details modal (md), player (xl).
export default function Slide({ deck, slide, sizeClass = 'text-base', showFooter = true }) {
  const textColor = deck.gradient?.text || '#ffffff'
  const isTitle = slide.layout === 'title'
  const isStat = slide.layout === 'stat'

  return (
    <div
      className={`relative w-full h-full flex flex-col ${sizeClass}`}
      style={{ color: textColor }}
    >
      <SlideBackground gradient={deck.gradient} pattern={deck.pattern} />

      <div className="relative z-10 flex-1 flex flex-col p-[7%] pb-[5%]">
        {slide.kicker && !isTitle && (
          <div
            className="uppercase tracking-[0.2em] font-semibold opacity-70"
            style={{ fontSize: '0.55em' }}
          >
            {slide.kicker}
          </div>
        )}

        <div className="flex-1 flex flex-col justify-center">
          {isTitle && slide.kicker && (
            <div
              className="uppercase tracking-[0.3em] font-bold mb-[1.5em] opacity-80"
              style={{ fontSize: '0.7em' }}
            >
              {slide.kicker}
            </div>
          )}

          {isStat ? (
            <>
              <div
                className="font-black leading-none mb-[0.4em] whitespace-pre-wrap"
                style={{ fontSize: '3.2em' }}
              >
                {slide.title}
              </div>
              {slide.body && (
                <div
                  className="opacity-85 leading-snug max-w-[80%]"
                  style={{ fontSize: '1.1em' }}
                >
                  {slide.body}
                </div>
              )}
            </>
          ) : (
            <>
              <div
                className={`font-black leading-[1.05] whitespace-pre-wrap ${isTitle ? 'tracking-tight' : ''}`}
                style={{ fontSize: isTitle ? '2.6em' : '1.8em' }}
              >
                {slide.title}
              </div>
              {slide.body && (
                <div
                  className="opacity-85 leading-snug mt-[0.8em] max-w-[88%]"
                  style={{ fontSize: '0.95em' }}
                >
                  {slide.body}
                </div>
              )}
              {slide.bullets && (
                <ul className="mt-[1.2em] space-y-[0.6em] max-w-[88%]">
                  {slide.bullets.map((b, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-3 opacity-90 leading-snug"
                      style={{ fontSize: '0.9em' }}
                    >
                      <span
                        className="mt-[0.55em] w-[0.4em] h-[0.4em] rounded-full flex-shrink-0"
                        style={{ background: textColor, opacity: 0.7 }}
                      />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>

        {showFooter && (
          <div
            className="flex items-end justify-between opacity-60"
            style={{ fontSize: '0.55em' }}
          >
            <span className="font-semibold tracking-wider uppercase">{deck.title}</span>
            <span>{deck.author}</span>
          </div>
        )}
      </div>
    </div>
  )
}
