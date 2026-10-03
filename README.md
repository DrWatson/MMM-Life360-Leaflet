# MMM-Life360-Leaflet

A MagicMirror² module for a Raspberry Pi that displays every member of one Life360 circle on a map, with profile avatars, names, battery percentages, charging state, and the age of each location report.

**Refreshes every 60 seconds by default.** It reads the latest server data; it does not force members' phones to produce a new GPS fix. Members without shared coordinates remain in the list. Nearby map markers cluster together; select a numbered marker or a member card to reveal a person.

## Install on your Pi

Requires a working MagicMirror² installation (module API minimum 2.20.0) and Node.js 18 or newer. Use the Node version supported by your installed MagicMirror release. Leaflet and MarkerCluster are bundled in `vendor/`, with their licenses: **no npm install is needed**.

1. Install the module with Git:

   ```bash
   cd ~/MagicMirror/modules
   git clone https://github.com/DrWatson/MMM-Life360-Leaflet.git
   ```

   Alternatively, copy `MMM-Life360-Leaflet.zip` to your Pi's home folder and extract it:

   ```bash
   unzip ~/MMM-Life360-Leaflet.zip -d ~/MagicMirror/modules/
   ```

   The result must be `~/MagicMirror/modules/MMM-Life360-Leaflet/MMM-Life360-Leaflet.js` (not an extra nested folder). Adjust `~/MagicMirror` if your installation lives elsewhere.

