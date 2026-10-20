# Fixture attribution

The bundled `fixtures/f1db-2021-design-sample.json` is a selected subset of
[F1DB release v2026.17.0](https://github.com/f1db/f1db/releases/tag/v2026.17.0),
commit `3c980fd5`, licensed under
[Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/).
Attribution: **F1DB by Marcel Overdijk and contributors**.

The fixture contains a single 2021 season's 22 calendar events, event/session
results and championship standings, plus historical aggregate summaries for
Lewis Hamilton, Max Verstappen, Mercedes and Red Bull. It is a transformed
subset; the full F1DB SQLite archive is not bundled. F1DB's official short
driver names are used in the app. The existing style color-key labels
`Red Bull Racing` and `Haas F1 Team` are used for those two visible team names;
the original F1DB constructor names are retained in `f1db_name` fixture fields.
For scoring sessions, a null points field is represented as zero points so
non-scoring classified entrants remain in the standings; practice and
qualifying have no championship-points value.

Source hashes recorded in the fixture:

- Release ZIP SHA-256: `7de55fe0660aae51604c036720b5f02a15e5224b8e66044080e4a657aea88af6`
- Extracted F1DB database SHA-256: `77173e1b697f382c36ceeb4c45a03102c6e1ac3db7cc7d39fcffaf43caa67bbe`

The app source, fonts, icon references and existing CSS/assets are inherited
from the frozen production source copy. No driver photographs or team logos
have been added.
