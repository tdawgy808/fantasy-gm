# Personalized available players and refresh modes

## Available tab

Recommended is the default and reads the existing Waiver Scout results (five initially, expandable to ten). The same ranking is used by Daily Briefing and GM Summary. It compares eligible unlocked starting slots and same-position bench depth, positional availability concerns, explicitly imported opportunity trends and comparable ROS/playoff inputs. Win Now emphasizes immediate help, Balanced mixes supported future/depth inputs, and Upside emphasizes supported trends/future value. It does not compare raw QB points to raw RB/WR points.

Drops are advisory, unlocked bench players only. Sole unrelated healthy coverage, known superior season value, and an imminent bye replacement are protected. Inactive players can still carry keeper or handcuff value, so confirm context. Missing roster capacity or a safe drop is reported. Bids are low-confidence budget-allocation estimates, not predicted winning bids; unknown balance/rules or a balance below the minimum suppresses the estimate. Existing projections never become invented ROS values.

All Players preserves the imported projection list, search, position filter and FA/waiver indicator. Analyze for my roster opens the existing result, or requests recalculation for a newly imported player. Evidence includes sources, publication/retrieval times, model factors and missing-data warnings.

## Choosing a refresh

`Refresh Fantasy` should use Daily Targeted Refresh when a current-week comprehensive baseline exists. Use Weekly Comprehensive Refresh at the beginning of a new week, when the baseline exceeds seven days, when league rules change, or when a complete roster/availability reconciliation cannot be established. No task runs automatically. Collection uses the authorized browser and permitted public sources, never the unapproved Yahoo API or Yahoo transactions.

### Daily Targeted Refresh

1. Read the saved snapshot and GET `/api/manual/refresh` in the authenticated owner workflow (or download its targeted collection plan in Data Coverage). The plan uses the Waiver Scout to nominate up to 25 candidates; a smaller known pool produces fewer. It does no collection itself.
2. Check recent transactions and current position leaders for newly available players, recent additions and emerging opportunities. Do not paginate the full pool again just to reproduce unchanged records. Reconcile complete owner and opponent rosters, including bench/IR/K/DEF. Also collect any other complete roster affected by detected transactions, or use a comprehensive refresh when ownership is uncertain. An addition still owned by an unchanged imported roster is rejected, prompting reconciliation.
3. Check current projections and explicit injury/game/active designations for the owner, opponent and candidate set. Check the owner's FAAB balance on the roster page. Capture the matchup forecast if updating it. Missing projections remain missing; their previous timestamps never advance simply because the daily bundle was imported.
4. Scan official injury/inactive announcements for owner/opponent teams on every daily refresh, even when reports are cached. A scan of a shared report can cover many players. Investigate new reports, changed/flagged players, stale checks, insufficient evidence and games played since saved usage. Reuse unchanged relevant statistics and previously retrieved reports with original dates; do not reopen every player article. Missing/restricted evidence is an explicit coverage limitation, not a health confirmation. At kickoff, use the official inactive list; an older expected-to-play report cannot replace it.
5. Import the explicit daily updates below, read back the authenticated receipt/snapshot, and verify its ID. Then Refresh Analysis recalculates the latest stored inputs. It performs no web research.

The collection plan tracks research-check times independently from source publication/retrieval. Flagged players always require a current check; critical official-report scans are never waived by caching. General research checks use 24 hours, injury report retrieval uses six hours for prioritization, usage uses seven days or a subsequent recorded game, and historical games retain their original dates. These are collection priorities, not claims that cached information is still correct. No matching report means unavailable information, not confirmed health.

### Weekly Comprehensive Refresh

Follow the full checklist in `comprehensive-refresh.md`: all ten complete rosters, complete declared available-player scope and pagination, standings, remaining schedule, transactions/accepted bids, balances, rules/scoring, and broader usage/research. A validated weekly import replaces pool membership, so it can detect players no longer available. A partial weekly collection keeps the prior valid Yahoo source. This remains envelope schema version 1.

## Daily JSON contract

Envelope schema version 2 uses these fields:

| Field | Meaning |
| --- | --- |
| `mode` | `daily` |
| `base_captured_at` | Exact current stored snapshot capture; stale bases reject |
| `captured_at`, `week` | Actual new capture time and same week; new weeks require comprehensive collection |
| `roster_updates` | Complete TeamInput records for owner, opponent and any other changed team; omitted teams persist |
| `player_updates` | Player IDs and explicitly observed fields; omitted fields persist, null clears a field; new IDs require name, position and eligibility |
| `availability_checked_ids` | IDs with explicitly observed `status` in player_updates, including null for no designation; required for every updated roster player |
| `availability_updates` | Explicit `{player_id,state}` with FA, W, or unavailable; omission never deletes membership |
| `faab_remaining`, `matchup` | Optional verified owner budget and full Yahoo matchup record; omission retains original field dates |
| `research` | Existing research envelope with only new/updated findings, or null to retain previous research |
| `collection` | Sources, limitations, researched_player_ids and research_target_ids; checked IDs must belong to known players and targets |

Each roster update replaces that team's complete membership, while individual player updates are patches. Omitted available players persist. Newly rostered IDs are removed from availability; a former roster member becomes available only after an explicit availability observation. Full merged validation still rejects duplicate ownership, credentials, malformed records and wrong identity. All updates, research and coverage save with the existing conditional private write; stale bases and conflicts cannot overwrite newer state. A failed import records failure and retains successful sources and recommendations.

Per-field dates live in `data_freshness`, not in source retrieval metadata. A targeted receipt is always Partial and identifies its weekly baseline, checked counts and retained scope. Retained projections older than 24 hours are excluded from numeric recommendations. An expired retained FAAB balance cannot produce a bid. The matchup retains its own capture time, so a daily injury import does not relabel an old forecast as fresh. Historical and source records retain original dates.

## Validation and release

Run tests, lint, build and the publication audit. Synthetic tests cover merges, omitted availability, ownership/credential rejection, week changes, weekly pool replacement, stale projections, budget/rule gaps, relative position ranking, protected drops, reusable research and recalculation from stored inputs. Browser review covers Recommended, All Players search/filter, player evidence, strategy refresh and mobile layout. Real league fixtures and screenshots remain ignored/private. Deployment and authentication are unchanged; no additional account or environment variable is needed. Production release requires owner approval.
