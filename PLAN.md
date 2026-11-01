# Property game: plan

An original online property-trading board game for a small group of friends. You roll and move, buy properties, charge rent, build, mortgage, trade and bankrupt each other. Each player uses their own device in a shared online room, the rules are adjustable, and there are several maps.

It is **not a Monopoly copy**. The space names, card decks, board art and branding are all original.

Status: Phases 0, 1 and 2 are done. The look preview is a design canvas at https://claude.ai/artifact/UT6ub1CstpNoP7G8eqpYDC, and the **chosen look is a cream board in a navy frame** (2026-11-01). The rules engine, Harborview and the simulator are in `shared/`, with results in section 14. The room server is in `worker/`, with results in section 15. The browser client is in `client/`, with results in section 16. Phase 4 (deploy and the first real game night) is next.

The preview's Harborview space names, the card deck names (Dispatch, Wildcard), the corner names (Start, Lockup, Plaza, Busted!), the colour-set icons and the rent numbers are drafts. They get finalised in Phase 1.

---

## 1. Settled decisions

| Topic | Decision |
|---|---|
| How people play | Online rooms, one device per player, joined by a shared link |
| Hosting | Free: Cloudflare Workers Free + Durable Objects |
| Maps | Harborview (40 spaces) in v1. Pocket Town (32) and Metro Sprawl (48) come later, plus a World map with real countries as colour sets and real cities as streets. Maps are data files |
| Look | Cream board in a navy frame, chosen from the Phase 0 preview |
| Away players | A countdown starts when they disconnect, and other players can vote to extend it. If they aren't back in time, they're removed as if bankrupt to the bank |
| Bankrupt or departed player's properties | Become unowned again by default. A lobby setting can switch this to auctioning them |
| Trade offers | Stay open until accepted, declined, countered or cancelled. They never expire |
| Income tax | 10% of the player's cash on hand (the % is adjustable) |
| Building supply | Unlimited, with no shortage rules |
| Debt timer | None for now. Revisit after the playtest |
| Online timers | A step timer and an auction timer |
| Net worth | Book value (see section 9) |
| Chat and spectators | Both in v1 |
| Deferred | Rent-immunity trades, manual rent claims, shuffled board, bots, Chaos preset, house-shortage rules, sounds and animation polish, map editor |

---

## 2. Tech stack and architecture

| Part | Choice |
|---|---|
| Client | React + TypeScript + Vite + Tailwind + Motion |
| Game engine | Pure TypeScript in `shared/` with no platform code. Deterministic: the seeded random-number state lives in the game state |
| Server | Cloudflare Worker, with one **Durable Object per room** (looked up by room code) |
| Storage | Each room's built-in SQLite. The state and the action log are saved on every action |
| Timers | One Durable Object alarm per room, set to the earliest pending deadline |
| Live updates | WebSockets with the Hibernation API. The server sends only the changes, and the browser uses an auto-reconnecting socket |
| Website files | Workers static assets (free and unlimited) |
| Tests | Vitest for the engine and simulations, and `@cloudflare/vitest-pool-workers` for the room object |
| Local dev | `wrangler dev`, with devices on the same Wi-Fi for local playtests |
| Deploy | `wrangler deploy` to a free `*.workers.dev` address. A custom domain is optional |

```
client/   React app, built to static assets
shared/   engine: types, maps, cards, applyAction(), validators, netWorth()
worker/   Worker entry (assets, create room, websocket upgrade) and RoomObject
tests/    engine unit tests, simulations, room tests
```

The server owns the game. Browsers send requests ("roll", "bid 120"); the room object checks each one, applies it, saves it, then sends each player their own updated view.

### Room storage (SQLite inside each room object)
- `meta`: one JSON row with the schema version, room code, phase (lobby, playing or finished), host, lobby settings and preset, muted spectators, reconnect grace timers and usage counters
- `game`: one row holding the version number and the full game state as JSON
- `actions`: an append-only log (version, player, action, time), used for debugging and replays
- `members`: member id, token hash, name, colour, token shape, role (player or spectator), join time
- `chat`: the last 200 messages

