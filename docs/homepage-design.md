# Homepage design

Use the main site's `base-nova` theme as the visual reference. Current reference:
NewAPI revision `52419033af41a1a7770e0833c0f6d785a929ef26`,
`web/src/styles/theme.css`, `components/ui/button.tsx`, `components/ui/card.tsx`
and the project's `shadcn-ui` conventions.

- Use semantic background, foreground, card, muted, border, primary and ring
  variables. Keep the site's neutral surfaces, blue emphasis, sans-serif font,
  1rem base radius and subtle borders. Use the console's primary color directly
  for filled actions and blue emphasis; match its OKLCH accent mixes and
  80%-opacity primary action hover state.
- Use the console's radius scale throughout: sm = 0.6, md = 0.8, lg = 1,
  xl = 1.4, 2xl = 1.8 and 4xl = 2.6 times the base radius. Cards and dialogs use xl,
  regular controls use lg, badges use 4xl, and compact icon/number tiles use
  md/sm. Keep the same radius roles on mobile; circles and square dividers
  retain their geometric shapes.
- Match the compact PublicHeader for the floating support control: 2xl radius,
  60% background opacity, 40px backdrop blur, a 0.5px half-opacity border ring
  and its light/dark shadows. Use an opaque surface without backdrop support.
  Align its right edge with the shared content container, using the same 24px
  gutter (16px on mobile) and 1200px content width cap.
- Use Lucide for all UI icons, including close and check marks. The inline SVGs
  are rendered from the console's installed `lucide-react` v1.25.0 with its
  default 24px viewBox, 2px stroke and round caps/joins; preserve official paths
  and the license notice in the HTML. Size icons via CSS and hide decorative
  SVGs from assistive technology. Keep brand logos and the routing diagram.
- Keep an 8px spacing rhythm, compact controls, consistent card padding and
  responsive grids. At narrow widths, stack cards and keep essential actions
  visible. Avoid stretching video headings to match adjacent content.
- An embedded homepage receives `{themeMode: 'light' | 'dark'}` from the existing
  application. Accept messages only from its parent. Hide the standalone header
  when embedded; standalone visitors can use the theme toggle.
- The frame reports only its scroll-threshold boolean to the parent. The brand
  script in `beiapi-assets/nav-plans.js` verifies the configured same-origin
  homepage iframe and its `contentWindow` before accepting these messages, then
  applies the deployed PublicHeader's existing compact/expanded utility classes.
  Keep the 20px threshold in sync with PublicHeader. Restore native header state
  when leaving the homepage; the sandbox remains unchanged.
- This page is existing buildless HTML hosted inside the application's sandboxed
  iframe. It cannot directly import the React components; its semantic CSS and
  existing HTML controls follow their visual conventions without loading a
  second application runtime. Preserve keyboard focus, dialog focus boundaries,
  Escape closing and reduced-motion behavior.
- Keep the current site logo and approved campus partner copy. Do not restore
  retired registration/group rewards, the removed withdrawal card, Token price
  estimates or the research-AI shortcut.
