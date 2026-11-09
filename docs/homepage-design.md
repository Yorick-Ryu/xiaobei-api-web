# Homepage design

Use the main site's `base-nova` theme as the visual reference. Current reference:
NewAPI revision `52419033af41a1a7770e0833c0f6d785a929ef26`,
`web/src/styles/theme.css`, `components/ui/button.tsx`, `components/ui/card.tsx`
and the project's `shadcn-ui` conventions.

- Use semantic background, foreground, card, muted, border, primary and ring
  variables. Keep the site's neutral surfaces, blue emphasis, sans-serif font,
  1rem base radius and subtle borders. Derive tints in OKLab to retain the blue
  hue; darken light-mode filled actions enough for readable white labels.
- Keep an 8px spacing rhythm, compact controls, consistent card padding and
  responsive grids. At narrow widths, stack cards and keep essential actions
  visible. Avoid stretching video headings to match adjacent content.
- An embedded homepage receives `{themeMode: 'light' | 'dark'}` from the existing
  application. Accept messages only from its parent. Hide the standalone header
  when embedded; standalone visitors can use the theme toggle.
- This page is existing buildless HTML hosted inside the application's sandboxed
  iframe. It cannot directly import the React components; its semantic CSS and
  existing HTML controls follow their visual conventions without loading a
  second application runtime. Preserve keyboard focus, dialog focus boundaries,
  Escape closing and reduced-motion behavior.
- Keep the current site logo and approved campus partner copy. Do not restore
  retired registration/group rewards, the removed withdrawal card, Token price
  estimates or the research-AI shortcut.
