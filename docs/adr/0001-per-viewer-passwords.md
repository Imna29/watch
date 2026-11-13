# Per-Viewer passwords instead of accounts

The site exists for exactly two people, Giorgi and Mariam, so it has no accounts, sign-up or auth library: each Viewer has their own password, stored hashed in server config, and the password typed at login decides who you are. Accounts with an email allowlist were more machinery than two people need, and a single shared site password couldn't tell the Viewers apart, which personal lists, presence and "Mariam paused" messages depend on.

## Consequences

- Adding a third person is a code change, not a sign-up.
- Changing a password means updating server config; it signs out only that Viewer's devices.
