# Fantasy GM

Fantasy GM is a personal, noncommercial Yahoo Fantasy Football assistant intended for one user's own leagues.

## Project status

This project is in planning and development. This repository documents the intended application for a Yahoo Fantasy Sports API access application; it does not yet contain a working integration.

## Planned features

- **Read-only league analytics:** Review authorized league settings, rosters, standings, matchups, and available player statistics.
- **Lineup recommendations:** Suggest starters and bench options based on league scoring, roster eligibility, and available data.
- **Waiver analysis:** Evaluate available players and potential pickups against the user's roster needs.
- **Trade analysis:** Compare proposed trades and their potential effect on roster balance and team performance.

All recommendations are advisory. The user makes and submits any lineup changes, waiver claims, or trades directly in Yahoo Fantasy Football. The application will not automatically change rosters or execute transactions.

## Intended use and access

- One user, for personal use in leagues they are authorized to access.
- Noncommercial: no paid service, advertising, or resale of Yahoo data.
- Request read-only Fantasy Sports access and retrieve only the data needed for the features above.
- No public user registration or distribution of private league data.

## Privacy and credentials

Yahoo authorization will use OAuth. Client secrets, access tokens, refresh tokens, authorization codes, and private league data must remain outside this public repository. Keep secrets in local environment variables or another private credential store. Do not commit environment files, credential files, API responses, or logs containing personal data.

The public repository contains project documentation only. Authentication and private league data are not published here.

## Disclaimer

Fantasy GM is an independent personal project and is not affiliated with or endorsed by Yahoo or the NFL. API use is subject to Yahoo's applicable terms and approval. Recommendations do not guarantee fantasy outcomes.
