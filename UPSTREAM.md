# Keeping Nilak Web in sync with Telegram Web A

Nilak Web is built on Telegram Web A ([Ajaxy/telegram-tt](https://github.com/Ajaxy/telegram-tt), `master`). Its
releases are merged into `master` here; Cloudflare deploys every push to https://nilak.org.

## How to update

```bash
git fetch --unshallow origin
git fetch https://github.com/Ajaxy/telegram-tt.git master:refs/remotes/upstream/master
git merge --no-ff upstream/master
```

Then:

1. Resolve the conflicts (see below). For `dist/`, take Telegram's side (`git checkout --theirs dist`): Cloudflare builds
   the site itself, so the committed build is never used.
2. `npm install` to refresh `package-lock.json`, then `npm run lang:ts` if `fallback.strings` changed.
3. `npm run check:ts`, `npm run check:css` and `npm run build:production` must pass before pushing.
4. Open the site with a real account: Home, Reels, Read, Profile, Create, a chat and the login screen.

## Rules that keep merges small

1. **New Nilak work goes in Nilak files**, not in Telegram's: `src/components/nilak/**`,
   `src/global/actions/api/nilak.ts`, `src/global/selectors/nilak.ts`, `src/util/nilakBranding.ts`, the `nilak-*`
   assets and the `Nilak*` strings at the end of `src/assets/localization/fallback.strings`.
2. **In Telegram's files, only small hooks**: one line, an import or a class name, with a `// Nilak:` comment, close to
   Telegram's code and never reformatting it.
3. **One switch**: `IS_NILAK_SHELL` in `src/config.ts`. With it `false` the app is plain Telegram Web A in Nilak colours,
   which is the fallback if a merge breaks the Nilak tabs.
4. **Telegram's strings are not edited.** The word Telegram becomes Nilak at runtime in `src/util/nilakBranding.ts`;
   texts that must keep Telegram's name (Premium, Stars, login codes, the API note) are listed there.
5. When Telegram removes or rewrites something Nilak hooks into, prefer Telegram's new code and move the hook.

## Where conflicts usually happen

| File | Nilak change |
| --- | --- |
| `src/components/main/Main.tsx`, `Main.scss` | `NilakShell` (tab menu, pages, reader), `nilak-*` layout classes |
| `src/components/common/Document.tsx` | a `.nilak` file shows as a Barruu card and opens in the reader |
| `src/components/middle/composer/AttachMenu.tsx` | Barruu item next to Telegram's article |
| `src/components/middle/MessageList.tsx` | `nilak-wide-posts` class on channels (styles in `nilak/NilakChannelPosts.scss`) |
| `src/api/gramjs/methods/symbols.ts` | `encodeNilakDocument`, `decodeNilakDocument` for stickers and GIFs in a Barruu |
| `src/util/localization/index.ts` | `brandString` at the end of `getString` |
| `src/global/types/globalState.ts`, `actions.ts` | `nilakFeed`, `nilakReels`, `nilakProfile`; the `loadNilak*` actions |
| `src/global/actions/all.ts`, `selectors/index.ts` | registration of the Nilak action and selector files |
| `src/config.ts` | `APP_NAME`, `IS_NILAK_SHELL`, `LIGHT_THEME_BG_COLOR`, `DARK_THEME_BG_COLOR` |
| `src/styles/themes.json`, `_variables.scss` | lilac colours (`--color-primary`, `--color-active`, spinner) |
| `src/util/wallpaper.ts` | lilac default wallpapers |
| `src/styles/_patternBackground.module.scss`, `qrCode/generateQrCodeCard.tsx` | `nilak-pattern.svg` instead of Telegram's |
| `src/components/auth/Auth.scss` | Nilak logo on the login screen |
| `index.html`, `public/*`, `vite.config.ts` | name, icons, manifest, `nilak.org` address |
