# judeurban.github.io

## Guest roles

Assign one of these exact role values in `people.csv`. Invitation access is configured in `wedding_party.json`:

| Role | Kickball | Rehearsal | Welcome party | Wedding arrival |
| --- | --- | --- | --- | --- |
| `wedding_party` | 7 PM | 4 PM | 6:30 PM | Full day, 9 AM |
| `friends` | 7 PM | Not shown | 6:30 PM | Regular, 4:30 PM |
| `out_of_state_family` | Not shown | Not shown | 6:30 PM | Regular, 4:30 PM |
| `ceremony_party` | Not shown | 4 PM | 6:30 PM | Early, 3 PM |
| `local_guest` | Not shown | Not shown | Not shown | Regular, 4:30 PM |
| `vendor` | Not shown | Not shown | Not shown | Regular, 4:30 PM |

Wedding-day details are controlled in `events/sunday-wedding-day.md`. To add a local guest, use `local_guest` as the CSV role value.

GitHub Pages note: keep `.nojekyll` at the repository root. The site fetches the Markdown event sources directly in the browser, so GitHub Pages must serve those `.md` files as static assets instead of processing them with Jekyll.

## Weather

Each event Markdown file includes a `weatherDate` and `weatherZip`. The page requests the latest daily forecast from Open-Meteo on each refresh, using the ZIP code to locate the event. Forecasts are available up to 16 days ahead; before that window opens, the event shows a short availability message instead of guessed weather.
