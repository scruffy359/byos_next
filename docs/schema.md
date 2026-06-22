# Database Schema

[Schema (Mermaid)](schema.mmd)

## Enums

| Enum                  | Values                                                                        |
| --------------------- | ----------------------------------------------------------------------------- |
| `device_display_mode` | `screen`, `playlist`, `mixup`                                                 |
| `mixup_layout_id`     | `quarters`, `top-banner`, `left-rail`, `vertical-halves`, `horizontal-halves` |
| `recipe_type`         | `react`, `liquid`                                                             |

## RLS Summary

Row Level Security is enforced on: `devices`, `playlists`, `playlist_items`, `mixups`, `mixup_slots`, `screen_configs`, `recipes`, `recipe_files`, `plugin_settings`. All policies scope rows to `app.current_user_id`. Shared/system rows (`user_id IS NULL`) are readable but only writeable via privileged seed flags.
