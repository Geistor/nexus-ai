# ALL-IN V2 áttekintés

## Mit tartalmaz ez a csomag

Ez az összevont csomag egy működő alapot ad a következőkhöz:

- UI restore + teljes fő dashboard
- exchange kapcsolat panelek
- paper / staging / live módok
- execution teszt és backend API
- Supabase alapú perzisztencia
- renderes deploy alapkonfig
- state / trade / model tárolás
- order lifecycle és execution bus kiindulási réteg

## Fontos

Ez egy integrált fejlesztői csomag. Éles használat előtt mindig:

1. paper módban tesztelj
2. ellenőrizd az összes kulcsot és endpointot
3. nézd át a logokat Renderben
4. kapcsold be külön a live funkciókat
5. csak whitelistelt symbolokkal indulj

## Ajánlott első ellenőrzés

- `/api/health`
- `/api/system/snapshot`
- dashboard betöltődik-e
- Supabase táblák elérhetők-e
- AI mentés / távoli sync működik-e
