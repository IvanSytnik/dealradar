# DealRadar

A Telegram bot that watches marketplace searches and sends only the listings worth opening.
Paste a Willhaben search link (or just type `ps5 digital`). The bot works out what you are looking for, builds a filter, and notifies you about new and cheaper listings, without accessories, wanted ads or junk.

## Features

- **Link in, watch out.** The bot accepts any Willhaben search URL (keyword, category, region, price) or plain text. It canonicalises the URL to newest first and strips tracking params.
- **Auto filter profile.** The AI reads the query and returns match groups (`series s | xbox s | xss`), exclusions (other models, cases, games), accessory words (fine in a bundle, not alone) and a sane price range. All of it is plain words, never regexes, and validated with zod. Without AI there is a deterministic fallback.
- **Three filter layers:** marketplace-wide German lexicon (wanted ads, swaps, empty boxes, defects), then the per-watch rules, then the AI verdict (relevant, condition, bundle, deal score 1–10). Rule-rejected listings never cost an AI call.
- **Learns from feedback.** 👎/👍 under each notification are fed back to the AI as few-shot examples for that watch.
- **Several watches per user**, each with its own interval, price range, stop words, AI toggle, defect policy and score threshold. Inline buttons cover the common settings and text commands cover fine-tuning.
- **Instant preview.** On creation the bot shows how many current listings pass and why others were dropped, so a bad filter is visible in seconds. It then memorises everything already online, so only genuinely new listings are sent.
- **Price-drop alerts** with the old price struck through.
- **Market analysis (`/scan`).** Reads every page of a search (5 on Free, 20 on Pro), filters with rules, screens the rest with the AI in batches of 20, computes the real median and quartiles, and scores each listing against them. Highlights deals, lists cheap broken units separately for repair/resale, flags suspiciously cheap ones. Sends a summary to the chat plus a self-contained, sortable HTML report. The median is stored and used in live notifications ("18 % below the median").
- **Plans and limits** (Free / Pro): number of watches, minimum interval, AI calls per day. Admin `/grant`.
- **Analytics** (`/stats`): signups, active users, notifications, AI calls, negative feedback.
- **Operational safety.** One HTTP request per unique URL per cycle, however many users watch it. A per-host queue with a minimum gap between requests. Exponential backoff with jitter on errors, and the user is alerted once after 5 consecutive failures. Users who block the bot are deactivated automatically. Notifications are capped per run with a summary line.

## Architecture

```
src/
  sites/        SiteAdapter interface + willhaben adapter, polite per-host HTTP queue
  core/         normalisation, marketplace lexicon, rule filter, plans
  ai/           LLM port, profile builder, listing classifier (cache + daily budget)
  db/           SQLite migrations (user_version) + repository
  services/     WatchService (create/preview/edit), Poller (scheduler), Notifier port
  bot/          grammY handlers, pure command parsers, message formatting
tests/          vitest: unit, service, scheduler with fake clock, bot end-to-end
```

The core does not depend on Telegram or Anthropic. Both sit behind ports (`Notifier`, `Llm`), which is why the scheduler and the bot are tested end-to-end without network access.

**Adding a marketplace:** implement `SiteAdapter` (`matches`, `parseSearchUrl`, `searchUrlFromText`, `parseListings`), register it in `sites/index.ts`, and add a fixture test. The lexicon is German; a non-German site needs its own lexicon (see roadmap).

## Run locally

```bash
npm install
cp .env.example .env      # only once! it overwrites .env
npm run check             # typecheck + tests
npm start
```

## Deploy

The bot uses Telegram long polling: it needs no public URL or open port, only an always-on process and a small persistent disk for SQLite. **Run exactly one instance** (stop the local one first), otherwise Telegram answers `409 Conflict`.

