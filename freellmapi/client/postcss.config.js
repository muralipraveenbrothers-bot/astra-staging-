// FreeLLMAPI client uses Tailwind CSS v4 via the @tailwindcss/vite plugin
// (see vite.config.ts), which does not require PostCSS.
//
// This intentionally-empty config exists only to stop Vite from walking up
// the directory tree and picking up the PARENT project's postcss.config.js
// (Tailwind v3 plugin), which wrongly processes this workspace's CSS and
// breaks the v4 build with "`@layer base` is used but no matching
// `@tailwind base` directive is present".
export default {
  plugins: {},
}
