# Phase 2 Designer Guide

## Tuning

- Edit HP and damage first: enemy `hp` changes time-to-kill while `atk` changes punishment.
- Keep early player DPS near `25-40` at minute 1 and `130-180` by minute 5.
- Increase `xp_reward` or reduce class `hp_growth_per_level` only after checking level pace.
- Use `cooldown`, `power`, and `status_effects` in `abilities.csv` to shape build identity.
- For loot, edit `loot_table` in `enemy_types.csv`; every id must exist in `items.csv`.

## Images

Every image field must either reference a key in `image_map.json` or be `MISSING_IMAGE`.

## Quick Update

Change one stat in the relevant CSV, then run the validation script from the project root if available or repeat the checklist manually.