### AWS (Terraform + GitHub Actions)
EC2 Graviton + Docker, ECR, GitHub Actions deploys through SSM Run Command (OIDC, or a scoped IAM user where an SCP blocks OIDC), secrets in SSM Parameter Store, CloudWatch Logs, budget alerts, no inbound ports. See [docs/aws.md](docs/aws.md) for the architecture, decisions, cost (~$12/month) and setup.

### Railway (simplest, deploys on every push)
1. railway.com → New Project → Deploy from GitHub repo → pick this repo. It builds the `Dockerfile` (see `railway.json`).
2. Service → Variables: `TELEGRAM_BOT_TOKEN`, `ANTHROPIC_API_KEY`, `ADMIN_IDS`, `AI_MODEL`, and `RAILWAY_RUN_UID=0` (the volume is root-owned; the image runs as `node` otherwise).
3. Service → Volumes → Add volume, mount path `/app/data`. Without it the database is wiped on every deploy.
4. Deploy, then check the logs for `"msg":"started"`.

The Hobby plan includes $5 of usage a month; this bot needs roughly 100–200 MB RAM and little CPU.

### Any VPS (Hetzner, Netcup, Oracle Free Tier, a Raspberry Pi at home)
```bash
git clone <repo> dealradar && cd dealradar
cp .env.example .env && nano .env
docker compose up -d --build
docker compose logs -f
```
Update: `git pull && docker compose up -d --build`. Data lives in `./data`.

**Note on IPs:** marketplaces may rate-limit or block data-center IP ranges. If fetches start failing with 403/429 on a cloud host, a home server (residential IP) is the fallback. The bot backs off automatically and alerts the user after 5 failures.

## Bot commands

| | |
|---|---|
| link or text | new watch |
| `/list` | watches, with buttons: pause, preview, AI, defects, interval, delete |
| `/price 3 80 220` | price range (`-` = no bound) |
| `/exclude 3 hülle, spiel` / `/unexclude 3 controller` | stop words |
| `/match 3 series s \| xbox s` | what the title must contain |
| `/score 3 6` | AI score threshold |
| `/rename 3 Name` | |
| `/scan 3` | market analysis of all pages (also the 📊 button in the watch card) |
| `/plan` | plan and usage |
| `/stats`, `/grant <id> pro` | admin |

Deep link `t.me/<bot>?start=<base64url keyword>` creates a watch straight from a landing page.

## Known limitations

- **Willhaben parsing relies on the `__NEXT_DATA__` structure** (`props.pageProps.searchResult.advertSummaryList.advertSummary`). Verified live on 2026-10-10, including `page=` pagination (20 pages, 600 listings). If Willhaben changes its frontend, `src/sites/willhaben.ts` is the only file to fix; the test fixture is synthetic.
- Exclusions match word prefixes (`huelle` hits `Hüllen`), not compound suffixes (`Schutzhülle`). The AI layer covers that; a German decompounder would be better.
- Pending free-text confirmations live in memory and are lost on restart (harmless: the user gets "request expired").
- Scraping is subject to the marketplace's terms. Keep request rates low and do not resell the data.

## Roadmap to a product

1. **Payments:** Telegram Stars (`sendInvoice`, currency `XTR`) for Pro, monthly subscription, `pre_checkout_query` handler, plan expiry column.
2. **More sites:** Kleinanzeigen.de, eBay, Vinted, Avito; per-site lexicons; one watch across several sites.
3. **i18n:** de/en/uk/ru by `language_code`; strings are already isolated in `bot/format.ts`.
4. **Price intelligence:** keep listing history per query to show "15% below the median for the last 30 days", which gives a better deal score than the model's guess.
5. **Speed as a paid feature:** Pro checks every minute; later, priority queue and proxy pool.
6. **Scale:** move from SQLite to Postgres and run the poller as separate workers with a job queue once there are more than ~2k active watches; Telegram webhook instead of long polling.
7. **Observability:** Sentry, uptime ping, a parser-health alert when a site returns 0 listings for every watch.
8. **Growth:** referral deep links (`?start=ref_<id>`) giving bonus Pro days; shareable watches.