The state and its action-log row are written in the same transaction. Saved state carries a schema version, so code updates can still load older saves.

### Message protocol
- Browser → server:
  - `hello {token}`
  - `action {id, expectedVersion, type, payload}`
  - `chat {text}`
  - `vote {kind, target}`
- Server → browser:
  - `welcome {you, snapshot, version}`
  - `patch {version, changes, events}`
  - `reject {id, reason}`
  - `chat`
- If a browser sees a gap in version numbers, it asks for a full snapshot.
- **Each player gets their own view of the state.** Card deck order is hidden from everyone, and a pending trade offer is visible only to its two players. Completed trades are announced in the log.

### Safety
- Player tokens are random 128-bit values, and only their hashes are stored.
- Room codes are 6 characters from an alphabet with no look-alike letters.
- Each socket has a message rate limit.
- Names are capped at 20 characters and chat messages at 300.
- All text is escaped when shown.

---

## 3. A full turn

1. **Before rolling.** The player can build, sell, mortgage and trade, then roll.
   - **In jail**, they choose: pay the fine, use a get-out card, or roll for doubles.
     - Doubles get them out and they move by that roll, but they don't roll again.
     - On their last allowed jail turn, a failed roll means they pay the fine and move by that roll.
2. **Roll.** The server rolls two dice.
   - A third double in a row sends the player to jail without moving, and the turn ends.
   - Passing Start pays the salary, or double salary for landing exactly on it if that rule is on.
3. **Resolve the space.**
   - **Unowned property:** buy it or pass. The player can raise cash first. Passing starts an auction if auctions are on; otherwise the property stays unowned.
   - **Owned by someone else:** rent is charged automatically.
     - **Street:** base rent, doubled on a full unbuilt set (a mortgaged street still counts towards the set), or the rent table once there are buildings.
     - **Transit:** $25, $50, $100 or $200, depending on how many stops the owner has.
     - **Utility:** 4× the dice roll, or 10× if the owner has both.
     - No rent is charged if the property is mortgaged, or if the owner is in jail and rent-in-jail is off.
   - **Card space:** the card is applied. If it moves the player, the new space is resolved too.
   - **Income tax:** the set % of cash on hand. **Second tax space:** the flat amount in the map data. Both go to the jackpot if that rule is on.
   - **Go-to-jail space:** the player goes to jail and the turn ends.
   - **Jackpot corner:** the player collects the jackpot if that rule is on.
