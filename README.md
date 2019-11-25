# LoL Stats

1-year coursework at university, app that collects &amp; analyzes League of Legends matches statistics

*Written in May - June 2018 to practice JS skills*

## Get started

1. Restore DB scheme
2. Set correct environment variables

ENV variable | Description
--- | ---
DB_USER | User for PostgreSQL DB
DB_PASSWORD | Password for PostgreSQL DB
API_KEY | Riot API key

4. Go to ```src/DB.js``` and change connection.host to your PostgreSQL host
3. Install node modules & execute ```node main.js```

## Usage

To log in use following default auth data (or change **SHA-256** hashes in ```src/Auth.js```)

Username | Password
--- | ---
admin | admin

If it is the first launch:
1. Click **Update rate limits**  
2. Then **Add LeagueIDs from featured games** to get some new LeagueIDs.
3. And **Add summoners from current LeagueID** to get new summoners.

After few iterations you will have enough summoners to collect their matches. When matches are analyzed all teammates of a summoner are added to DB so you don't have to use above scripts in the future.

Use **Start standard loop** to collect & analyze matches.