2. Create the token file outside MagicMirror's web-served folders:

   ```bash
   mkdir -p ~/.config/MMM-Life360-Leaflet
   chmod 700 ~/.config/MMM-Life360-Leaflet
   nano ~/.config/MMM-Life360-Leaflet/credentials.json
   ```

   Paste this JSON, replacing the placeholder with your Life360 access token. Follow [Get your Life360 access token](#get-your-life360-access-token) below to obtain it:

   ```json
   {
     "accessToken": "PASTE_YOUR_ACCESS_TOKEN_HERE"
   }
   ```

   Save with Ctrl+O, Enter, then exit with Ctrl+X. Restrict the file:

   ```bash
   chmod 600 ~/.config/MMM-Life360-Leaflet/credentials.json
   ```

   Use a personal access token, not a Basic/client token. Do not put the personal token in MagicMirror's `config.js` or the module folder. The helper reads this private file on each API request, so replacing an expired token does not require a restart (any active retry delay still applies). Create it as the same Linux user that runs MagicMirror. If you use a different service user, its home directory is the one that matters.

3. Open `~/MagicMirror/config/config.js`. Inside its existing `modules: [ ... ]` array, add this object, using commas to separate it from adjacent module objects:

   ```js
   {
     module: "MMM-Life360-Leaflet",
     position: "top_right",
     config: {
       circleId: "PASTE_YOUR_CIRCLE_ID",
       title: "Our circle",
       showFamilyHeading: true,
       showSyncStatus: true,
       showRefreshFooter: true,
       showMemberCount: true,
       showTitle: true,
       showAdminCrowns: true,
       updateInterval: 60000,
       cardsPosition: "below",
       maxAvatarsPerCluster: 3,
       speedUnits: "mph",
       width: "520px",
       mapWidth: "",
       mapHeight: "350px"
     }
   },
   ```

   To find your circle ID using Chrome or Microsoft Edge Developer Tools:

   - Sign in to [Life360](https://life360.com/login) with your own account.
   - Press **F12** or **Ctrl+Shift+I**, open **Network**, enable **Preserve log**, and select **Fetch/XHR**.
   - Refresh the page with Developer Tools open. If a circle/map view is available, open it. Enter `circles` in the Network filter.
   - Select a successful request whose URL ends in `/circles` (possibly followed by query parameters). Open **Preview** or **Response**, find your circle by its `name`, and copy that circle's `id` from the `circles` array. Do not copy a member's ID or a circle invitation code.
   - You can also find the circle ID in a members request URL such as `/v3/circles/YOUR-CIRCLE-ID/members`: copy the value between `/circles/` and `/members`. If you belong to multiple circles, confirm that the request belongs to the circle you want.
   - Replace `PASTE_YOUR_CIRCLE_ID` in the module configuration above with the copied value, keeping the quotation marks.

   This method works only if the website makes circle-related API requests. An account/billing-only page may not make them. If none appear, the circle ID cannot be obtained through this Network view; you will need an authenticated circles API response instead. Avoid sharing network exports or screenshots containing access tokens or private member data.

4. Restart MagicMirror using your usual method. If PM2 manages it, use `pm2 list` to find its name, then `pm2 restart YOUR_PROCESS_NAME`. If you launch it manually, stop it and run your normal start command again.

## Get your Life360 access token

Use Chrome or Microsoft Edge on your computer:

1. Visit [Life360 sign-in](https://life360.com/login) and sign in to your own account. Complete any verification code or browser challenge normally.
2. Press **F12** or **Ctrl+Shift+I** to open Developer Tools.
3. Select **Application** (it may be under the **»** overflow menu).
4. Expand **Storage → Cookies**, then select the Life360 website entry.
5. Find **LIFE360_AUTH_TOKEN**. Select it and copy its complete **Value**. This cookie-based method is documented by the [community Life360 integration](https://github.com/pnbruckner/ha-life360#access-token); it is not an official developer-token service.
6. On your Pi, paste only the token value into the `accessToken` field in `~/.config/MMM-Life360-Leaflet/credentials.json`, replacing the placeholder. Keep the JSON quotation marks. Do not include the cookie name or a `Bearer ` prefix.

If the cookie is absent, you can inspect the login traffic instead:

1. Open Developer Tools **before signing in**, select **Network**, and enable **Preserve log**.
2. Complete sign-in, then look for a successful authentication request (often named `token`). If its **Response** contains an `access_token` field, copy that field's value only.
3. Alternatively, if a successful Life360 API request has an **Authorization: Bearer …** request header, copy only the value after `Bearer `.

Life360 can change its login flow. If neither location exposes a token, this method is unavailable for that session; do not substitute a verification code, refresh token, or Basic/client token. A captured token can still be rejected by the API; see Troubleshooting for 401, 403, and browser-challenge responses.

Treat this token like a password: it can grant access to your circle's information. Do not commit it to GitHub or share screenshots, network exports, or copied requests containing it. The module does not automatically renew expired tokens; obtain a fresh one and replace the private file when needed.

## What appears

- Avatar pins and grouped avatars on the map, fitted to shared member locations. Groups up to `maxAvatarsPerCluster` show each person's avatar together, including people at identical coordinates. Larger groups show a single marker with the full member count.
- A card for every member: full name, avatar (initials if absent/broken), reported place, battery percentage, explicit Charging / Not charging state, and last location report age.
- Amber low-battery text at 20% or lower and amber older-report indicators after 15 minutes.
- Unknown battery and charging values are labeled unknown, not assumed to be zero or false.
- “Location sharing off” or “Location unavailable” when appropriate; no made-up map coordinates.
- On an API error, the last successful snapshot remains with an error message and its age. It is not presented as a new location fix.
- Empty circles, failed tiles, expired/rejected tokens, HTML browser challenges, and rate limits have visible states.

## Options

| Option | Default | Meaning |
| --- | --- | --- |
| `circleId` | empty | Required Life360 circle ID |
| `title` | `Our circle` | Heading |
| `showFamilyHeading` | `true` | Show “FAMILY LOCATIONS” above the title |
| `showSyncStatus` | `true` | Show routine sync/loading text such as “Synced just now”; API error messages remain visible when false |
| `showRefreshFooter` | `true` | Show the refresh footer (including its last-successful-data text on errors) |
| `showMemberCount` | `true` | Show the “2 of 2 on map” badge |
| `showTitle` | `true` | Show the value of `title` |
| `showAdminCrowns` | `true` | Show admin crowns on cards, popups, individual map avatars, and grouped map avatars. Set `false` to hide all crowns. Numbered group markers never show crowns. |
| `speedUnits` | `mph` | Driving speed units: `mph` or `kmh` (displayed as km/h). `km/h` and `kph` are also accepted. |
| `updateInterval` | `60000` | API polling interval in milliseconds; minimum 5 seconds (`5000`) |
| `width` | `520px` | Module width, a CSS length |
| `mapWidth` | empty | Map width, e.g. `500px` or `60%`. Left/right cards fill the remaining module width minus the 12px gap. Above/below cards retain the full module width and their existing columns. Empty preserves automatic sizing. For left/right layouts, leave enough room for the cards and gap. |
| `mapHeight` | `350px` | Map height, a CSS length |
| `cardsPosition` | `below` | Member cards relative to the map: `below`, `above`, `left`, or `right`. Invalid values fall back to `below`. |
| `maxAvatarsPerCluster` | `3` | Maximum group size shown as individual avatars. With `3`, groups of 2 or 3 show all avatars; 4 or more show one count marker. Positive integer; invalid values default to 3, decimals round down. Set 1 for the original count-only clusters. |
| `staleAfter` | `900000` | Mark location reports older than this many milliseconds |
| `maxZoom` | `16` | Maximum zoom used when automatically fitting members |
| `autoFit` | `true` | Fit all located members when coordinates change; false fits once and leaves later view control to you |
| `initialCenter` | `[20, 0]` | Map center before any locations are available |
| `initialZoom` | `2` | Initial map zoom |
| `tileUrl` | OSM standard HTTPS tiles | Alternative raster tile template with `{z}`, `{x}`, `{y}` |
| `tileAttribution` | OpenStreetMap attribution | Required attribution for the selected tile provider; trusted configuration HTML |

`width` controls the entire module. Above/below layouts display cards in two columns (one column when the browser viewport is 550px wide or less); `mapWidth` controls the map separately while the card area spans the module. Left/right layouts use one column of cards beside the map. With `mapWidth` empty, cards receive 40% and the map 60% of the space remaining after the 12px gap. With `mapWidth` set, the card width is the module width minus the map width minus that gap. All cards remain visible; the list can extend beyond the map height. The heading stays above both sections and the refresh caption stays below both.

For example, to place cards to the left of a larger map and refresh every five seconds:

```js
cardsPosition: "left",
width: "820px",
mapWidth: "500px", // Leaves 308px for cards after the 12px gap.
mapHeight: "450px",
updateInterval: 5000,
```

Use `"right"`, `"above"`, or `"below"` to select another position, then restart MagicMirror. Cards appear below the map by default. For a narrow display, add this to your configured MagicMirror custom CSS file (its location depends on your MagicMirror version):

```css
.MMM-Life360-Leaflet .l360-members { grid-template-columns: 1fr; }
```

The five heading/status visibility options are `showFamilyHeading`, `showSyncStatus`, `showRefreshFooter`, `showMemberCount`, and `showTitle`. Set each to `false` to hide its element, or `true` to show it. They are independent and all default to `true`. Hiding all heading elements removes the empty heading row and its spacing. These five options do not affect member-card details, map attribution, or polling.

Separately, `showAdminCrowns: false` hides admin crowns on cards, popups, individual map avatars, and grouped map avatars. It defaults to `true`. Numbered group markers never show crowns. Restart MagicMirror after editing configuration.

Set `updateInterval: 5000` for a five-second refresh; the caption will show “Refresh every 5s.” The default remains 60 seconds. Values below 5000 are clamped to 5000. Restart MagicMirror after changing configuration.

Polling pauses when MagicMirror hides the module and resumes when it is shown. Requests are deduplicated by circle on the server; multiple viewers do not trigger extra requests within a 5-second window. Rate limits and browser/permission blocks delay retries. The normal refresh interval is not a promise of fresh device data.

## Troubleshooting

**Token rejected (401):** Replace `accessToken` in the private credentials file with a fresh token from your normal browser login. You can open Developer Tools → Network before login and inspect the POST `token` response. Complete any login verification in the browser. The module does not perform password login or automatically renew tokens.

**“Please enable cookies”, HTML, or a browser challenge:** Life360 may block requests from the Pi even with a valid token. This module detects that response but cannot complete a browser challenge. Verify the same GET `/v3/circles/CIRCLE_ID/members` in Postman with Bearer authentication. A successful browser login does not guarantee server-to-server API access. If the Pi remains blocked, the module needs a working permitted data source before live updates can succeed; changing the display code will not fix the upstream block.

**403:** Check the account's access to that circle and token. It can also indicate request blocking. Retries are delayed for five minutes.

**404:** Verify `circleId`, using a circle ID rather than a member ID.

**429:** The module honors `Retry-After` (or waits five minutes if absent), then retries on the next normal polling tick. Do not lower the refresh interval to solve rate limiting.

**Credentials not found:** The private file must belong to the user actually running MagicMirror. For custom service setups, set the server process environment variable `LIFE360_CREDENTIALS_FILE` to an absolute private JSON file path. This is a server environment setting, not a frontend module option.

**Blank map:** Confirm you copied `vendor/` and the Pi can reach your tile provider. If member cards appear but no tiles load, inspect tile-provider/network errors in MagicMirror's developer console. Shared coordinates are necessary for member markers. Cards still work when map tiles fail.

## Local demo and tests

The demo uses fictional people at public places and never calls Life360. From the module directory, serve it with any static HTTP server, for example if Python is installed:

```bash
python3 -m http.server 8765 --bind 127.0.0.1
```

Open `http://127.0.0.1:8765/demo/` in a browser. It needs internet for map tiles; local scripts and illustrated sample avatars are bundled. Sample positions and status values do not update automatically. Buttons demonstrate normal, connection-error, no-location, and three/four-members-at-the-same-spot states. The position selector previews all four card layouts.

Run the included backend and lifecycle tests with `npm test` or `node --test test/*.test.js`. Tests use synthetic data; no account credentials or live Life360 API calls are needed. The standalone demo checks the same frontend used by the module; it is not a full MagicMirror-on-Pi integration test.

Build validation: all 25 automated tests passed, including admin crowns, movement flags, speed conversion, five-second polling, caption rendering, server request throttling, and configurable avatar/count thresholds. Browser checks verified cached-count recovery when the avatar limit changes, non-overlapping grouped avatars, and individual SVG admin crowns, grouped avatar crowns, mph/km/h display, and three colocated avatars changing to a single count of four, then returning to three avatars when the group shrinks. Earlier browser checks covered all four card layouts, member-card popups, connection errors, sharing-off states, and recovery. No browser warnings or errors were observed during those checks. A real account, token, Raspberry Pi, and full MagicMirror process were not available for live integration testing.

## Data and map services

When `showAdminCrowns` is `true`, individual avatars (map pins, member cards, and popups) show a small inline SVG crown (no emoji font required) when the member's `isAdmin` flag is true. This is the member's **circle admin** role, not the account's subscription or billing status. Grouped map avatars also show each admin member's crown. Numbered count markers never show crowns. Multi-row avatar groups leave extra vertical space for crowns.

The place/address line appends movement, for example `Home · Driving [22.5 mph]` or `Home · Walking`. Driving takes precedence when `location.isDriving` is true. Walking is inferred only when `location.inTransit` is true and `isDriving` is explicitly false; the API does not guarantee a walking classification (other non-driving travel can also match). If driving state is unknown but transit is true, the line says `Moving`. Stationary or unknown movement leaves the place line unchanged. No movement is shown for unavailable/disabled shared locations.

Speed follows the community integration's conversion of raw `location.speed` × 2.25 to mph, then × 1.609344 for km/h, rounded to one decimal. Negative/missing speeds display `Driving [speed unavailable]`, rather than an invented zero. Set `speedUnits: "kmh"` for metric or `speedUnits: "mph"` for miles per hour. These fields describe the last device report; the displayed report age still applies.

The Node helper calls only `GET /v3/circles/{circleId}/members` on `api-cloudfront.life360.com`. It sends the frontend only normalized display fields and does not log tokens or raw API bodies. The frontend loads HTTPS profile images and map tiles directly. The tile service sees tile-area requests; Life360 tokens are sent only to the fixed Life360 API host. The credential file is never served by this module. Restrict network access to MagicMirror as appropriate for a display of family locations.

OpenStreetMap tiles require visible attribution and normal browser caching; both are preserved. Tiles are not refreshed on every data poll or bulk-downloaded. You can configure another raster tile provider; follow its attribution and usage requirements.

Life360's endpoints and response fields are undocumented and may change or reject third-party clients. This module is not affiliated with Life360. Live account and Raspberry Pi behavior must be verified on your setup.

## References

- [MagicMirror module interface](https://docs.magicmirror.builders/module-development/core-module-file.html)
- [MagicMirror Node helper](https://docs.magicmirror.builders/module-development/node-helper.html)
- [Community Life360 endpoint implementation](https://github.com/pnbruckner/life360/blob/master/life360/api.py)
- [Community member-field parsing](https://github.com/pnbruckner/ha-life360/blob/master/custom_components/life360/helpers.py)
- [Community speed conversion factor](https://github.com/pnbruckner/ha-life360/blob/master/custom_components/life360/const.py)
- [Leaflet](https://leafletjs.com/reference.html) and [MarkerCluster](https://leaflet.github.io/Leaflet.markercluster/)
- [OpenStreetMap tile policy](https://operations.osmfoundation.org/policies/tiles/)

## License

Module source: MIT, see `LICENSE`. Bundled third-party libraries retain their licenses under `vendor/`. `vendor/manifest.json` records source package URLs and the verified npm archive integrity values.
