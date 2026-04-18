import type { Config } from 'tailwindcss'
import plugin from 'tailwindcss/plugin'

// Theme color tokens (match CSS variables in index.html)
const themeNames = [
  "base", "surface", "surface-hover", "overlay", "muted", "subtle",
  "text-primary", "text-secondary", "brand", "brand-hover", "brand-accent"
]
const springNames = [
  "spring-base", "spring-surface", "spring-surface-hover", "spring-overlay",
  "spring-muted", "spring-subtle", "spring-text", "spring-text-secondary",
  "spring-mustard", "spring-springtrap-green", "spring-blood",
  "spring-glow", "spring-danger"
]
const allThemeNames = [...themeNames, ...springNames]
const opacityStops = [5, 10, 20, 30, 40, 50, 60, 70, 75, 80, 90, 95]

const springRgbNames = [
  'spring-mustard', 'spring-springtrap-green', 'spring-blood',
  'spring-glow', 'spring-danger'
]

// Build theme utilities plugin (replaces the inline CDN plugin from index.html)
const themePlugin = plugin(function ({ addUtilities }) {
  const utilities: Record<string, Record<string, string>> = {}

  allThemeNames.forEach(name => {
    const cls = name
    const hex = `--c-${name}`
    const hasRgb = name.startsWith('spring-') && springRgbNames.includes(name)

    if (name !== 'base' && name !== 'spring-base') {
      utilities[`.text-${cls}`] = { color: `var(${hex})` }
    }
    utilities[`.bg-${cls}`] = { "background-color": `var(${hex})` }
    utilities[`.border-${cls}`] = { "border-color": `var(${hex})` }
    utilities[`.ring-${cls}`] = { "--tw-ring-color": `var(${hex})` }
    utilities[`.shadow-${cls}`] = { "--tw-shadow-color": `var(${hex})` }
    utilities[`.from-${cls}`] = {
      "--tw-gradient-from": `var(${hex})`,
      "--tw-gradient-to": `var(${hex}) / 0`,
      "--tw-gradient-stops": "var(--tw-gradient-from), var(--tw-gradient-to)"
    }
    utilities[`.to-${cls}`] = { "--tw-gradient-to": `var(${hex})` }
    utilities[`.placeholder-${cls}::placeholder`] = { color: `var(${hex})` }
    utilities[`.placeholder\\:text-${cls}::placeholder`] = { color: `var(${hex})` }

    opacityStops.forEach(stop => {
      const alpha = stop / 100
      const val = hasRgb
        ? `rgb(var(--${name}-rgb) / ${alpha})`
        : `rgb(var(--c-${name}-rgb) / ${alpha})`
      utilities[`.text-${cls}-${stop}`] = { color: val }
      utilities[`.bg-${cls}-${stop}`] = { "background-color": val }
      utilities[`.border-${cls}-${stop}`] = { "border-color": val }
      utilities[`.ring-${cls}-${stop}`] = { "--tw-ring-color": val }
      utilities[`.shadow-${cls}-${stop}`] = { "--tw-shadow-color": val }
      utilities[`.from-${cls}-${stop}`] = {
        "--tw-gradient-from": val,
        "--tw-gradient-to": `rgb(var(--c-${name}-rgb) / 0)`,
        "--tw-gradient-stops": "var(--tw-gradient-from), var(--tw-gradient-to)"
      }
      utilities[`.to-${cls}-${stop}`] = { "--tw-gradient-to": val }
    })
  })

  addUtilities(utilities)
})

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        display: ["Oswald", "system-ui", "sans-serif"],
        terminal: ["VT323", "monospace"],
        code: ["Fira Code", "monospace"],
      },
      animation: {
        "fade-in": "fadeIn 0.5s ease-out",
        "slide-up": "slideUp 0.5s ease-out",
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { transform: "translateY(20px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
      },
    },
  },
  plugins: [themePlugin],
} satisfies Config
