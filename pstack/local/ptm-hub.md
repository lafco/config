## This hub: skills that are not vendored

`create-skill` is Cursor's built-in. `deslop`, `control-cli`, and `control-ui` come from the `cursor-team-kit` plugin. None of the four is installed here. When a trigger names one, put the skip in one line and keep going:

`Skipped (not installed here): <skill>. <step you ran instead, or why none applies>.`

Do not stop, ask, or invent the skipped skill's rules.

- `create-skill`: follow `playbooks/authoring-a-skill.md`, plus the harness's own skill-authoring docs.
- `deslop`: run `/no-comments` and the **unslop** pass over the diff. That is not a substitute, so say so in the line.
- `control-ui`: drive the real surface with the harness's browser or preview tools.
- `control-cli`: run the CLI and paste the real transcript.

Principles are sibling skills (`../principle-<kebab-title>/SKILL.md`), not a `principles/` directory. If a sibling skill is missing from this copy, say so and go on without citing it. Never reconstruct a principle's rule from its name.
