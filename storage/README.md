# AI Persistence Storage

Ez a mappa az AI külön tudásrétege.

Tartalma:
- journal/ -> trade események
- market/ -> piaci snapshotok
- datasets/ -> külön tanító készletek
- models/ -> modellverziók és aktív modell
- performance/ -> teljesítmény metaadatok
- snapshots/ -> kézi mentések

Fontos:
- Render free környezetben ez a fájlrendszer nem garantáltan tartós deployok között.
- A struktúra és az összeolvasztás készen van, de a valódi tartós megőrzéshez volume vagy külső storage kell.
