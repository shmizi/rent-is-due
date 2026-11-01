# Rent Is Due

Multiplayer property-trading game for the browser. Adjustable house rules, several maps, and your friends’ tears.

**▶ Play now: [rent-is-due.property-game.workers.dev](https://rent-is-due.property-game.workers.dev)**

No install and no accounts. One person makes a room and sends the link, and everyone joins from their own phone or laptop.

---

## How to play

1. **Make a room.** Open the site, tap **Create room**, and type your name.
2. **Invite people.** Tap **Copy link** and send it to the group chat. Friends open it, type a name, and they're in. Anyone can pick **Just watch** to spectate.
3. **Pick the rules.** Choose **Classic** or **Quick**, then change anything you like. Rules that can't be combined are greyed out, with the reason shown.
4. **Start.** Roll, buy, build, trade, and try not to go bankrupt.

If you drop out, just reopen the link and you get your seat back.

## Features

- **Real-time multiplayer:** 2–6 players, each on their own device, plus up to 20 spectators.
- **Trades:** offers of properties, cash and get-out-of-Lockup cards, with counter-offers. An offer stays open until someone accepts, declines or cancels it.
- **Auctions:** when a property goes unbought, everyone bids with a live countdown, and late bids add time.
- **Timers:** a step timer keeps turns moving.
- **Players who drop out:** someone who disconnects becomes *away*. If they aren't back before the timeout, they leave the game and their properties go back to the bank. The other players can vote to give them more time.
- **Host controls:** pause, kick, hand over the host role, end the game early (the richest player wins), and rematch.
- **Chat**, a game log, and pop-ups showing money changes.
- **Works on phones:** on a narrow screen, the board fills the width and everything else goes into tabs.
- **Restarts:** the game survives server restarts with the state intact, and every timer gets at least 30 seconds after one.

## Rules you can change

| Section | What you can change |
|---|---|
| Money | Starting cash, salary, income tax (a flat amount or a % of cash), double salary for landing on Start |
| Jackpot | Free-parking-style jackpot, and which taxes and fines go into it |
| Buying | Auctions on or off, a lap before buying, properties dealt at the start |
| Rent | Double rent on a full set, rent collected while in Lockup |
| Building | Full set needed, even building, sell-back value, build only on your own turn |
| Mortgages | Mortgage value, interest to pay it off, interest on traded mortgages |
| Dice and Lockup | Roll again on doubles, three doubles to Lockup, the Lockup fine, the most turns in Lockup |
| Trading | Trading on or off, trade only on your turn, Lockup cards tradable |
| Bankruptcy and winning | Bankrupt players' properties go back to the bank or to auction. Win by being the last one standing, by a round limit or by reaching a net-worth target |
| Room | Seats, step timer, auction timer, away timeout, spectators and spectator chat |

**Presets**
- **Classic:** the standard game.
- **Quick:** 2 properties dealt to each player, 20 rounds, and the highest net worth wins. It takes about 30–45 minutes.

## Maps

| Map | Status |
|---|---|
| **Harborview**: a 40-space seaside town of quays, ferries and a lighthouse | ✅ Playable |
| **Pocket Town**: a 32-space board for short games | Planned |
| **Metro Sprawl**: a 48-space board for long games | Planned |
| **World**: real countries and cities, with airports as the transit stops | Planned |

---

## Tech

| Part | Built with |
|---|---|
| Game engine | Pure TypeScript in `shared/`, deterministic (seeded random), with every rule checked before anything changes |
| Server | Cloudflare Workers + Durable Objects, one room per object, saved in its built-in SQLite. WebSockets hibernate, and alarms run the timers |
| Client | React 19, Vite, Tailwind CSS 4, Motion |
| Sync | The server owns the game. Each player gets their own view, and updates send only what changed |
| Tests | Vitest, a 10,000-game bot simulation, end-to-end room games with restarts, and browser tests in Edge |

The whole thing runs on Cloudflare's **free plan**. A long 6-player game uses about 10% of the daily free storage limit, and the server takes under 10 ms of CPU per move.

## Running it yourself

You need **Node 24+**.

```bash
npm install
npm run dev
```

Then open http://localhost:5173. This starts the Worker on port 8787 and Vite on 5173, both reloading on save.

| Command | What it does |
|---|---|
| `npm run dev` | Local development with live reload |
| `npm run lan` | Builds and serves the game to phones on your Wi-Fi at `http://<your PC's IP>:8787` |
| `npm test` | Engine, room and client tests |
| `npm run typecheck` | Type-checks the engine, Worker and client |
| `npm run simulate` | Bots play thousands of games and the money rules are checked |
| `npm run e2e` | A bot game against local Cloudflare, with server restarts mid-auction and mid-debt |
| `npm run ui-test` | Three real browser windows play through the interface |
| `npm run deploy` | Builds and deploys to your Cloudflare account (run `npx wrangler login` first) |
| `npm run smoke` | Bots play a short game on the live site |

## Project layout

```
shared/   game engine, maps, cards, settings, sync protocol, bots and simulator
worker/   Cloudflare Worker and the room Durable Object
client/   React app (lobby, board, trades, auctions, chat)
scripts/  simulator, end-to-end, browser and live smoke tests
PLAN.md   the full design, decisions and test results
```

## Roadmap

- [x] Rules engine, Harborview and the simulator
- [x] Room server on Cloudflare
- [x] Browser client
- [x] Deployed
- [ ] First real game night
- [ ] Pocket Town, Metro Sprawl and the World map
- [ ] Extras picked after playtesting

## License

[MIT](LICENSE)

*Rent Is Due is an original game. Its board, cards and names aren't affiliated with or taken from any commercial board game.*
