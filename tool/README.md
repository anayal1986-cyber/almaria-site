# Harnesses for the published console

    npm i playwright
    node tool/check_live_costs.mjs      # signed in
    node tool/check_offline.mjs         # signed out, both languages

Both drive `admin.html` in a real browser with the network intercepted. No
Supabase project is contacted and no password is involved: the session is an
unsigned JWT carrying the one claim the console checks, forged in the browser
and never sent anywhere.

## What `check_live_costs.mjs` is for

On 29 August 2026 Ahmed signed into the console and the maintenance page went
blank. It was not a bug in what had just been imported — the hundred cost
lines were in Postgres and correct. It was that `LIVE.paint()` cleared the job
list and refilled it from `work_orders`, which has no rows, while
`building_costs` was a table the live layer had never been told about. That
layer was written a week before the registers were found.

The result was the worst possible shape: **connecting to the real database made
the console show less than not connecting to it.** Seventeen assertions now
stand against that, and they were checked against the old code before being
trusted — eight of them fail on it, including the one that reproduces exactly
what was on screen.

The assertions are about behaviour, not about source text: what is on the page,
what it totals, and — the half that matters — what it does *not* carry. An
invoice line must arrive with no response target, no time to close and no
breach verdict, because the registers record none of those. The database
refuses to store them (`check_building_costs.sh`); this refuses to display
them.

## What is NOT covered

This repository has no CI, so nothing runs these on push. They are run by hand
before publishing. Wiring them to a workflow needs a token scope this project
has deliberately not held.

## Fixtures

`costs.json` and `units.json` are the real shape and the real figures — 100
lines, SAR 334,019.00, 6 naming a flat, 47 naming a supplier — and no resident
of the building appears in either. The one tenancy the signed-in test needs is
invented inside the test file and labelled as invented.
