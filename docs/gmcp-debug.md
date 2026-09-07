# GMCP Debug

Enable the session-only GMCP viewer from **Settings → Help → Debug** by checking
**Enable GMCP Debug** and applying the change. The setting is saved with the
other client preferences. Enabling it adds **GMCP Debug** to the System Panels
menu and opens a transient panel; disabling it closes the panel and removes the
Panels entry.

The viewer keeps the latest 200 inbound, canonicalized GMCP entries in memory.
Each payload is formatted as text, capped at 16 KiB, and recursively redacts
values whose key is `password`, `passwd`, `passphrase`, `token`, `secret`,
`authorization`, or `cookie` (case-insensitive). Entries are not persisted,
sent, or logged by the viewer.

Map Summary and Map Export inspect only the active world's authoritative
MapData2 cache. Clear Map deletes that shared world-keyed authoritative cache
for every character using it. It cannot be undone locally; export is diagnostic
evidence, not an importable backup. Confirm the prompt only when server resync
or relearning is an acceptable recovery path.