4. **Doubles** (if the player isn't in jail): roll again. Otherwise the player can manage their properties and then **end the turn**.

End turn is locked while a debt or an auction is open.

### Auctions
- Every active player can bid, including the one who passed.
- A bid can't be more than your cash.
- Each bid resets the clock to at least 5 s.
- The highest bid wins. With no bids, the property stays unowned.
- Only one auction runs at a time, and extra auctions wait in a queue.

### Building
- You need the full set, with nothing in it mortgaged.
- Building and selling must be even across the set.
- Supply is unlimited.
- Selling back pays 50% by default.

### Debt and bankruptcy
- **Debt:** if you owe more than your cash, you're in debt. You raise money (mortgage, sell buildings, trade) or declare bankruptcy.
  - Debt can happen off-turn, for example from "each player pays you $X".
  - The game waits until every debt is settled. There's no debt timer.
- **Bankrupt to a player:** buildings are sold at half value, and the cash, properties (still mortgaged) and jail cards go to that player.
- **Bankrupt to the bank:**
  - buildings are removed
  - properties **become unowned**, or are auctioned one by one if that setting is on
  - jail cards go back to the deck
- **Bankrupt to several players at once:** treated as bankruptcy to the bank, with the cash split in proportion to what each was owed.

### Trading
- An offer can include properties, cash and jail cards in any mix, and goes to one other player.
- The other player can accept, decline or counter, and the sender can cancel.
- Offers **never expire**.
- Accepting **re-checks everything**.
- An offer cancels itself if:
  - a property in it changes hands another way, or
  - either player goes bankrupt or leaves.
- A street can't be traded while its set has buildings.
- A mortgaged property received in a trade costs 10% interest immediately, or the receiver can pay off the mortgage.
- Each player can have at most 5 open offers. Trades never block the turn.

---

## 4. Rules and settings

**Type:** *Core* is on in the Classic preset, *House* is off in Classic, and *Room* covers how the room runs rather than game rules.

| Setting | Type | Default | Options |
|---|---|---|---|
| Starting cash | Core | $1500 | $500–$5000 |
| Salary for passing Start | Core | $200 | $0–$500 |
| Income tax | Core | 10% of cash | 0–25% of cash, or a flat amount |
| Auction a property when it's passed | Core | on | on/off |
| Double rent on a full unbuilt set | Core | on | on/off |
| Rent while in jail | Core | on | on/off |
| Full set needed to build | Core | on | on/off |
| Even building | Core | on | on/off |
| Building sell-back | Core | 50% | 50% / 100% (100% is a house rule) |
| When you can build | Core | any time | any time / own turn only |
| Mortgage value | Core | 50% | 50 / 60 / 75% |
| Unmortgage interest | Core | 10% | 0–20% |
| Interest due on mortgaged property received in a trade | Core | on | on/off |
| Roll again on doubles | Core | on | on/off |
| Three doubles → jail | Core | on | on/off |
| Jail fine | Core | $50 | $0–$200 |
| Most turns in jail | Core | 3 | 1–5 |
| Trading | Core | on | on/off |
| Jail cards tradable | Core | on | on/off |
| Bankrupt or departed player's properties | Core | become unowned | become unowned / auctioned |
| Win condition | Core | last one standing | last standing / richest after N rounds / first to $X net worth |
| Double salary for landing exactly on Start | House | off | on/off |
| Jackpot on the free corner | House | off | on/off, plus which sources feed it, plus a seed amount |
| Lap before buying | House | off | on/off |
| Properties dealt at the start | House | 0 | 0–5 each (capped, see section 5) |
| Trade only on your turn | House | off | on/off |
| Max players | Room | 6 | 2–8 (the map can set a lower limit) |
| Step timer | Room | 60 s | off / 30 / 60 / 90 s |
| Auction timer | Room | 10 s | 5–30 s |
| Away timeout | Room | 5 min | 3 / 5 / 10 min (can't be turned off) |
| Spectators | Room | on | on/off |
| Spectator chat | Room | on | on/off (the host can also mute) |
| Map | Room | Harborview | the maps that exist |

**Presets**
- **Classic:** every default above.
- **Quick:** 2 properties dealt each, richest after 20 rounds wins, and a 45 s step timer. The numbers are provisional until playtested.

---

## 5. How rules interact (the lobby greys these out and says why)

1. **Roll again on doubles is off** → "Three doubles → jail" is disabled.
2. **Auctions are off** → bankrupt or departed properties can only "become unowned", and a passed property stays unowned.
3. **Lap before buying** → no auction for a property the lander isn't allowed to buy yet.
4. **Properties dealt at the start:**
   - at most half of the map's properties ÷ the number of players, each
   - each player's hand is roughly equal in value
   - nobody is dealt a full set
   - being dealt properties doesn't count as completing a lap
5. **Max players** is capped by the map (Pocket Town: 6).
6. **Net-worth target** must be at least 2× starting cash. **Round limit** must be at least 5.
7. **Jackpot with no sources ticked** shows a warning that only the seed money goes in.
8. **Trade only on your turn:**
   - offers can only be sent during your own turn
   - open offers close when that turn ends, which overrides "never expire"
   - a player in debt can still trade off-turn to raise cash
9. **100% sell-back** makes building risk-free. It's allowed, but labelled as a house rule.
10. **A mortgaged street in a set** blocks building anywhere in that set, whatever the toggles say.
11. **Income tax as a % of cash** can never cause debt.
12. **Step timer off** → the game relies on players to act. The away timeout still applies.

---

## 6. Timers

Every timer is a deadline saved in the room state. The room's single alarm is set to the earliest one. The host can pause the game, which freezes all timers.

| Timer | Default | When it runs out |
|---|---|---|
| Step | 60 s | Roll → rolls. Buy-or-pass → passes (an auction starts if on). Jail choice → rolls for doubles, or pays on the last allowed turn. End turn → ends the turn |
| Auction | 10 s, and at least 5 s after each bid | The highest bid wins, or the property stays unowned |
| Away | 5 min, and a vote adds 5 min | The player is removed as if bankrupt to the bank |

How they interact:
- The step timer pauses while any auction or debt is open.
- Things are resolved in order: debts, then auctions, then the turn.
- With no debt timer, a connected player in debt can hold up the game. If that turns out to be a problem in playtesting, add a timer or a vote to force it.

---

## 7. Connections, leaving and the host

- **Identity:** joining gives you a player id and a secret token, stored in your browser for that room. There are no accounts.
- **Refresh:** the browser reconnects with the token and gets a full snapshot.
- **Short drops** (under 15 s) don't mark you away.
- **Away:**
  - The countdown starts (5 min by default).
  - **If it's the away player's turn, the game waits for them.** Otherwise play carries on: they still collect rent, but they can't bid or trade.
  - Any player can start a **vote to extend**. It passes with a majority of the connected players, adds 5 min, and can be repeated.
  - If they're not back in time, they're **removed as if bankrupt to the bank**. Any debt they owed a player is paid from their cash first.
- **Leave game** (with a confirmation): the same as the away removal, but immediate.
- **Phones:** switching apps can drop the connection, which is one reason the away timeout is 5 min rather than shorter.
- **Host:**
  - In the lobby, the host edits rules, kicks players and starts the game. During the game, the host can pause or end it.
  - The host role passes to the longest-connected player if the host is away for 2 min, and the host can also hand it over.
- **Two tabs as the same player:** both work.
- **Stale clicks:** turn actions carry `expectedVersion`. A stale one is rejected, so a double-click can't roll twice.
- **Late joiners:** they can spectate a game in progress, but not join it.
- **Restarts and deploys:**
  - All state, including timer deadlines and the random-number state, is in the room's SQLite, so nothing is re-rolled after a restart.
  - When a room starts up again:
    - any deadline with less than 30 s left is pushed to 30 s
    - everyone who was connected gets the normal 15-second reconnect grace, and only becomes away (with a fresh away clock) if they don't come back within it. This replaced the earlier "everyone starts as away" idea in Phase 2, because a restart then looks like a short blip.
  - Browsers reconnect automatically and show a "Reconnecting…" banner.
  - A deploy drops all sockets for a moment, so don't deploy during a game night.
- **Clean-up** (by alarm):
  - lobbies are deleted after 24 h idle
  - unfinished games after 14 days without a move
  - finished games keep a results summary for 30 days

---

## 8. Spectators and chat

- Spectators see the public game state, the log and the chat.
- They can chat with a "spectator" tag. The host can turn spectator chat off or mute a person.
- Chat keeps the last 200 messages.

---

## 9. Net worth and winning

**Net worth** =
- cash
- \+ the printed price of every unmortgaged property
- \+ for each mortgaged property: its printed price − mortgage value × (1 + interest)
- \+ the full building cost of every house and hotel
- − any outstanding debt

Jail cards count as $0.

When it's checked:
- **Round limit:** after the last player's turn in round N. Doubles don't add rounds.
- **Target:** at the end of any turn with no open debt or auction. If several players are over the target, the highest wins.
- **Tie-break:** more cash wins. If cash is also tied, it's a shared win.
- In every mode, if only one player is left, they win.

---

## 10. Maps and cards

- Each map is a data file containing:
  - the size (a multiple of 4)
  - the spaces, colour sets (each with a colour and an icon), prices and rent tables
  - the tax amounts, transit stops and utilities
  - the theme colours
- A **map checker** runs in the tests. It checks:
  - the set sizes
  - that prices rise around the board
  - four corners and four transit stops
  - that every card works on the map
- **Cards are map-independent.** They say things like "nearest transit stop" or "most expensive property", never "space 24".
- The board is drawn from the map size, so a new map is just a new data file.
- **Harborview ships in v1.** Game-length estimates come from simulations first and get corrected after real games.

---

## 11. Staying inside the free tier

Workers Free limits as of 2026-11-01, against a rough estimate for a 3-hour, 6-player game:

| Limit | Allowance | Per game (estimate) |
|---|---|---|
| Durable Object requests (incoming WebSocket messages count 20:1, outgoing are free) | 100,000/day | about 1,800 |
| Rows written (each alarm counts as 1) | 100,000/day | about 5,000–10,000 (the tightest limit) |
| Active time | 13,000 GB-s/day | about 16 GB-s with hibernation |
| Storage | 5 GB total | under 1 MB |

- Going over a limit makes requests **fail until 00:00 UTC**. It never costs money.
- The game shows a clear "server limit reached" message if that happens.
- Real usage gets measured in Phase 2 and checked again after the first playtest.

---

## 12. Phases

| Phase | What gets built | Done when |
|---|---|---|
| **0. Look preview** ✅ | A clickable, look-only preview of the lobby and board, cream vs dark, on desktop and phone | Done 2026-11-01: cream board chosen |
| **1. Engine + Harborview** ✅ | Game state, `applyAction()`, map format and checker, cards, net worth, bankruptcy and leaving, every setting in section 4 with the restrictions in section 5. Unit tests, plus 10,000 simulated bot games checking that: money adds up, nobody has negative cash outside debt, every game ends, and restrictions hold. Actions timed against the 10 ms CPU limit | Done 2026-11-01, see section 14 |
| **2. Room object** ✅ | Worker entry, RoomObject, SQLite layout, alarm scheduler, hibernating sockets, tokens, reconnects, per-player views and changes-only updates, votes, host hand-over, pause, rate limits, clean-up | Done 2026-11-01, see section 15 |
| **3. Client** ✅ | Lobby (share link, presets, rules with descriptions and greyed-out combinations, appearance), board, property cards, turn controls, auctions, trades, debt screen, log, chat, spectator view, reconnecting banner, phone layout | Done 2026-11-01 in three real browsers (section 16). Trying it on real phones over Wi-Fi is the first step of Phase 4 |
| **4. Deploy + playtest** | Deploy to Workers Free, then a real game night | Bugs logged, timers tuned, real game lengths recorded |
| **5. More maps** | Pocket Town, Metro Sprawl and a World map (countries as colour sets, cities as streets, airports as the transit stops, a flag badge per set), per-map themes, 10 colour sets | Each passes the map checker and gets a playtest |
| **6. Extras** | Picked from the deferred list after playtesting | — |

**v1 is phases 0–4.**

---

## 13. Still to confirm or measure

- Whether the free plan's 10 ms CPU limit applies to Durable Object calls (the Workers and Durable Objects docs differ). Phase 1 keeps every action well under 10 ms anyway.
- Real usage per game against the free limits (Phase 2).
- How quickly phones drop the connection in the background, and whether 5 min is the right away timeout (Phase 4).
- Game length on Harborview (Phases 1 and 4).
- Repository: this folder currently sits inside a git repository rooted at the user folder (`C:\Users\arudr`). Start a separate repository here before Phase 1.

---

## 14. Phase 1 results (2026-11-01)

### What exists
| Path | What it is |
|---|---|
| `shared/src/types.ts` | Every type: map, settings, game state, actions, events |
| `shared/src/maps/` | `harborview.ts` (the map data), `checkMap.ts` (the map checker), `index.ts` (the map list) |
| `shared/src/cards.ts` | The Dispatch and Wildcard decks, 16 cards each, map-independent |
| `shared/src/settings.ts` | Classic and Quick presets, and `normalizeSettings()`, which applies the section 5 restrictions and returns notes for the lobby |
| `shared/src/engine/` | `createGame()`, `applyAction()` (mutates in place), `applyActionSafe()` (clones first, for the server), `nextDeadline()` for the room alarm, `netWorth()` |
| `shared/sim/` | Bot players, the game simulator and the invariant checker |
| `shared/test/` | 83 tests: map, settings, dealing, turns, rent, Lockup, building, mortgages, auctions, trades, debt, bankruptcy, timers, away and votes, pause, restart, winning, plus 330 simulated games |
| `scripts/simulate.ts` | `npm run simulate`: runs 10,000 games and prints the numbers below |

Commands: `npm test`, `npm run typecheck`, `npm run simulate`.

### Simulation
- 10,000 games covering 2–6 players and 9 setting combinations. 30% of them had chaos turned on: random disconnects, leaving, server restarts, pause and resume, and votes.
- That came to 6.9 million actions, with every invariant checked after every action:
  - money adds up
  - nobody has negative cash
  - building rules hold
  - deck and card counts are right
  - no player who is out still owns or holds anything
  - turn, auction and trade players are all active
- Also exercised:
  - 22,772 bankruptcies, 1,713 leaves and 1,368 away timeouts
  - 26,024 step-timer defaults and 455 restarts
  - 37,757 auctions and 58,614 accepted trades
- **No invariant failures and no stalls.**
- 9,997 games ended on their own. 3 jackpot games, each down to two very rich players with fully built sets, would never end, so the host ended them (see findings).
- Rejected actions never change the state: this is checked by comparing the full state before and after, across 30 chaos games.
- The same seed always produces the same game.

### Game length on Harborview (provisional)
These come from bots, which play faster and more simply than people. The real numbers come from the Phase 4 playtest.

| Game | Median turns | At 20 s a turn | At 35 s a turn |
|---|---|---|---|
| Classic, 2 players | 160 | ~55 min | ~95 min |
| Classic, 3 players | 187 | ~60 min | ~110 min |
| Classic, 4 players | 222 | ~75 min | ~130 min |
| Classic, 5 players | 261 | ~85 min | ~150 min |
| Classic, 6 players | 290 | ~95 min | ~170 min |
| Quick preset (mixed player counts) | 80 | ~25 min | ~45 min |

Classic games last a median of about 67 rounds, with 10% going past about 105 rounds.

### Server CPU per action
- The clone-and-apply path the room will use, measured over 254,000 actions with 6 players:
  - mean 0.24 ms
  - p99 0.55 ms
- One run had 2 actions over 10 ms, the worst at 53 ms. A rerun of the same games maxed out at 5.8 ms, and garbage-collection pauses stayed under 3 ms. So that spike was a one-off stall on the test machine.
- Phase 2 measures again on Cloudflare.

### Findings and changes made during Phase 1
1. **Bug fixed:** accepting a trade charged mortgage interest before the cash moved, which could leave a player at negative cash. Now cash and cards move first, then properties, and interest is charged last.
2. **Endless games:** with last-one-standing, two players with built sets and huge cash piles can trade rent forever. Added the `endGame` action, which the host triggers: the richest by net worth wins. The lobby or in-game menu needs an "End game" button for the host in Phase 3. A softer default, such as suggesting a round limit, is worth considering after playtesting.
3. **Draft data now in code:** the Harborview space names, the card texts, the 7%-of-price rent ladder (5×, 14×, 32×, 42× and 52× the base rent for 1–4 houses and a hotel) and the house costs are all in `shared/src/maps/harborview.ts` and `shared/src/cards.ts`, and can still be renamed or retuned. The map checker and tests protect the structure.
4. **Turn order** is shuffled at the start of every game.

---

## 15. Phase 2 results (2026-11-01)

### What exists
| Path | What it is |
|---|---|
| `wrangler.jsonc` | Worker `rent-is-due`, the `ROOMS` Durable Object (SQLite-backed), static files from `public/`, with `/api/*` and `/ws/*` going to the Worker first |
| `worker/src/index.ts` | Worker entry: `POST /api/rooms` creates a room (6-character code, no look-alike letters), `GET /api/rooms/CODE` gets room info, `/ws/CODE` opens the WebSocket, and `GET /api/rooms/CODE/debug` returns the full state (only when `DEV=true`). Everything else is served from `public/` |
| `worker/src/room.ts` | The `RoomObject` Durable Object: a thin adapter that handles hibernating WebSockets, the alarm, SQLite, and a `ping`/`pong` auto-reply |
| `worker/src/core/room.ts` | All room logic, written without any Cloudflare code so it can be tested in Node |
| `shared/src/protocol.ts` | The messages between browser and server, which the Phase 3 client will use |
| `shared/src/view.ts`, `shared/src/sync.ts` | Per-player views (deck order and other players' pending offers are hidden) and the changes-only patches |
| `public/index.html` | A placeholder page until Phase 3 |
| `scripts/room-e2e.ts` | `npm run e2e`: plays a full 6-bot game against Cloudflare's runtime running locally, using real WebSockets, killing and restarting the server mid-auction and mid-debt |

Commands: `npm test`, `npm run typecheck`, `npm run e2e`, `npm run dev` (local server on port 8787), `npm run deploy`.

### What the room does
- **Lobby:**
  - The first player in becomes the host.
  - Everyone gets a unique colour, and can change colour, token shape and name.
  - Only the host can change settings or presets. They go through `normalizeSettings`, and the notes come back for the lobby to show.
  - The host starts the game once there are at least 2 players, and can start a rematch after a game ends.
- **Joining:** you get a secret token, and only its SHA-256 hash is stored. Reconnecting with the token gives you your seat back.
  - Anyone joining once the seats are full, or after the game has started, becomes a spectator, unless spectators are off.
- **Playing:** a player's action is checked against the engine, saved together with its action-log row in one transaction, then sent to everyone as a patch. Each player gets their own patch, and spectators share one.
  - Patches carry their version numbers, so a client that misses one asks for a fresh snapshot.
  - `expectedVersion` blocks stale clicks.
- **Connections:**
  - A dropped socket gets a 15-second grace before the player is marked away.
  - The host role passes on after the host has been gone for 2 minutes.
  - The host can kick, pause, resume, end the game, and mute spectators.
  - Chat messages are limited to 300 characters, the last 200 are kept, and spectator chat follows the setting.
  - Each person can send at most 25 messages every 2 seconds.
- **One alarm per room:** it handles grace timers, host hand-over, game deadlines and idle clean-up (lobby after 1 day, game after 14 days, finished game after 30 days).

### Tests
- 110 tests pass, including 20 room tests and 2 whole-game tests that run through the room logic with Node's built-in SQLite standing in for Cloudflare's.
- Those whole-game tests play 9 bot games in total, with:
  - a spectator
  - random drops and reconnects
  - a restart mid-auction and another mid-debt
- After **every step**, every client's patched view is checked against the server's view for that player.
- Bugs found and fixed:
  - a reconnecting player could get a patch before their welcome message
  - member order was random when people joined in the same millisecond

### Run against Cloudflare's runtime (local `wrangler dev`, 6 bots, 1 spectator, starting cash $900 to force auctions and debts)
| | Seed 7 | Seed 8 |
|---|---|---|
| Game | finished on its own, 748 turns, 2,054 engine actions | finished on its own, 238 turns, 907 engine actions |
| Restart mid-auction | back in 1.6 s, state identical, auction clock pushed to 30 s | back in 1.7 s, identical, 30 s |
| Restart mid-debt | back in 1.5 s, identical | back in 1.6 s, identical |
| Grace alarm | player marked away after 18 s, away clock 297 s | same |
| Random drops and reconnects | 20 | 11 |
| Clients out of sync | 0 (147 checks) | 0 (73 checks) |
| Invariants | all hold | all hold |
| Rows written | 10,411 (10.4% of the free daily limit) | 4,640 (4.6%) |
| Durable Object requests | about 250 (0.2%) | about 160 (0.2%) |

**Usage:** about 5 rows are written per engine action (game state, action log, room meta, plus the occasional chat or alarm). Rows written is the limit that matters: a long 6-player game uses about 10% of the free day, so roughly 10–20 full games a day fit. If that ever gets tight, saving room meta less often would cut it to about 3 rows per action.

### Still to check
- **CPU on Cloudflare itself:** local `wrangler dev` doesn't enforce or report the 10 ms limit. Check it after the first deploy in Phase 4, in the Workers dashboard or with `wrangler tail`.
- **Hibernation in production:** local dev keeps the object in memory. The room reloads from SQLite in its constructor, and the tests already cover that path (a new room object over the same database).

---

## 16. Phase 3 results (2026-11-01)

### What exists
| Path | What it is |
|---|---|
| `client/` | React 19 + TypeScript + Vite 8 + Tailwind 4 + Motion. The fonts (Inter and Fredoka) are bundled, with no Google requests. `npm run build` writes the site to `public/`, which the Worker serves |
| `client/src/net/connection.ts` | The room connection: the seat token is kept in the browser per room, it reconnects with back-off, sends a ping every 25 s, applies patches and asks for a snapshot if it misses one, adjusts for clock differences, and shows errors as toasts |
| `client/src/screens/` | Home page (create a room, or join with a code) and the room page (name prompt, or "Just watch") |
| `client/src/lobby/` | Lobby: share link, players with host badge and kick, your colour, token shape and name, map cards (Harborview, with Pocket Town, Metro Sprawl and World marked "coming later"), Classic and Quick presets, and every rule from section 4. Each rule shows its description, a House rule badge where it applies, and a greyed-out reason when it can't be used. Only the host can edit, and the server's notes show up |
| `client/src/game/` | Game screen: the cream board (any size that's a multiple of 4), tokens that slide between spaces, owner outlines, houses and hotels, mortgage stripes, dice, turn controls, step timer, players with cash and net worth, "+$200" and "−$120" pop-ups, "Vote +5 min" for away players, property cards with build, sell, mortgage and trade buttons, auction bidding, the debt screen with quick sell and mortgage buttons and a bankruptcy confirmation, a trade composer with counter-offers, game log, chat, a menu (pause, end game, leave), and game over with a rematch |
| `client/test/lib.test.ts` | Every lobby rule writes and reads back through `normalizeSettings`, every event turns into a sentence, and the board positions are checked |
| `scripts/ui-test.ts` | `npm run ui-test`: three real Edge browsers (two desktop, one phone-sized) play through the UI and save screenshots |

**Layouts**
- **1,100 px and wider:** three columns — log and chat, the board with turn controls in its centre, then players, auction, debt, property card and trades.
- **Narrower (phones):** header with your cash, the full-width board (tile names hidden; tap a tile for its card), the turn buttons, then tabs for Players, Card, Trades, Log and Chat.

**Commands**
- `npm run dev`: Worker on 8787 plus Vite on 5173, with live reload. Open http://localhost:5173.
- `npm run lan`: builds the client and serves everything on port 8787 to your Wi-Fi. Open `http://<this PC's IP>:8787` on phones.
- `npm run ui-test`: the browser test.

### Browser test (Edge, three players)
These all passed, with no browser errors:
- a room created from the home page
- two people joining through the link
- the host's rule change showing up for the others
- turning off doubles greying out "three doubles"
- the game starting for everyone
- 60 turn actions clicked through the UI (rolls, buys, end turn)
- property cards
- Priya sending Sam a $25 offer, Sam accepting it, and the cash moving
- Leo closing the tab and reopening the link: he's back in the same seat without typing his name
- the host ending the game, with the game-over screen ranking players by net worth

Screenshots were checked for the desktop board, the phone board, the lobby, property cards, the trade composer and game over. Fixes from looking at them: text and tokens on the tiles were too small, long names now hyphenate properly, and game over shows net worth.

115 tests pass across the engine, room and client, and all three projects type-check.

### Not done or not checked yet
- **Real phones over Wi-Fi:** Phase 4, step 1. Run `npm run lan`, allow Node or workerd through Windows Firewall if it asks, and open `http://<PC IP>:8787` on each phone.
- **Auctions in the browser test:** the test's bots always bought, so no auction ran in the UI. The auction panel is built, and the auction rules are tested in the engine and room tests.
- **Visual check of the debt screen and Lockup buttons:** both are built, but the test didn't land on them.
- **Accessibility:** controls are real buttons and switches with labels, but there's been no screen-reader pass.
