# Chains playtest guide

**Play:** https://chains-disc-golf.vercel.app (phone or desktop, no install, no account)

On a phone, add it to your Home Screen for full screen: Safari → Share → *Add to Home Screen*; Chrome → ⋮ → *Add to Home screen*. On iPhone, turn alerts for invite matches only work from the Home Screen app.

## Three ways to play together

| Mode | Use it when | How |
|---|---|---|
| **Live room** | Everyone is playing at the same time | Clubhouse → **Friends** → **Live room** → *Create a room* → **Send invite link** (phones open the share sheet; desktops copy the link). Friends tap the link and press *Join*. The host adds bots if wanted and taps **Start round**. Up to 12 players. |
| **Invite match** | People play when they can (GamePigeon-style) | Clubhouse → **Friends** → **New match** → share the link. Each player plays a whole hole on their turn; the next player gets a ping. Works on any network. |
| **Pass & play** | One phone, passed around | Clubhouse → **Pass & play**, add players and bots. |

**Live room rules of thumb**

- The host's game must stay open and on screen for the whole round. If the host closes it, the room ends.
- A player who drops keeps their seat for 30 seconds, then a bot takes over; reopening the link reclaims it.
- Players on different networks connect directly to the host. Home Wi-Fi to home Wi-Fi usually works. If a friend on cellular data sees *"Couldn't reach the host"*, have them switch to Wi-Fi, or play an **invite match** instead (it works on any network). A relay server fixes this permanently; see *Setup still needed* below.

## Controls

**Phone:** two thumbs. One finger drags the view to aim (on its side, the left part of the screen is the aim side), the other swipes the throw (the lower pad, or the right part of the screen on its side). Either can go first, and you can keep fine-tuning the aim while you swipe. The swipe direction has to match the throw (backhand →, forehand ←, tomahawk ↓, putt ↑ and so on, shown on screen). A longer swipe throws harder: full power is one comfortable thumb stroke, and it is always reachable from wherever you start. Slow drags aim finely, quick ones turn fast. Finishing a little low or high adds hyzer or anhyzer. Tap *Throw* / *Disc* to change equipment. A good throw gets the group clapping; a bad one gets a *womp womp*.

**Desktop:** the same mouse swipes work, or hold **Space** to charge and release to throw, **arrows / WASD** to aim, **1–4** for discs, **Q / E** to cycle throws, **T** to aim at the basket, **O** for the overview, **Esc** to cancel.

**Graphics:** *Mobile* (default on phones) or *Desktop* (default on computers) in the clubhouse. Phones should stay on Mobile: Desktop draws several times as much and stutters on a phone.

**Full screen on iPhone:** Safari can't hide its bars for a web game. Add Chains to the Home Screen (Share → *Add to Home Screen*) and open it from the icon for true full screen, in portrait or on its side. On Android, the course tools menu (☰) has a *Full screen* button.

## What to report

Send it to the group chat with:

1. Phone/computer and browser (for example *iPhone 15, Safari* or *Pixel 8, Chrome*)
2. Which mode (solo, live room, invite match, pass & play) and which course/hole
3. What happened and what you expected; a screenshot or screen recording helps a lot

**Frame rate:** open https://chains-disc-golf.vercel.app/?fps=1 and play Pine Hollow hole 1 in Mobile and in Desktop. The counter sits bottom-left. Note the numbers with your phone model.

## Setup still needed (host/owner)

- **Relay for live rooms on cellular (TURN):** add Cloudflare Realtime TURN keys (`CLOUDFLARE_TURN_KEY_ID`, `CLOUDFLARE_TURN_KEY_API_TOKEN`) or any TURN service (`TURN_URLS`, `TURN_USERNAME`, `TURN_CREDENTIAL`) in the Vercel project's environment variables, then redeploy. `https://chains-disc-golf.vercel.app/api/ice` should then return `"relay": true`.
- **Invite-match storage budget:** matches live in a Vercel Blob store. On the Hobby plan Blob allows 10,000 reads a month and locks the store for 30 days if that runs out. Polling now asks a CDN-cached "anything new?" question (cached 8 s, shared by everyone in the match) and backs off when a match sits idle, so an open match costs at most about 450 reads an hour, and far fewer while idle. Keep an eye on *Vercel → Storage → Blob → Usage* during big playtests.
