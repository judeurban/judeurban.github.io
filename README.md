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

Each event Markdown file includes a `weatherDate`, `weatherLat`, and `weatherLon`. A scheduled GitHub Actions workflow requests the matching daily forecast from OpenWeather One Call API 4.0 and publishes only the required forecast fields in `weather.json`; the browser never receives the API key or raw API response. One Call 4.0 supports daily forecasts up to 1.5 years ahead and requires its separate One Call subscription.

To enable weather updates, create a GitHub Actions environment named `weather-data`, add an environment secret named `OPENWEATHER_API_KEY`, and restrict that environment to the `main` branch. In repository Settings > Pages, set the publishing source to **GitHub Actions**. The workflow refreshes the forecast every six hours and on pushes to `main`. The local `.secrets` file is ignored and is not used by the published site.
